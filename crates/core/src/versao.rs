//! Aviso de versão nova (M43b): a última Release do Folio no GitHub, comparada à versão em uso.
//!
//! Só roda se a pessoa ligou o aviso (fica desligado até ela responder) ou pediu na paleta. A
//! consulta é um GET sem nada da pessoa além do endereço IP; o `User-Agent` diz só "Folio/<versão>".
//! A resposta vem da rede, então é tratada como dado de fora: a versão tem de ser `x.y.z` e o
//! endereço tem de ser a página das Releases do próprio Folio, ou a resposta é recusada.

use std::io::Read;

use serde::{Deserialize, Serialize};

use crate::baixar::Rede;

/// A última versão publicada (não inclui as de teste: o GitHub não as dá como `latest`).
pub const URL_ULTIMA_VERSAO: &str = "https://api.github.com/repos/nunes90/folio/releases/latest";

/// Onde as páginas das Releases do Folio começam: o único endereço que o aviso abre.
const PAGINAS_DAS_VERSOES: &str = "https://github.com/nunes90/folio/releases/";

/// Uma resposta maior que isto não é a de uma Release.
const RESPOSTA_MAXIMA: u64 = 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ErroVersao {
    #[error("não foi possível consultar o GitHub")]
    Rede(String),
    #[error("o GitHub respondeu algo que não é uma versão do Folio")]
    Resposta,
}

/// Uma versão mais nova que a em uso.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersaoNova {
    /// "1.4.0" (sem o "v").
    pub versao: String,
    /// A página da Release (as novidades e o AppImage).
    pub endereco: String,
}

/// O que importa da resposta do GitHub (o resto é ignorado).
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
}

/// "1.4.0" ou "v1.4.0" → (1, 4, 0). Qualquer outra coisa (sufixo, partes a mais ou a menos,
/// número enorme) é `None`.
pub fn ler_versao(texto: &str) -> Option<(u64, u64, u64)> {
    let texto = texto.strip_prefix('v').unwrap_or(texto);
    let mut partes = texto.split('.');
    let mut numero = || -> Option<u64> {
        let parte = partes.next()?;
        if parte.is_empty() || !parte.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        parte.parse().ok()
    };
    let versao = (numero()?, numero()?, numero()?);
    partes.next().is_none().then_some(versao)
}

/// `outra` é mais nova que `atual`? Uma das duas ilegível: não.
pub fn mais_nova(atual: &str, outra: &str) -> bool {
    matches!((ler_versao(atual), ler_versao(outra)), (Some(a), Some(o)) if o > a)
}

/// Lê a resposta do GitHub: a versão nova, se houver; `Err` se a resposta não serve.
pub fn da_resposta(json: &str, atual: &str) -> Result<Option<VersaoNova>, ErroVersao> {
    let release: Release = serde_json::from_str(json).map_err(|_| ErroVersao::Resposta)?;
    let (Some(_), true) = (
        ler_versao(&release.tag_name),
        release.html_url.starts_with(PAGINAS_DAS_VERSOES) && !release.html_url.contains(".."),
    ) else {
        return Err(ErroVersao::Resposta);
    };
    if !mais_nova(atual, &release.tag_name) {
        return Ok(None);
    }
    let versao = release.tag_name.trim_start_matches('v').to_owned();
    Ok(Some(VersaoNova {
        versao,
        endereco: release.html_url,
    }))
}

