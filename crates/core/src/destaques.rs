//! Destaques e notas (M16): trechos marcados com uma cor e, se quiser, uma nota.
//!
//! O core não sabe interpretar o `local` (no EPUB, um CFI de intervalo; no PDF, o formato vem
//! no M16c): só o guarda e o devolve. A ordem de leitura vem de `posicao` (0.0 a 1.0 no livro),
//! que o leitor calcula; assim a ordenação é a mesma para os dois formatos.
//!
//! As operações estão num segundo `impl Biblioteca`, aqui: o Rust permite vários blocos `impl`
//! para o mesmo tipo dentro do crate, e os campos usados (`conexao`, `relogio`) são
//! `pub(crate)`, visíveis neste módulo e invisíveis para quem usa o crate.

use std::path::Path;

use rusqlite::{OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use tracing::instrument;

use crate::biblioteca::{Biblioteca, ErroBiblioteca, Resultado, gravar};

/// As cores do marca-texto. Na interface, a cor nunca é a única informação: o nome dela vai
/// junto (leitor de tela, painel de destaques).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Cor {
    #[default]
    Amarelo,
    Verde,
    Azul,
    Rosa,
}

impl Cor {
    pub fn como_texto(self) -> &'static str {
        match self {
            Cor::Amarelo => "amarelo",
            Cor::Verde => "verde",
            Cor::Azul => "azul",
            Cor::Rosa => "rosa",
        }
    }

    /// Texto desconhecido (ex.: uma cor de uma versão futura) vira o padrão, amarelo: um
    /// destaque nunca some por causa da cor.
    pub fn de_texto(texto: &str) -> Self {
        match texto {
            "verde" => Cor::Verde,
            "azul" => Cor::Azul,
            "rosa" => Cor::Rosa,
            _ => Cor::Amarelo,
        }
    }
}

/// Um destaque como a interface o vê.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Destaque {
    pub id: i64,
    pub livro_id: String,
    /// Onde o trecho está: no EPUB, um CFI de intervalo.
    pub local: String,
    pub trecho: String,
    pub cor: Cor,
    pub nota: Option<String>,
    /// Título da seção (do índice) em que o trecho está, se houver.
    pub capitulo: Option<String>,
    /// 0.0 a 1.0 no livro: a ordem de leitura.
    pub posicao: f64,
    pub criado_em: i64,
    pub atualizado_em: i64,
}

/// O que o leitor manda para criar um destaque.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovoDestaque {
    pub local: String,
    pub trecho: String,
    #[serde(default)]
    pub cor: Cor,
    #[serde(default)]
    pub nota: Option<String>,
    #[serde(default)]
    pub capitulo: Option<String>,
    pub posicao: f64,
}

/// Aparado; vazio vira `None` (apagar o texto da nota apaga a nota).
fn texto_opcional(texto: Option<&str>) -> Option<String> {
    texto
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
}

/// Fora de 0..1 é cortado; NaN (o leitor não soube calcular) vira 0.
fn posicao_valida(posicao: f64) -> f64 {
    if posicao.is_nan() {
        0.0
    } else {
        posicao.clamp(0.0, 1.0)
    }
}

const SELECT_DESTAQUE: &str = "
    SELECT id, livro_id, local, trecho, cor, nota, capitulo, posicao, criado_em, atualizado_em
    FROM destaques";

fn destaque_da_linha(linha: &Row) -> rusqlite::Result<Destaque> {
    let cor: String = linha.get("cor")?;
    Ok(Destaque {
        id: linha.get("id")?,
        livro_id: linha.get("livro_id")?,
        local: linha.get("local")?,
        trecho: linha.get("trecho")?,
        cor: Cor::de_texto(&cor),
        nota: linha.get("nota")?,
        capitulo: linha.get("capitulo")?,
        posicao: linha.get("posicao")?,
        criado_em: linha.get("criado_em")?,
        atualizado_em: linha.get("atualizado_em")?,
    })
}

/// Erro de chave estrangeira (o livro não existe) vira `NaoEncontrado`.
fn livro_inexistente(erro: rusqlite::Error, livro: &str) -> ErroBiblioteca {
    match erro {
        rusqlite::Error::SqliteFailure(e, _)
            if e.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            ErroBiblioteca::NaoEncontrado(livro.to_owned())
        }
        e => e.into(),
    }
}

