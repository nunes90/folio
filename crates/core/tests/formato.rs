use std::path::PathBuf;

use leitor_core::formato::{ErroFormato, Formato, detectar};
use leitor_core::livro::{ErroAbrir, abrir};
use proptest::prelude::*;

fn fixture(nome: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(nome)
}

fn detectar_fixture(nome: &str) -> Result<Formato, ErroFormato> {
    let bytes = std::fs::read(fixture(nome)).expect("fixture deve existir");
    detectar(&bytes)
}

#[test]
fn epub_real_do_gutenberg() {
    assert_eq!(detectar_fixture("dom-casmurro.epub"), Ok(Formato::Epub));
}

#[test]
fn epub_minimo() {
    assert_eq!(detectar_fixture("minimo.epub"), Ok(Formato::Epub));
}

#[test]
fn pdf_minimo() {
    assert_eq!(detectar_fixture("minimo.pdf"), Ok(Formato::Pdf));
}

#[test]
fn pdf_com_lixo_antes_da_assinatura() {
    assert_eq!(detectar_fixture("pdf-com-lixo-antes.pdf"), Ok(Formato::Pdf));
}

#[test]
fn arquivo_vazio() {
    assert_eq!(
        detectar_fixture("quebrados/vazio.epub"),
        Err(ErroFormato::Vazio)
    );
}

#[test]
fn quebrados_sao_desconhecidos() {
    for nome in [
        "quebrados/mimetype-errado.epub",
        "quebrados/sem-mimetype.epub",
        "quebrados/mimetype-comprimido.epub",
        "quebrados/truncado.epub",
        "quebrados/texto.epub",
    ] {
        assert_eq!(
            detectar_fixture(nome),
            Err(ErroFormato::Desconhecido),
            "{nome}"
        );
    }
}

#[test]
fn abrir_devolve_formato_e_bytes() {
    let livro = abrir(&fixture("minimo.epub")).unwrap();
    assert_eq!(livro.formato, Formato::Epub);
    assert_eq!(livro.bytes, std::fs::read(fixture("minimo.epub")).unwrap());
}

#[test]
fn abrir_arquivo_inexistente_da_erro_de_io() {
    let erro = abrir(&fixture("nao-existe.epub")).unwrap_err();
    assert!(matches!(erro, ErroAbrir::Io { .. }), "{erro:?}");
    assert!(erro.to_string().contains("nao-existe.epub"), "{erro}");
}

#[test]
fn abrir_formato_desconhecido() {
    let erro = abrir(&fixture("quebrados/texto.epub")).unwrap_err();
    assert!(
        matches!(erro, ErroAbrir::Formato(ErroFormato::Desconhecido)),
        "{erro:?}"
    );
}

proptest! {
    // Parsers não podem dar panic, seja qual for a entrada.
    #[test]
    fn detectar_nunca_da_panic(bytes in proptest::collection::vec(any::<u8>(), 0..4096)) {
        let _ = detectar(&bytes);
    }

    // Mesma coisa, mas começando com um cabeçalho ZIP para exercitar a leitura dos tamanhos.
    #[test]
    fn detectar_cabecalho_zip_arbitrario_nunca_da_panic(
        resto in proptest::collection::vec(any::<u8>(), 0..512),
    ) {
        let mut bytes = b"PK\x03\x04".to_vec();
        bytes.extend(resto);
        let _ = detectar(&bytes);
    }
}