/// Consulta a última versão; `atual` é a versão em uso (`CARGO_PKG_VERSION` do app).
pub fn consultar(rede: &dyn Rede, atual: &str) -> Result<Option<VersaoNova>, ErroVersao> {
    let mut texto = String::new();
    rede.abrir(URL_ULTIMA_VERSAO)
        .map_err(ErroVersao::Rede)?
        .take(RESPOSTA_MAXIMA)
        .read_to_string(&mut texto)
        .map_err(|e| ErroVersao::Rede(e.to_string()))?;
    da_resposta(&texto, atual)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn le_a_versao_com_ou_sem_v() {
        assert_eq!(ler_versao("1.4.0"), Some((1, 4, 0)));
        assert_eq!(ler_versao("v10.0.12"), Some((10, 0, 12)));
        for ruim in [
            "",
            "1.4",
            "1.4.0.1",
            "1.4.0-rc1",
            "v",
            "1..0",
            "a.b.c",
            "+1.2.3",
            "1.2.99999999999999999999",
        ] {
            assert_eq!(ler_versao(ruim), None, "{ruim}");
        }
    }

    #[test]
    fn compara_numero_a_numero() {
        assert!(mais_nova("1.3.0", "v1.4.0"));
        assert!(mais_nova("1.9.0", "1.10.0"));
        assert!(mais_nova("1.3.0", "2.0.0"));
        assert!(!mais_nova("1.4.0", "v1.4.0"));
        assert!(!mais_nova("1.4.0", "1.3.9"));
        assert!(!mais_nova("1.4.0", "lixo"));
    }

    const RESPOSTA: &str = r#"{"tag_name":"v1.4.0","html_url":"https://github.com/nunes90/folio/releases/tag/v1.4.0","body":"…","assets":[]}"#;

    #[test]
    fn a_resposta_do_github_vira_a_versao_nova() {
        assert_eq!(
            da_resposta(RESPOSTA, "1.3.0").unwrap(),
            Some(VersaoNova {
                versao: "1.4.0".into(),
                endereco: "https://github.com/nunes90/folio/releases/tag/v1.4.0".into(),
            })
        );
        assert_eq!(da_resposta(RESPOSTA, "1.4.0").unwrap(), None);
    }

    #[test]
    fn resposta_estranha_e_recusada() {
        let fora = r#"{"tag_name":"v9.0.0","html_url":"https://exemplo.com/folio"}"#;
        assert!(matches!(
            da_resposta(fora, "1.3.0"),
            Err(ErroVersao::Resposta)
        ));
        let subindo = r#"{"tag_name":"v9.0.0","html_url":"https://github.com/nunes90/folio/releases/../../outro"}"#;
        assert!(matches!(
            da_resposta(subindo, "1.3.0"),
            Err(ErroVersao::Resposta)
        ));
        let versao = r#"{"tag_name":"nova","html_url":"https://github.com/nunes90/folio/releases/tag/nova"}"#;
        assert!(matches!(
            da_resposta(versao, "1.3.0"),
            Err(ErroVersao::Resposta)
        ));
        assert!(matches!(
            da_resposta("<html>", "1.3.0"),
            Err(ErroVersao::Resposta)
        ));
    }

    struct Memoria(&'static str);
    impl Rede for Memoria {
        fn abrir(&self, _url: &str) -> Result<Box<dyn Read + Send>, String> {
            Ok(Box::new(self.0.as_bytes()))
        }
    }

    struct SemRede;
    impl Rede for SemRede {
        fn abrir(&self, _url: &str) -> Result<Box<dyn Read + Send>, String> {
            Err("sem conexão".into())
        }
    }

    #[test]
    fn consulta_pela_rede() {
        assert!(consultar(&Memoria(RESPOSTA), "1.3.0").unwrap().is_some());
        assert!(matches!(
            consultar(&SemRede, "1.3.0"),
            Err(ErroVersao::Rede(_))
        ));
    }

    proptest! {
        // Os parsers não podem dar panic (CLAUDE.md), com qualquer texto vindo da rede.
        #[test]
        fn ler_versao_nunca_da_panic(texto in "\\PC*") {
            let _ = ler_versao(&texto);
            let _ = mais_nova("1.0.0", &texto);
        }

        #[test]
        fn da_resposta_nunca_da_panic(texto in "\\PC*") {
            let _ = da_resposta(&texto, "1.0.0");
        }

        #[test]
        fn versoes_validas_se_ordenam_como_os_numeros(a in 0u64..1000, b in 0u64..1000, c in 0u64..1000) {
            let texto = format!("{a}.{b}.{c}");
            let seguinte = format!("{a}.{b}.{}", c + 1);
            prop_assert_eq!(ler_versao(&texto), Some((a, b, c)));
            prop_assert!(!mais_nova(&texto, &texto));
            prop_assert!(mais_nova(&texto, &seguinte));
        }
    }
}
