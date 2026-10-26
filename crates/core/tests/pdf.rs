use std::path::PathBuf;

use folio_core::pdf;
use proptest::prelude::*;

fn fixture(nome: &str) -> Vec<u8> {
    let caminho = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(nome);
    std::fs::read(caminho).expect("fixture deve existir")
}

#[test]
fn metadados_em_utf16() {
    let m = pdf::ler(&fixture("metadados-utf16.pdf")).unwrap();
    assert_eq!(m.titulo.as_deref(), Some("Memórias Póstumas"));
    assert_eq!(m.autores, ["Machado de Assis", "Outro"]);
}

#[test]
fn metadados_em_pdfdocencoding() {
    let m = pdf::ler(&fixture("metadados-pdfdoc.pdf")).unwrap();
    assert_eq!(m.titulo.as_deref(), Some("Café (edição)"));
    // Autor só com espaços conta como ausente.
    assert!(m.autores.is_empty());
}

#[test]
fn pdf_sem_info_nao_e_erro() {
    let m = pdf::ler(&fixture("minimo.pdf")).unwrap();
    assert_eq!(m.titulo, None);
    assert!(m.autores.is_empty());
}

#[test]
fn texto_nao_e_pdf() {
    assert!(pdf::ler(&fixture("quebrados/texto.epub")).is_err());
}

proptest! {
    #[test]
    fn ler_nunca_da_panic(bytes in proptest::collection::vec(any::<u8>(), 0..2048)) {
        let _ = pdf::ler(&bytes);
    }

    #[test]
    fn ler_com_cabecalho_pdf_nunca_da_panic(resto in proptest::collection::vec(any::<u8>(), 0..1024)) {
        let mut bytes = b"%PDF-1.7\n".to_vec();
        bytes.extend(resto);
        let _ = pdf::ler(&bytes);
    }
}
