//! Marcadores de página (M42a): um lugar no livro, sem trecho, para voltar a ele.
//!
//! Como nos destaques, o core não interpreta o `local` (no EPUB, o CFI do começo da página; no
//! PDF, `pagina:N`): guarda e devolve. A ordem vem de `posicao` (0.0 a 1.0 no livro), igual nos
//! dois formatos. Um lugar tem no máximo um marcador (`UNIQUE (livro_id, local)` no banco):
//! marcar de novo devolve o que já existe.

use rusqlite::{OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use tracing::instrument;

use crate::biblioteca::{Biblioteca, ErroBiblioteca, Resultado};

/// Um marcador como a interface o vê.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Marcador {
    pub id: i64,
    pub livro_id: String,
    pub local: String,
    /// Título da seção (do índice) em que a página está, se houver.
    pub capitulo: Option<String>,
    /// 0.0 a 1.0 no livro: a ordem de leitura.
    pub posicao: f64,
    pub criado_em: i64,
}

/// O que o leitor manda para marcar a página.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovoMarcador {
    pub local: String,
    #[serde(default)]
    pub capitulo: Option<String>,
    pub posicao: f64,
}

const SELECT_MARCADOR: &str =
    "SELECT id, livro_id, local, capitulo, posicao, criado_em FROM marcadores";

fn marcador_da_linha(linha: &Row) -> rusqlite::Result<Marcador> {
    Ok(Marcador {
        id: linha.get("id")?,
        livro_id: linha.get("livro_id")?,
        local: linha.get("local")?,
        capitulo: linha.get("capitulo")?,
        posicao: linha.get("posicao")?,
        criado_em: linha.get("criado_em")?,
    })
}