impl Biblioteca {
    /// Cria um destaque no livro. Trecho e local não podem ficar vazios.
    #[instrument(skip(self, novo), fields(posicao = novo.posicao))]
    pub fn criar_destaque(&self, livro: &str, novo: NovoDestaque) -> Resultado<Destaque> {
        let trecho = novo.trecho.trim();
        if trecho.is_empty() {
            return Err(ErroBiblioteca::DestaqueSemTrecho);
        }
        if novo.local.trim().is_empty() {
            return Err(ErroBiblioteca::DestaqueSemLocal);
        }
        let agora = (self.relogio)();
        self.conexao
            .execute(
                "INSERT INTO destaques
                     (livro_id, local, trecho, cor, nota, capitulo, posicao, criado_em, atualizado_em)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                params![
                    livro,
                    novo.local,
                    trecho,
                    novo.cor.como_texto(),
                    texto_opcional(novo.nota.as_deref()),
                    texto_opcional(novo.capitulo.as_deref()),
                    posicao_valida(novo.posicao),
                    agora,
                ],
            )
            .map_err(|e| livro_inexistente(e, livro))?;
        self.destaque(self.conexao.last_insert_rowid())
    }

    /// Os destaques do livro na ordem de leitura (e, no mesmo lugar, na ordem de criação).
    pub fn listar_destaques(&self, livro: &str) -> Resultado<Vec<Destaque>> {
        let mut consulta = self.conexao.prepare(&format!(
            "{SELECT_DESTAQUE} WHERE livro_id = ?1 ORDER BY posicao, criado_em, id"
        ))?;
        let destaques = consulta
            .query_map([livro], destaque_da_linha)?
            .collect::<Result<_, _>>()?;
        Ok(destaques)
    }

    /// Um destaque pelo id.
    pub fn destaque(&self, id: i64) -> Resultado<Destaque> {
        self.conexao
            .query_row(
                &format!("{SELECT_DESTAQUE} WHERE id = ?1"),
                [id],
                destaque_da_linha,
            )
            .optional()?
            .ok_or(ErroBiblioteca::DestaqueNaoEncontrado(id))
    }

    #[instrument(skip(self))]
    pub fn definir_cor_do_destaque(&self, id: i64, cor: Cor) -> Resultado<Destaque> {
        self.atualizar_destaque(
            "UPDATE destaques SET cor = ?1, atualizado_em = ?2 WHERE id = ?3",
            params![cor.como_texto(), (self.relogio)(), id],
            id,
        )
    }

    /// Define a nota; `None` ou só espaços apagam a nota (o destaque fica).
    #[instrument(skip(self, nota))]
    pub fn definir_nota_do_destaque(&self, id: i64, nota: Option<&str>) -> Resultado<Destaque> {
        self.atualizar_destaque(
            "UPDATE destaques SET nota = ?1, atualizado_em = ?2 WHERE id = ?3",
            params![texto_opcional(nota), (self.relogio)(), id],
            id,
        )
    }

    fn atualizar_destaque(
        &self,
        sql: &str,
        parametros: impl rusqlite::Params,
        id: i64,
    ) -> Resultado<Destaque> {
        if self.conexao.execute(sql, parametros)? == 0 {
            return Err(ErroBiblioteca::DestaqueNaoEncontrado(id));
        }
        self.destaque(id)
    }

    /// Apaga o destaque e o devolve: a interface oferece "Desfazer" com
    /// [`Biblioteca::restaurar_destaque`].
    #[instrument(skip(self))]
    pub fn apagar_destaque(&self, id: i64) -> Resultado<Destaque> {
        let destaque = self.destaque(id)?;
        self.conexao
            .execute("DELETE FROM destaques WHERE id = ?1", [id])?;
        Ok(destaque)
    }

