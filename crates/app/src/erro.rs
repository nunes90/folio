//! O erro que um comando devolve à página (M40a): `{ tipo, mensagem }`.
//!
//! Antes, todo erro chegava como texto, e a página não tinha como separar "já existe uma coleção
//! com esse nome" (o usuário corrige no próprio campo) de "erro no banco" (não é culpa do que ele
//! digitou) sem comparar frases. Agora o `tipo` diz a categoria e a `mensagem` continua sendo a
//! frase para mostrar. A causa técnica vai para o log, como antes.

use folio_core::biblioteca::ErroBiblioteca;
use folio_core::copia::ErroCopia;
use folio_core::voz::ErroVoz;
use serde::Serialize;

/// As categorias que a página distingue. Poucas de propósito: só entra aqui o que muda o que a
/// interface faz ou pode vir a fazer; o resto é `Outro`.
///
/// `rename_all = "kebab-case"`: `NomeEmUso` vira `"nome-em-uso"` no JSON.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tipo {
    /// Já existe uma coleção com esse nome.
    NomeEmUso,
    /// O nome ficou vazio.
    NomeVazio,
    /// O livro, a coleção, o destaque ou a sessão não existe (mais).
    NaoEncontrado,
    /// O arquivo não é um EPUB ou PDF que se consiga ler.
    LivroInvalido,
    /// O arquivo não é uma cópia de segurança que se consiga restaurar.
    CopiaInvalida,
    /// Ler ou gravar no disco falhou (permissão, disco cheio, arquivo que sumiu).
    Arquivo,
    /// O banco da biblioteca falhou.
    Banco,
    /// A leitura em voz alta.
    Voz,
    Outro,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErroDoComando {
    pub tipo: Tipo,
    /// Uma frase para o usuário.
    pub mensagem: String,
}

impl ErroDoComando {
    pub fn novo(tipo: Tipo, mensagem: impl Into<String>) -> Self {
        Self {
            tipo,
            mensagem: mensagem.into(),
        }
    }
}

// `Display` e `Error`: o `setup` do app usa `?` num destes erros, e o `?` só o converte em
// `Box<dyn Error>` se o tipo for um erro de verdade. O `impl Error` vazio basta (não há causa).
impl std::fmt::Display for ErroDoComando {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.mensagem)
    }
}

impl std::error::Error for ErroDoComando {}

// Com estes dois `From`, um comando continua podendo escrever `Err("frase".into())` e
// `.ok_or("frase")?`: o `?` chama `From::from` no erro, e a frase solta vira um erro `Outro`.
impl From<&str> for ErroDoComando {
    fn from(mensagem: &str) -> Self {
        Self::novo(Tipo::Outro, mensagem)
    }
}

impl From<String> for ErroDoComando {
    fn from(mensagem: String) -> Self {
        Self::novo(Tipo::Outro, mensagem)
    }
}

/// Um erro do core que sabe em que categoria cai.
///
/// É um trait daqui (do app) implementado para tipos do core: a regra do órfão permite, porque o
/// trait é local. Assim o core continua sem saber que existe uma página.
pub trait Tipado {
    fn tipo(&self) -> Tipo;
}

// Os `match` não têm o braço `_` de propósito: uma variante nova no core não compila aqui até
// alguém decidir a categoria dela.
impl Tipado for ErroBiblioteca {
    fn tipo(&self) -> Tipo {
        match self {
            Self::Banco(_) => Tipo::Banco,
            Self::Abrir(erro) => erro.tipo(),
            Self::Epub(_) | Self::Pdf(_) => Tipo::LivroInvalido,
            Self::NaoEncontrado(_)
            | Self::ColecaoNaoEncontrada(_)
            | Self::DestaqueNaoEncontrado(_)
            | Self::SessaoNaoEncontrada(_) => Tipo::NaoEncontrado,
            Self::NomeDeColecaoVazio => Tipo::NomeVazio,
            Self::ColecaoJaExiste(_) => Tipo::NomeEmUso,
            Self::DestaqueSemTrecho | Self::DestaqueSemLocal => Tipo::Outro,
            Self::Io { .. } | Self::Leitura { .. } => Tipo::Arquivo,
        }
    }
}

impl Tipado for folio_core::livro::ErroAbrir {
    fn tipo(&self) -> Tipo {
        match self {
            Self::Io { .. } => Tipo::Arquivo,
            Self::Formato(_) => Tipo::LivroInvalido,
        }
    }
}

impl Tipado for ErroCopia {
    fn tipo(&self) -> Tipo {
        match self {
            Self::Biblioteca(erro) => erro.tipo(),
            Self::Banco(_) => Tipo::Banco,
            Self::NaoECopia | Self::VersaoMaisNova | Self::Danificada(_) => Tipo::CopiaInvalida,
            Self::Io { .. } => Tipo::Arquivo,
        }
    }
}

impl Tipado for ErroVoz {
    fn tipo(&self) -> Tipo {
        Tipo::Voz
    }
}

/// Converte o erro do core no que vai para a página, depois de mandá-lo ao log (o `tracing`
/// grava a cadeia de causas, que não aparece na mensagem).
///
/// `E: std::error::Error + Tipado + 'static`: o genérico é resolvido na compilação (uma cópia da
/// função por tipo de erro); o `'static` é o que deixa emprestar o erro como `&dyn Error` ao log.
pub fn registrar<E>(erro: &E) -> ErroDoComando
where
    E: std::error::Error + Tipado + 'static,
{
    tracing::warn!(erro = erro as &dyn std::error::Error, "comando falhou");
    ErroDoComando::novo(erro.tipo(), erro.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn o_erro_vai_para_a_pagina_com_tipo_e_mensagem() {
        let erro = registrar(&ErroBiblioteca::ColecaoJaExiste("Ficção".into()));
        assert_eq!(
            serde_json::to_value(&erro).unwrap(),
            serde_json::json!({
                "tipo": "nome-em-uso",
                "mensagem": "já existe uma coleção chamada “Ficção”",
            })
        );
    }

    #[test]
    fn cada_erro_cai_na_sua_categoria() {
        assert_eq!(ErroBiblioteca::NomeDeColecaoVazio.tipo(), Tipo::NomeVazio);
        assert_eq!(
            ErroBiblioteca::NaoEncontrado("abc".into()).tipo(),
            Tipo::NaoEncontrado
        );
        let disco = ErroBiblioteca::Io {
            caminho: "/x".into(),
            fonte: std::io::Error::other("disco cheio"),
        };
        assert_eq!(disco.tipo(), Tipo::Arquivo);
        assert_eq!(ErroCopia::NaoECopia.tipo(), Tipo::CopiaInvalida);
        assert_eq!(ErroVoz::Encerrado.tipo(), Tipo::Voz);
    }

    #[test]
    fn o_erro_de_dentro_decide_a_categoria() {
        // A cópia de segurança embrulha o erro da biblioteca: a categoria é a dele.
        let erro = ErroCopia::Biblioteca(ErroBiblioteca::NaoEncontrado("abc".into()));
        assert_eq!(erro.tipo(), Tipo::NaoEncontrado);
        let formato =
            folio_core::livro::ErroAbrir::Formato(folio_core::formato::ErroFormato::Vazio);
        assert_eq!(ErroBiblioteca::Abrir(formato).tipo(), Tipo::LivroInvalido);
    }

    #[test]
    fn uma_frase_solta_vira_outro() {
        let erro: ErroDoComando = "modelo desconhecido".into();
        assert_eq!(
            erro,
            ErroDoComando::novo(Tipo::Outro, "modelo desconhecido")
        );
    }
}
