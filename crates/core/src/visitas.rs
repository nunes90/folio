//! Trechos revisitados (M21): "você voltou várias vezes a este capítulo". Um sinal de onde a
//! leitura pede mais (uma passagem difícil, uma referência), contado só no computador e dito
//! em tom neutro.
//!
//! O leitor avisa a cada trecho em que entra ([`Biblioteca::visitar_trecho`]). Um trecho é o que
//! o leitor decide (no EPUB, o capítulo; no PDF, a seção do sumário ou um bloco de páginas), com
//! uma `ordem` no livro. É uma **volta** chegar a um trecho anterior ao mais adiantado já
//! alcançado: ler um capítulo longo em várias sessões não conta, porque não se passou dele. Ir e
//! vir entre dois capítulos conta no máximo uma volta a cada [`INTERVALO_ENTRE_VOLTAS`].
//!
//! Como as sessões, as operações estão num `impl Biblioteca` à parte (ver destaques.rs).

use rusqlite::{OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use tracing::instrument;

use crate::biblioteca::{Biblioteca, ErroBiblioteca, Resultado};

/// Voltar ao mesmo trecho dentro deste intervalo (segundos) conta uma volta só.
pub const INTERVALO_ENTRE_VOLTAS: i64 = 30 * 60;

/// Um trecho do livro, como o leitor o descreve ao entrar nele.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trecho {
    /// A posição do trecho no livro (EPUB: a seção; PDF: a seção do sumário ou o bloco de páginas).
    pub ordem: i64,
    /// O nome, para listar: "Capítulo 3", "páginas 41–50".
    pub rotulo: String,
    /// Para onde ir ao escolher o trecho na lista (o leitor entende: ex. `secao:3`, `pagina:41`).
    pub local: String,
}

/// Um trecho visitado e quantas vezes se voltou a ele.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Visita {
    pub ordem: i64,
    pub rotulo: String,
    pub local: String,
    pub voltas: i64,
    /// Esta visita foi uma volta (a contagem acabou de subir).
    pub voltou: bool,
}

fn visita_da_linha(linha: &Row) -> rusqlite::Result<Visita> {
    Ok(Visita {
        ordem: linha.get("trecho")?,
        rotulo: linha.get("rotulo")?,
        local: linha.get("local")?,
        voltas: linha.get("voltas")?,
        voltou: false,
    })
}

impl Biblioteca {
    /// O leitor entrou no trecho. Na primeira vez, registra; depois, conta uma volta se o trecho
    /// fica antes do mais adiantado já visitado e a última volta foi há mais de
    /// [`INTERVALO_ENTRE_VOLTAS`].
    #[instrument(skip(self, trecho), fields(ordem = trecho.ordem))]
    pub fn visitar_trecho(&self, livro: &str, trecho: &Trecho) -> Resultado<Visita> {
        let agora = (self.relogio)();
        let alcance: Option<i64> = self.conexao.query_row(
            "SELECT MAX(trecho) FROM visitas WHERE livro_id = ?1",
            params![livro],
            |l| l.get(0),
        )?;
        let antes: Option<(i64, Option<i64>)> = self
            .conexao
            .query_row(
                "SELECT voltas, ultima_volta FROM visitas WHERE livro_id = ?1 AND trecho = ?2",
                params![livro, trecho.ordem],
                |l| Ok((l.get(0)?, l.get(1)?)),
            )
            .optional()?;
        let voltou = match antes {
            None => {
                self.conexao
                    .execute(
                        "INSERT INTO visitas (livro_id, trecho, rotulo, local, voltas, primeira)
                         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
                        params![livro, trecho.ordem, trecho.rotulo, trecho.local, agora],
                    )
                    .map_err(|erro| livro_inexistente(erro, livro))?;
                false
            }
            Some((_, ultima)) => {
                let atras = alcance.is_some_and(|a| trecho.ordem < a);
                let espacada = ultima.is_none_or(|u| agora - u >= INTERVALO_ENTRE_VOLTAS);
                let voltou = atras && espacada;
                // O rótulo pode mudar (ex.: o sumário do PDF carregou depois): fica o mais novo.
                self.conexao.execute(
                    "UPDATE visitas SET rotulo = ?3,
                        voltas = voltas + ?4,
                        ultima_volta = CASE WHEN ?4 = 1 THEN ?5 ELSE ultima_volta END
                     WHERE livro_id = ?1 AND trecho = ?2",
                    params![livro, trecho.ordem, trecho.rotulo, i64::from(voltou), agora],
                )?;
                voltou
            }
        };
        let mut visita = self.conexao.query_row(
            "SELECT * FROM visitas WHERE livro_id = ?1 AND trecho = ?2",
            params![livro, trecho.ordem],
            visita_da_linha,
        )?;
        visita.voltou = voltou;
        Ok(visita)
    }

