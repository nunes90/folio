//! Sessões de leitura (M20): quando, por quanto tempo e de onde a onde se leu um livro. A base
//! da meta da sessão e, depois, do ritmo de quem lê (M21). Os dados ficam só no computador.
//!
//! O leitor avisa ao abrir o livro ([`Biblioteca::iniciar_sessao`]), a cada mudança de lugar e,
//! de tempos em tempos, quando há atividade (tecla, rolagem, ponteiro), com
//! [`Biblioteca::registrar_na_sessao`]. Cada aviso soma o tempo desde o anterior, até
//! [`PAUSA_MAXIMA`]: uma página longa conta até 5 minutos, e um livro esquecido aberto não
//! vira horas de leitura. Cada aviso já grava a sessão: se o app fechar sem avisar (a janela
//! não é interceptada ao fechar), ela fica como estava no último aviso.
//!
//! Como os destaques, as operações estão num `impl Biblioteca` à parte (ver destaques.rs).

use rusqlite::{OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};
use tracing::instrument;

use crate::biblioteca::{Biblioteca, ErroBiblioteca, Progresso, Resultado};

/// O maior intervalo entre dois avisos que conta como leitura (segundos). Mais que isso é pausa.
pub const PAUSA_MAXIMA: i64 = 5 * 60;

/// Uma sessão mais curta que isto (segundos) e sem sair do lugar não fica: foi só abrir e
/// fechar o livro (ex.: para conferir algo), e atrapalharia o ritmo de leitura.
pub const SESSAO_MINIMA: i64 = 30;

/// Uma sessão de leitura.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sessao {
    pub id: i64,
    pub livro_id: String,
    /// Quando começou e quando foi o último aviso (segundos desde 1970, UTC).
    pub inicio: i64,
    pub fim: i64,
    /// Segundos de leitura de fato: o tempo entre `inicio` e `fim`, sem as pausas longas.
    pub ativo: i64,
    /// Onde estava ao abrir o livro e onde está agora.
    pub de: Progresso,
    pub ate: Progresso,
}

/// Quanto de um intervalo entre dois avisos conta como leitura: até [`PAUSA_MAXIMA`]. Um
/// intervalo negativo (o relógio do sistema voltou) não conta.
pub fn tempo_contado(intervalo: i64) -> i64 {
    intervalo.clamp(0, PAUSA_MAXIMA)
}

/// A fração no livro entre 0.0 e 1.0; NaN vira 0.
fn fracao_valida(fracao: f64) -> f64 {
    if fracao.is_nan() {
        0.0
    } else {
        fracao.clamp(0.0, 1.0)
    }
}

fn sessao_da_linha(linha: &Row) -> rusqlite::Result<Sessao> {
    Ok(Sessao {
        id: linha.get("id")?,
        livro_id: linha.get("livro_id")?,
        inicio: linha.get("inicio")?,
        fim: linha.get("fim")?,
        ativo: linha.get("ativo")?,
        de: Progresso {
            localizacao: linha.get("de_local")?,
            fracao: linha.get("de_fracao")?,
        },
        ate: Progresso {
            localizacao: linha.get("ate_local")?,
            fracao: linha.get("ate_fracao")?,
        },
    })
}

