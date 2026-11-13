//! Links que saem do livro (M35c): o que o app aceita abrir no navegador.
//!
//! O endereço vem do livro (um EPUB ou um PDF de qualquer origem): só `http` e `https` passam, com
//! um host, sem usuário e senha embutidos. Outros esquemas (`file:`, `javascript:`, `mailto:`, um
//! esquema de outro programa) poderiam abrir arquivos locais ou rodar algo; o frontend também
//! confere, mas a decisão é esta.

use url::Url;

/// Um endereço longo demais não é de um link de verdade.
const TAMANHO_MAXIMO: usize = 2048;

/// Um link externo que pode ser aberto: o endereço, já normalizado, e o host (para a confirmação).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Externo {
    pub url: String,
    pub host: String,
}

/// O endereço `href`, se for um link que o app aceita abrir no navegador.
pub fn externo(href: &str) -> Option<Externo> {
    let href = href.trim();
    if href.is_empty() || href.len() > TAMANHO_MAXIMO || href.chars().any(char::is_control) {
        return None;
    }
    let url = Url::parse(href).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    // `https://banco.com@golpe.example/`: o host de verdade é o segundo, e a confirmação
    // mostraria um nome enganoso. Um link de livro não precisa de usuário nem senha.
    if !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let host = url.host_str()?.to_string();
    Some(Externo {
        url: url.to_string(),
        host,
    })
}

/// A janela do app pode ir a este endereço? Só aos do próprio app: a página (`tauri://localhost`
/// ou, no `cargo tauri dev`, o Vite em `http://localhost`), as capas (`asset:`) e o que a própria
/// página cria (`blob:`, `about:`, `data:`). Um endereço da web, nunca: um link de PDF chegava a
/// levar a janela inteira para um site, sem caminho de volta ao livro.
pub fn navegacao_do_app(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "ipc" | "blob" | "about" | "data" => true,
        "http" | "https" => matches!(
            url.host_str(),
            Some(
                "localhost" | "127.0.0.1" | "tauri.localhost" | "asset.localhost" | "ipc.localhost"
            )
        ),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn http_e_https_passam_normalizados() {
        assert_eq!(
            externo("  https://Example.org/a b?x=1#y "),
            Some(Externo {
                url: "https://example.org/a%20b?x=1#y".into(),
                host: "example.org".into(),
            })
        );
        assert_eq!(externo("http://127.0.0.1:8080/").unwrap().host, "127.0.0.1");
    }

    #[test]
    fn outros_esquemas_nao() {
        for href in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "mailto:alguem@example.org",
            "ftp://example.org/",
            "data:text/html,oi",
            "steam://run/1",
            "notas.xhtml#n1",
            "",
        ] {
            assert_eq!(externo(href), None, "{href}");
        }
    }

    #[test]
    fn usuario_e_senha_no_endereco_nao() {
        assert_eq!(externo("https://banco.com@golpe.example/"), None);
        assert_eq!(externo("https://a:b@example.org/"), None);
    }

    #[test]
    fn controle_e_tamanho_nao() {
        assert_eq!(externo("https://example.org/\u{0}x"), None);
        assert_eq!(
            externo(&format!("https://example.org/{}", "a".repeat(3000))),
            None
        );
    }

    #[test]
    fn a_janela_so_vai_a_enderecos_do_app() {
        let pode = |u: &str| navegacao_do_app(&Url::parse(u).unwrap());
        for u in [
            "tauri://localhost",
            "tauri://localhost/index.html",
            "http://localhost:5173/",
            "http://tauri.localhost/",
            "asset://localhost/capa.jpg",
            "blob:tauri://localhost/9659cc1b",
            "about:blank",
        ] {
            assert!(pode(u), "{u}");
        }
        for u in [
            "https://example.org/",
            "http://localhost.example.org/",
            "file:///etc/passwd",
            "mailto:alguem@example.org",
        ] {
            assert!(!pode(u), "{u}");
        }
    }

    proptest! {
        /// Qualquer texto: não dá pânico, e o que passa é sempre http(s) com host.
        #[test]
        fn nunca_entra_em_panico(href in ".{0,300}") {
            if let Some(e) = externo(&href) {
                prop_assert!(e.url.starts_with("http://") || e.url.starts_with("https://"));
                prop_assert!(!e.host.is_empty());
            }
        }
    }
}