    /// Os trechos do livro a que se voltou pelo menos `minimo` vezes, dos mais revisitados aos
    /// menos (e, entre iguais, na ordem do livro).
    #[instrument(skip(self))]
    pub fn trechos_revisitados(&self, livro: &str, minimo: i64) -> Resultado<Vec<Visita>> {
        let mut consulta = self.conexao.prepare(
            "SELECT * FROM visitas WHERE livro_id = ?1 AND voltas >= ?2
             ORDER BY voltas DESC, trecho",
        )?;
        let visitas = consulta
            .query_map(params![livro, minimo.max(1)], visita_da_linha)?
            .collect::<rusqlite::Result<_>>()?;
        Ok(visitas)
    }
}

/// A chave estrangeira recusou: o livro não existe.
fn livro_inexistente(erro: rusqlite::Error, livro: &str) -> ErroBiblioteca {
    match erro {
        rusqlite::Error::SqliteFailure(e, _)
            if e.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            ErroBiblioteca::NaoEncontrado(livro.to_owned())
        }
        outro => outro.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nova_com_livro() -> (tempfile::TempDir, Biblioteca, String) {
        let dir = tempfile::tempdir().unwrap();
        let bib = Biblioteca::abrir(&dir.path().join("dados"), &dir.path().join("capas")).unwrap();
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/minimo.epub");
        let id = bib.importar(&fixture).unwrap().into_livro().id;
        (dir, bib, id)
    }

    fn capitulo(ordem: i64) -> Trecho {
        Trecho {
            ordem,
            rotulo: format!("Capítulo {ordem}"),
            local: format!("secao:{ordem}"),
        }
    }

    #[test]
    fn ler_em_frente_nao_conta_volta() {
        let (_dir, bib, livro) = nova_com_livro();
        for ordem in [1, 2, 2, 3] {
            let v = bib.visitar_trecho(&livro, &capitulo(ordem)).unwrap();
            assert_eq!((v.voltas, v.voltou), (0, false));
        }
    }

    #[test]
    fn voltar_a_um_trecho_ja_passado_conta() {
        let (_dir, bib, livro) = nova_com_livro();
        bib.visitar_trecho(&livro, &capitulo(1)).unwrap();
        bib.visitar_trecho(&livro, &capitulo(2)).unwrap();
        let v = bib.visitar_trecho(&livro, &capitulo(1)).unwrap();
        assert_eq!((v.voltas, v.voltou), (1, true));
        assert_eq!(v.rotulo, "Capítulo 1");
        assert_eq!(v.local, "secao:1");
    }

    #[test]
    fn ir_e_vir_conta_uma_volta_por_intervalo() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 0;
        bib.visitar_trecho(&livro, &capitulo(3)).unwrap();
        bib.visitar_trecho(&livro, &capitulo(4)).unwrap();
        bib.visitar_trecho(&livro, &capitulo(3)).unwrap(); // 1ª volta
        bib.visitar_trecho(&livro, &capitulo(4)).unwrap();
        let v = bib.visitar_trecho(&livro, &capitulo(3)).unwrap(); // logo depois: não conta
        assert_eq!((v.voltas, v.voltou), (1, false));
        bib.relogio = || INTERVALO_ENTRE_VOLTAS;
        let v = bib.visitar_trecho(&livro, &capitulo(3)).unwrap();
        assert_eq!((v.voltas, v.voltou), (2, true));
    }

    #[test]
    fn um_trecho_novo_atras_do_alcance_nao_e_volta() {
        // Pulou do capítulo 1 para o 5 pelo índice e depois abriu o 3 pela primeira vez.
        let (_dir, bib, livro) = nova_com_livro();
        bib.visitar_trecho(&livro, &capitulo(1)).unwrap();
        bib.visitar_trecho(&livro, &capitulo(5)).unwrap();
        let v = bib.visitar_trecho(&livro, &capitulo(3)).unwrap();
        assert_eq!((v.voltas, v.voltou), (0, false));
    }

    #[test]
    fn revisitados_do_mais_ao_menos_com_minimo() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.visitar_trecho(&livro, &capitulo(1)).unwrap();
        bib.visitar_trecho(&livro, &capitulo(2)).unwrap();
        bib.visitar_trecho(&livro, &capitulo(9)).unwrap();
        // Capítulo 2: duas voltas; capítulo 1: uma.
        bib.relogio = || 0;
        bib.visitar_trecho(&livro, &capitulo(2)).unwrap();
        bib.visitar_trecho(&livro, &capitulo(1)).unwrap();
        bib.relogio = || INTERVALO_ENTRE_VOLTAS;
        bib.visitar_trecho(&livro, &capitulo(2)).unwrap();
        let ordens = |minimo| -> Vec<i64> {
            bib.trechos_revisitados(&livro, minimo)
                .unwrap()
                .iter()
                .map(|v| v.ordem)
                .collect()
        };
        assert_eq!(ordens(1), vec![2, 1]);
        assert_eq!(ordens(2), vec![2]);
        assert_eq!(
            ordens(0),
            vec![2, 1],
            "mínimo 0 vira 1: sem volta não é revisitado"
        );
    }

    #[test]
    fn rotulo_mais_novo_fica() {
        let (_dir, bib, livro) = nova_com_livro();
        bib.visitar_trecho(&livro, &capitulo(1)).unwrap();
        let mut novo = capitulo(1);
        novo.rotulo = "1. Introdução".into();
        assert_eq!(
            bib.visitar_trecho(&livro, &novo).unwrap().rotulo,
            "1. Introdução"
        );
    }

    #[test]
    fn livro_inexistente_e_cascata() {
        let (_dir, bib, livro) = nova_com_livro();
        assert!(matches!(
            bib.visitar_trecho("nao-existe", &capitulo(1)),
            Err(ErroBiblioteca::NaoEncontrado(_))
        ));
        bib.visitar_trecho(&livro, &capitulo(1)).unwrap();
        bib.apagar_de_vez(&livro).unwrap();
        let n: i64 = bib
            .conexao
            .query_row("SELECT COUNT(*) FROM visitas", [], |l| l.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn visita_vai_em_camel_case_e_trecho_vem_do_json() {
        let trecho: Trecho =
            serde_json::from_str(r#"{"ordem":3,"rotulo":"III","local":"secao:3"}"#).unwrap();
        assert_eq!(
            trecho,
            Trecho {
                ordem: 3,
                rotulo: "III".into(),
                local: "secao:3".into()
            }
        );
        let (_dir, bib, livro) = nova_com_livro();
        let json = serde_json::to_value(bib.visitar_trecho(&livro, &trecho).unwrap()).unwrap();
        assert_eq!(json["voltas"], 0);
        assert_eq!(json["voltou"], false);
    }
}