    /// Põe de volta um destaque apagado, com o mesmo id e as mesmas datas (Desfazer).
    #[instrument(skip(self, destaque), fields(id = destaque.id))]
    pub fn restaurar_destaque(&self, destaque: &Destaque) -> Resultado<Destaque> {
        self.conexao
            .execute(
                "INSERT INTO destaques
                     (id, livro_id, local, trecho, cor, nota, capitulo, posicao, criado_em, atualizado_em)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    destaque.id,
                    destaque.livro_id,
                    destaque.local,
                    destaque.trecho,
                    destaque.cor.como_texto(),
                    destaque.nota,
                    destaque.capitulo,
                    posicao_valida(destaque.posicao),
                    destaque.criado_em,
                    destaque.atualizado_em,
                ],
            )
            .map_err(|e| livro_inexistente(e, &destaque.livro_id))?;
        self.destaque(destaque.id)
    }

    /// Os destaques do livro em Markdown (ver [`para_markdown`]).
    pub fn destaques_em_markdown(&self, livro: &str) -> Resultado<String> {
        let dados = self
            .obter(livro)?
            .ok_or_else(|| ErroBiblioteca::NaoEncontrado(livro.to_owned()))?;
        let destaques = self.listar_destaques(livro)?;
        Ok(para_markdown(&dados.titulo, &dados.autores, &destaques))
    }

    /// Grava os destaques do livro em Markdown em `destino`; devolve quantos foram.
    #[instrument(skip(self), fields(destino = %destino.display()))]
    pub fn exportar_destaques(&self, livro: &str, destino: &Path) -> Resultado<usize> {
        let markdown = self.destaques_em_markdown(livro)?;
        gravar(destino, markdown.as_bytes())?;
        Ok(self.listar_destaques(livro)?.len())
    }
}