/// Fora de 0..1 é cortado; NaN vira 0 (como nos destaques).
fn posicao_valida(posicao: f64) -> f64 {
    if posicao.is_nan() {
        0.0
    } else {
        posicao.clamp(0.0, 1.0)
    }
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
    /// Marca um lugar do livro. Se ele já estava marcado, devolve o marcador que existia.
    #[instrument(skip(self, novo), fields(posicao = novo.posicao))]
    pub fn marcar(&self, livro: &str, novo: NovoMarcador) -> Resultado<Marcador> {
        let local = novo.local.trim();
        if local.is_empty() {
            return Err(ErroBiblioteca::MarcadorSemLocal);
        }
        let capitulo = novo
            .capitulo
            .as_deref()
            .map(str::trim)
            .filter(|c| !c.is_empty());
        // `ON CONFLICT DO NOTHING`: o lugar já marcado não é erro nem cria outro; a consulta
        // seguinte acha o marcador pelo lugar, novo ou antigo.
        self.conexao
            .execute(
                "INSERT INTO marcadores (livro_id, local, capitulo, posicao, criado_em)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT (livro_id, local) DO NOTHING",
                params![
                    livro,
                    local,
                    capitulo,
                    posicao_valida(novo.posicao),
                    (self.relogio)()
                ],
            )
            .map_err(|e| livro_inexistente(e, livro))?;
        Ok(self.conexao.query_row(
            &format!("{SELECT_MARCADOR} WHERE livro_id = ?1 AND local = ?2"),
            params![livro, local],
            marcador_da_linha,
        )?)
    }

    /// Os marcadores do livro na ordem de leitura.
    pub fn listar_marcadores(&self, livro: &str) -> Resultado<Vec<Marcador>> {
        let mut consulta = self.conexao.prepare(&format!(
            "{SELECT_MARCADOR} WHERE livro_id = ?1 ORDER BY posicao, criado_em, id"
        ))?;
        let marcadores = consulta
            .query_map([livro], marcador_da_linha)?
            .collect::<Result<_, _>>()?;
        Ok(marcadores)
    }

    /// Um marcador pelo id.
    pub fn marcador(&self, id: i64) -> Resultado<Marcador> {
        self.conexao
            .query_row(
                &format!("{SELECT_MARCADOR} WHERE id = ?1"),
                [id],
                marcador_da_linha,
            )
            .optional()?
            .ok_or(ErroBiblioteca::MarcadorNaoEncontrado(id))
    }

    /// Apaga o marcador e o devolve (para o Desfazer).
    #[instrument(skip(self))]
    pub fn apagar_marcador(&self, id: i64) -> Resultado<Marcador> {
        let marcador = self.marcador(id)?;
        self.conexao
            .execute("DELETE FROM marcadores WHERE id = ?1", [id])?;
        Ok(marcador)
    }

    /// Põe de volta um marcador apagado, com o mesmo id e a mesma data (Desfazer). Se o lugar
    /// foi marcado de novo nesse meio-tempo, devolve o que está lá.
    #[instrument(skip(self, marcador), fields(id = marcador.id))]
    pub fn restaurar_marcador(&self, marcador: &Marcador) -> Resultado<Marcador> {
        self.conexao
            .execute(
                "INSERT INTO marcadores (id, livro_id, local, capitulo, posicao, criado_em)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT (livro_id, local) DO NOTHING",
                params![
                    marcador.id,
                    marcador.livro_id,
                    marcador.local,
                    marcador.capitulo,
                    posicao_valida(marcador.posicao),
                    marcador.criado_em,
                ],
            )
            .map_err(|e| livro_inexistente(e, &marcador.livro_id))?;
        Ok(self.conexao.query_row(
            &format!("{SELECT_MARCADOR} WHERE livro_id = ?1 AND local = ?2"),
            params![marcador.livro_id, marcador.local],
            marcador_da_linha,
        )?)
    }
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

    fn novo(local: &str, posicao: f64) -> NovoMarcador {
        NovoMarcador {
            local: local.to_owned(),
            capitulo: Some("Capítulo 1".into()),
            posicao,
        }
    }

    #[test]
    fn marca_e_lista_na_ordem_de_leitura() {
        let (_dir, bib, livro) = nova_com_livro();
        bib.marcar(&livro, novo("pagina:9", 0.9)).unwrap();
        let primeiro = bib.marcar(&livro, novo("pagina:2", 0.2)).unwrap();
        assert_eq!(primeiro.livro_id, livro);
        assert_eq!(primeiro.capitulo.as_deref(), Some("Capítulo 1"));
        let locais: Vec<_> = bib
            .listar_marcadores(&livro)
            .unwrap()
            .into_iter()
            .map(|m| m.local)
            .collect();
        assert_eq!(locais, ["pagina:2", "pagina:9"]);
    }

    #[test]
    fn marcar_o_mesmo_lugar_devolve_o_que_existe() {
        let (_dir, bib, livro) = nova_com_livro();
        let a = bib.marcar(&livro, novo("pagina:3", 0.3)).unwrap();
        let b = bib.marcar(&livro, novo("pagina:3", 0.3)).unwrap();
        assert_eq!(a, b);
        assert_eq!(bib.listar_marcadores(&livro).unwrap().len(), 1);
    }

    #[test]
    fn sem_local_e_erro_e_capitulo_vazio_vira_nada() {
        let (_dir, bib, livro) = nova_com_livro();
        assert!(matches!(
            bib.marcar(&livro, novo("  ", 0.1)),
            Err(ErroBiblioteca::MarcadorSemLocal)
        ));
        let m = bib
            .marcar(
                &livro,
                NovoMarcador {
                    local: "pagina:1".into(),
                    capitulo: Some("  ".into()),
                    posicao: f64::NAN,
                },
            )
            .unwrap();
        assert_eq!(m.capitulo, None);
        assert_eq!(m.posicao, 0.0);
    }

    #[test]
    fn livro_inexistente_e_nao_encontrado() {
        let (_dir, bib, _livro) = nova_com_livro();
        assert!(matches!(
            bib.marcar("nao-existe", novo("pagina:1", 0.1)),
            Err(ErroBiblioteca::NaoEncontrado(_))
        ));
    }

    #[test]
    fn apagar_e_desfazer_volta_com_o_mesmo_id() {
        let (_dir, bib, livro) = nova_com_livro();
        let m = bib.marcar(&livro, novo("pagina:5", 0.5)).unwrap();
        let apagado = bib.apagar_marcador(m.id).unwrap();
        assert!(bib.listar_marcadores(&livro).unwrap().is_empty());
        assert!(matches!(
            bib.apagar_marcador(m.id),
            Err(ErroBiblioteca::MarcadorNaoEncontrado(_))
        ));
        assert_eq!(bib.restaurar_marcador(&apagado).unwrap(), m);
    }

    #[test]
    fn apagar_o_livro_leva_os_marcadores() {
        let (_dir, bib, livro) = nova_com_livro();
        bib.marcar(&livro, novo("pagina:5", 0.5)).unwrap();
        bib.conexao
            .execute("DELETE FROM livros WHERE id = ?1", [&livro])
            .unwrap();
        assert!(bib.listar_marcadores(&livro).unwrap().is_empty());
    }
}