impl Biblioteca {
    /// Começa uma sessão no livro, no ponto `onde` (o progresso ao abrir).
    #[instrument(skip(self, onde))]
    pub fn iniciar_sessao(&self, livro: &str, onde: &Progresso) -> Resultado<Sessao> {
        let agora = (self.relogio)();
        let fracao = fracao_valida(onde.fracao);
        self.conexao
            .execute(
                "INSERT INTO sessoes
                    (livro_id, inicio, fim, ativo, de_local, de_fracao, ate_local, ate_fracao)
                 VALUES (?1, ?2, ?2, 0, ?3, ?4, ?3, ?4)",
                params![livro, agora, onde.localizacao, fracao],
            )
            .map_err(|erro| match erro {
                // A chave estrangeira recusou: o livro não existe.
                rusqlite::Error::SqliteFailure(e, _)
                    if e.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    ErroBiblioteca::NaoEncontrado(livro.to_owned())
                }
                outro => outro.into(),
            })?;
        self.sessao(self.conexao.last_insert_rowid())
    }

    /// Avisa que a leitura continua: soma o tempo desde o último aviso (até [`PAUSA_MAXIMA`])
    /// e, com `onde`, muda o ponto em que a sessão está.
    #[instrument(skip(self, onde))]
    pub fn registrar_na_sessao(&self, id: i64, onde: Option<&Progresso>) -> Resultado<Sessao> {
        let antes = self.sessao(id)?;
        let agora = (self.relogio)().max(antes.fim);
        let ate = onde.unwrap_or(&antes.ate);
        self.conexao.execute(
            "UPDATE sessoes SET fim = ?1, ativo = ?2, ate_local = ?3, ate_fracao = ?4 WHERE id = ?5",
            params![
                agora,
                antes.ativo + tempo_contado(agora - antes.fim),
                ate.localizacao,
                fracao_valida(ate.fracao),
                id
            ],
        )?;
        self.sessao(id)
    }

    /// Encerra a sessão (ao fechar o livro), com um último aviso. Devolve a sessão, ou `None`
    /// se ela foi curta demais e não saiu do lugar (então é apagada: ver [`SESSAO_MINIMA`]).
    #[instrument(skip(self, onde))]
    pub fn encerrar_sessao(&self, id: i64, onde: Option<&Progresso>) -> Resultado<Option<Sessao>> {
        let sessao = self.registrar_na_sessao(id, onde)?;
        let parada = sessao.de.localizacao == sessao.ate.localizacao;
        if parada && sessao.ativo < SESSAO_MINIMA {
            self.conexao
                .execute("DELETE FROM sessoes WHERE id = ?1", params![id])?;
            return Ok(None);
        }
        Ok(Some(sessao))
    }

    /// As sessões do livro, da mais recente para a mais antiga.
    #[instrument(skip(self))]
    pub fn listar_sessoes(&self, livro: &str) -> Resultado<Vec<Sessao>> {
        let mut consulta = self
            .conexao
            .prepare("SELECT * FROM sessoes WHERE livro_id = ?1 ORDER BY inicio DESC, id DESC")?;
        let sessoes = consulta
            .query_map(params![livro], sessao_da_linha)?
            .collect::<rusqlite::Result<_>>()?;
        Ok(sessoes)
    }

    /// Uma sessão pelo id.
    pub fn sessao(&self, id: i64) -> Resultado<Sessao> {
        self.conexao
            .query_row(
                "SELECT * FROM sessoes WHERE id = ?1",
                params![id],
                sessao_da_linha,
            )
            .optional()?
            .ok_or(ErroBiblioteca::SessaoNaoEncontrada(id))
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

    fn em(localizacao: &str, fracao: f64) -> Progresso {
        Progresso {
            localizacao: localizacao.to_owned(),
            fracao,
        }
    }

    #[test]
    fn tempo_contado_vai_ate_a_pausa_maxima() {
        assert_eq!(tempo_contado(40), 40);
        assert_eq!(tempo_contado(PAUSA_MAXIMA + 1), PAUSA_MAXIMA);
        assert_eq!(tempo_contado(3 * 60 * 60), PAUSA_MAXIMA);
        assert_eq!(tempo_contado(-10), 0);
    }

    #[test]
    fn inicia_no_ponto_de_abertura_sem_tempo_ativo() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 1_000;
        let s = bib.iniciar_sessao(&livro, &em("pagina:3", 0.1)).unwrap();
        assert_eq!((s.inicio, s.fim, s.ativo), (1_000, 1_000, 0));
        assert_eq!(s.de, em("pagina:3", 0.1));
        assert_eq!(s.ate, s.de);
        assert_eq!(s.livro_id, livro);
    }

    #[test]
    fn soma_o_tempo_entre_avisos_sem_as_pausas_longas() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 1_000;
        let s = bib.iniciar_sessao(&livro, &em("pagina:3", 0.1)).unwrap();
        bib.relogio = || 1_060; // um minuto lendo
        bib.registrar_na_sessao(s.id, Some(&em("pagina:4", 0.12)))
            .unwrap();
        bib.relogio = || 4_660; // uma hora parado: conta só a pausa máxima
        bib.registrar_na_sessao(s.id, None).unwrap();
        bib.relogio = || 4_700;
        let s = bib
            .registrar_na_sessao(s.id, Some(&em("pagina:5", 0.14)))
            .unwrap();
        assert_eq!(s.ativo, 60 + PAUSA_MAXIMA + 40);
        assert_eq!((s.inicio, s.fim), (1_000, 4_700));
        assert_eq!(s.de, em("pagina:3", 0.1));
        assert_eq!(s.ate, em("pagina:5", 0.14));
    }

    #[test]
    fn aviso_sem_lugar_mantem_o_ponto() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 10;
        let s = bib.iniciar_sessao(&livro, &em("a", 0.5)).unwrap();
        bib.relogio = || 20;
        let s = bib.registrar_na_sessao(s.id, None).unwrap();
        assert_eq!(s.ate, em("a", 0.5));
        assert_eq!(s.ativo, 10);
    }

    #[test]
    fn relogio_que_volta_nao_desconta_nem_recua_o_fim() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 1_000;
        let s = bib.iniciar_sessao(&livro, &em("a", 0.0)).unwrap();
        bib.relogio = || 900;
        let s = bib.registrar_na_sessao(s.id, None).unwrap();
        assert_eq!((s.fim, s.ativo), (1_000, 0));
    }

    #[test]
    fn fracao_fora_do_intervalo_e_cortada() {
        let (_dir, bib, livro) = nova_com_livro();
        let s = bib.iniciar_sessao(&livro, &em("a", f64::NAN)).unwrap();
        assert_eq!(s.de.fracao, 0.0);
        let s = bib.registrar_na_sessao(s.id, Some(&em("b", 1.7))).unwrap();
        assert_eq!(s.ate.fracao, 1.0);
    }

    #[test]
    fn encerrar_sessao_curta_e_parada_apaga() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 100;
        let s = bib.iniciar_sessao(&livro, &em("a", 0.2)).unwrap();
        bib.relogio = || 110;
        assert_eq!(bib.encerrar_sessao(s.id, None).unwrap(), None);
        assert!(bib.listar_sessoes(&livro).unwrap().is_empty());
    }

    #[test]
    fn encerrar_sessao_que_andou_ou_durou_fica() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 100;
        let curta = bib.iniciar_sessao(&livro, &em("a", 0.2)).unwrap();
        bib.relogio = || 110;
        let curta = bib.encerrar_sessao(curta.id, Some(&em("b", 0.21))).unwrap();
        assert_eq!(curta.map(|s| s.ate.localizacao), Some("b".to_owned()));

        bib.relogio = || 200;
        let parada = bib.iniciar_sessao(&livro, &em("b", 0.21)).unwrap();
        bib.relogio = || 200 + SESSAO_MINIMA;
        assert!(bib.encerrar_sessao(parada.id, None).unwrap().is_some());
        assert_eq!(bib.listar_sessoes(&livro).unwrap().len(), 2);
    }

    #[test]
    fn lista_da_mais_recente_para_a_mais_antiga() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 100;
        let primeira = bib.iniciar_sessao(&livro, &em("a", 0.0)).unwrap();
        bib.relogio = || 500;
        let segunda = bib.iniciar_sessao(&livro, &em("b", 0.3)).unwrap();
        let ids: Vec<_> = bib
            .listar_sessoes(&livro)
            .unwrap()
            .iter()
            .map(|s| s.id)
            .collect();
        assert_eq!(ids, vec![segunda.id, primeira.id]);
    }

    #[test]
    fn livro_ou_sessao_inexistente() {
        let (_dir, bib, livro) = nova_com_livro();
        assert!(matches!(
            bib.iniciar_sessao("nao-existe", &em("a", 0.0)),
            Err(ErroBiblioteca::NaoEncontrado(_))
        ));
        assert!(matches!(
            bib.registrar_na_sessao(42, None),
            Err(ErroBiblioteca::SessaoNaoEncontrada(42))
        ));
        assert!(bib.listar_sessoes(&livro).unwrap().is_empty());
    }

    #[test]
    fn apagar_o_livro_de_vez_apaga_as_sessoes() {
        let (_dir, bib, livro) = nova_com_livro();
        let s = bib.iniciar_sessao(&livro, &em("a", 0.0)).unwrap();
        bib.apagar_de_vez(&livro).unwrap();
        assert!(matches!(
            bib.sessao(s.id),
            Err(ErroBiblioteca::SessaoNaoEncontrada(_))
        ));
    }

    #[test]
    fn sessao_vai_em_camel_case_para_a_interface() {
        let (_dir, mut bib, livro) = nova_com_livro();
        bib.relogio = || 5;
        let s = bib.iniciar_sessao(&livro, &em("pagina:1", 0.0)).unwrap();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["livroId"], livro);
        assert_eq!(json["de"]["localizacao"], "pagina:1");
        assert_eq!(json["ativo"], 0);
    }
}