/// Markdown para estudo (e para levar ao Obsidian): título, autores e, em ordem de leitura,
/// cada trecho como citação, com a nota logo abaixo. Um título de seção (`##`) aparece quando
/// o capítulo muda. Função pura: o mesmo livro e os mesmos destaques dão o mesmo texto.
pub fn para_markdown(titulo: &str, autores: &[String], destaques: &[Destaque]) -> String {
    let mut md = format!("# {}\n", titulo.trim());
    if !autores.is_empty() {
        md.push_str(&format!("\n{}\n", autores.join(", ")));
    }
    if destaques.is_empty() {
        md.push_str("\nNenhum destaque.\n");
        return md;
    }
    let mut capitulo_atual: Option<&str> = None;
    for destaque in destaques {
        let capitulo = destaque.capitulo.as_deref();
        if capitulo.is_some() && capitulo != capitulo_atual {
            md.push_str(&format!("\n## {}\n", capitulo.unwrap_or_default()));
        }
        capitulo_atual = capitulo.or(capitulo_atual);
        md.push('\n');
        // Cada linha do trecho vira uma linha da citação (linha vazia: "> " sozinho).
        for linha in destaque.trecho.lines() {
            let linha = linha.trim_end();
            md.push_str(if linha.is_empty() { ">" } else { "> " });
            md.push_str(linha);
            md.push('\n');
        }
        if let Some(nota) = &destaque.nota {
            md.push_str(&format!("\n{nota}\n"));
        }
    }
    md
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn nova_com_livro() -> (tempfile::TempDir, Biblioteca, String) {
        let dir = tempfile::tempdir().unwrap();
        let bib = Biblioteca::abrir(&dir.path().join("dados"), &dir.path().join("capas")).unwrap();
        let fixture =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/minimo.epub");
        let id = bib.importar(&fixture).unwrap().into_livro().id;
        (dir, bib, id)
    }

    fn novo(trecho: &str, posicao: f64) -> NovoDestaque {
        NovoDestaque {
            local: format!("epubcfi(/6/4!/4/2,/1:0,/1:{})", trecho.len()),
            trecho: trecho.to_owned(),
            cor: Cor::Amarelo,
            nota: None,
            capitulo: None,
            posicao,
        }
    }

    #[test]
    fn cria_e_lista_na_ordem_de_leitura() {
        let (_dir, bib, livro) = nova_com_livro();
        bib.criar_destaque(&livro, novo("depois", 0.8)).unwrap();
        let primeiro = bib.criar_destaque(&livro, novo("antes", 0.1)).unwrap();
        assert_eq!(primeiro.trecho, "antes");
        assert_eq!(primeiro.livro_id, livro);
        assert_eq!(primeiro.cor, Cor::Amarelo);
        assert_eq!(primeiro.criado_em, primeiro.atualizado_em);
        let lista: Vec<_> = bib
            .listar_destaques(&livro)
            .unwrap()
            .into_iter()
            .map(|d| d.trecho)
            .collect();
        assert_eq!(lista, ["antes", "depois"]);
    }

    #[test]
    fn trecho_nota_e_capitulo_aparados_e_vazios_viram_none() {
        let (_dir, bib, livro) = nova_com_livro();
        let d = bib
            .criar_destaque(
                &livro,
                NovoDestaque {
                    nota: Some("   ".into()),
                    capitulo: Some("  III. A denúncia ".into()),
                    ..novo("  escondi-me atrás da porta \n", 0.3)
                },
            )
            .unwrap();
        assert_eq!(d.trecho, "escondi-me atrás da porta");
        assert_eq!(d.nota, None);
        assert_eq!(d.capitulo.as_deref(), Some("III. A denúncia"));
    }

    #[test]
    fn trecho_ou_local_vazio_e_recusado() {
        let (_dir, bib, livro) = nova_com_livro();
        assert!(matches!(
            bib.criar_destaque(&livro, novo(" \n ", 0.1)),
            Err(ErroBiblioteca::DestaqueSemTrecho)
        ));
        let sem_local = NovoDestaque {
            local: " ".into(),
            ..novo("texto", 0.1)
        };
        assert!(matches!(
            bib.criar_destaque(&livro, sem_local),
            Err(ErroBiblioteca::DestaqueSemLocal)
        ));
    }

    #[test]
    fn posicao_fora_do_intervalo_e_cortada() {
        let (_dir, bib, livro) = nova_com_livro();
        assert_eq!(
            bib.criar_destaque(&livro, novo("a", 7.0)).unwrap().posicao,
            1.0
        );
        assert_eq!(
            bib.criar_destaque(&livro, novo("b", -1.0)).unwrap().posicao,
            0.0
        );
        assert_eq!(
            bib.criar_destaque(&livro, novo("c", f64::NAN))
                .unwrap()
                .posicao,
            0.0
        );
    }

    #[test]
    fn livro_inexistente() {
        let (_dir, bib, _livro) = nova_com_livro();
        assert!(matches!(
            bib.criar_destaque("nao-existe", novo("a", 0.1)),
            Err(ErroBiblioteca::NaoEncontrado(_))
        ));
        assert!(bib.listar_destaques("nao-existe").unwrap().is_empty());
    }

    #[test]
    fn muda_cor_e_nota_e_atualiza_a_data() {
        let (_dir, mut bib, livro) = nova_com_livro();
        let d = bib.criar_destaque(&livro, novo("trecho", 0.5)).unwrap();
        bib.relogio = || 2_000_000_000;
        let d = bib.definir_cor_do_destaque(d.id, Cor::Rosa).unwrap();
        assert_eq!(d.cor, Cor::Rosa);
        assert_eq!(d.atualizado_em, 2_000_000_000);
        assert!(d.criado_em < d.atualizado_em);
        let d = bib
            .definir_nota_do_destaque(d.id, Some("  pensar nisso "))
            .unwrap();
        assert_eq!(d.nota.as_deref(), Some("pensar nisso"));
        let d = bib.definir_nota_do_destaque(d.id, Some("")).unwrap();
        assert_eq!(d.nota, None);
        assert!(matches!(
            bib.definir_cor_do_destaque(999, Cor::Azul),
            Err(ErroBiblioteca::DestaqueNaoEncontrado(999))
        ));
        assert!(matches!(
            bib.definir_nota_do_destaque(999, None),
            Err(ErroBiblioteca::DestaqueNaoEncontrado(999))
        ));
    }

    #[test]
    fn apagar_e_desfazer_devolve_o_mesmo_destaque() {
        let (_dir, bib, livro) = nova_com_livro();
        let d = bib
            .criar_destaque(
                &livro,
                NovoDestaque {
                    nota: Some("nota".into()),
                    cor: Cor::Verde,
                    ..novo("trecho", 0.5)
                },
            )
            .unwrap();
        let apagado = bib.apagar_destaque(d.id).unwrap();
        assert_eq!(apagado, d);
        assert!(bib.listar_destaques(&livro).unwrap().is_empty());
        assert!(matches!(
            bib.apagar_destaque(d.id),
            Err(ErroBiblioteca::DestaqueNaoEncontrado(_))
        ));
        assert_eq!(bib.restaurar_destaque(&apagado).unwrap(), d);
        assert_eq!(bib.listar_destaques(&livro).unwrap(), [d]);
    }

    #[test]
    fn apagar_o_livro_de_vez_apaga_os_destaques_e_a_contagem_aparece_no_livro() {
        let (_dir, bib, livro) = nova_com_livro();
        bib.criar_destaque(&livro, novo("a", 0.1)).unwrap();
        bib.criar_destaque(&livro, novo("b", 0.2)).unwrap();
        assert_eq!(bib.obter(&livro).unwrap().unwrap().destaques, 2);
        bib.apagar_de_vez(&livro).unwrap();
        let restantes: i64 = bib
            .conexao
            .query_row("SELECT COUNT(*) FROM destaques", [], |l| l.get(0))
            .unwrap();
        assert_eq!(restantes, 0);
    }

    #[test]
    fn cor_desconhecida_vira_amarelo_e_vai_em_kebab_case() {
        assert_eq!(Cor::de_texto("roxo"), Cor::Amarelo);
        for cor in [Cor::Amarelo, Cor::Verde, Cor::Azul, Cor::Rosa] {
            assert_eq!(Cor::de_texto(cor.como_texto()), cor);
            assert_eq!(
                serde_json::to_string(&cor).unwrap(),
                format!("\"{}\"", cor.como_texto())
            );
        }
    }

    #[test]
    fn novo_destaque_vem_do_json_da_interface() {
        let novo: NovoDestaque = serde_json::from_str(
            r#"{"local":"epubcfi(/6/4!/4/2,/1:0,/1:5)","trecho":"Olá","posicao":0.25}"#,
        )
        .unwrap();
        assert_eq!(novo.cor, Cor::Amarelo);
        assert_eq!(novo.nota, None);
        let json = serde_json::to_value(Destaque {
            id: 1,
            livro_id: "x".into(),
            local: "l".into(),
            trecho: "t".into(),
            cor: Cor::Azul,
            nota: None,
            capitulo: None,
            posicao: 0.5,
            criado_em: 1,
            atualizado_em: 2,
        })
        .unwrap();
        assert_eq!(json["livroId"], "x");
        assert_eq!(json["criadoEm"], 1);
        assert_eq!(json["cor"], "azul");
    }

    fn destaque(trecho: &str, capitulo: Option<&str>, nota: Option<&str>) -> Destaque {
        Destaque {
            id: 0,
            livro_id: "x".into(),
            local: "l".into(),
            trecho: trecho.into(),
            cor: Cor::Amarelo,
            nota: nota.map(Into::into),
            capitulo: capitulo.map(Into::into),
            posicao: 0.0,
            criado_em: 0,
            atualizado_em: 0,
        }
    }

    #[test]
    fn markdown_com_capitulos_notas_e_trechos_de_varias_linhas() {
        let destaques = [
            destaque("Sem capítulo, no começo.", None, None),
            destaque(
                "Ia a entrar na sala de visitas,\n\nquando ouvi proferir o meu nome",
                Some("III. A denúncia"),
                Some("O narrador escuta escondido."),
            ),
            destaque("escondi-me atrás da porta", Some("III. A denúncia"), None),
            destaque("Tio Cosme vivia com minha mãe", Some("VI. Tio Cosme"), None),
        ];
        insta::assert_snapshot!(para_markdown(
            "Dom Casmurro",
            &["Machado de Assis".into()],
            &destaques
        ));
    }

    #[test]
    fn markdown_sem_destaques_e_sem_autor() {
        assert_eq!(
            para_markdown("Livro", &[], &[]),
            "# Livro\n\nNenhum destaque.\n"
        );
    }

    #[test]
    fn exporta_para_arquivo() {
        let (dir, bib, livro) = nova_com_livro();
        bib.criar_destaque(&livro, novo("um trecho", 0.1)).unwrap();
        let destino = dir.path().join("destaques.md");
        assert_eq!(bib.exportar_destaques(&livro, &destino).unwrap(), 1);
        let texto = std::fs::read_to_string(&destino).unwrap();
        assert!(texto.contains("> um trecho\n"), "{texto}");
    }
}
