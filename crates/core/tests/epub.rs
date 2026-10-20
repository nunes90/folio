use std::path::PathBuf;

use leitor_core::epub::{self, ErroEpub};
use proptest::prelude::*;

fn fixture(nome: &str) -> Vec<u8> {
    let caminho = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(nome);
    std::fs::read(caminho).expect("fixture deve existir")
}

#[test]
fn dom_casmurro() {
    let livro = epub::ler(&fixture("dom-casmurro.epub")).unwrap();
    insta::assert_debug_snapshot!(livro.metadados);
    let capa = livro.capa.expect("Dom Casmurro tem capa");
    assert_eq!(capa.tipo_midia, "image/jpeg");
    assert_eq!(capa.bytes.len(), 40_980);
    assert!(capa.bytes.starts_with(b"\xff\xd8"), "JPEG começa com FF D8");
}

#[test]
fn minimo_sem_capa() {
    let livro = epub::ler(&fixture("minimo.epub")).unwrap();
    assert_eq!(livro.metadados.titulo.as_deref(), Some("Livro Mínimo"));
    assert_eq!(livro.metadados.autores, ["Leitor"]);
    assert_eq!(livro.metadados.idioma.as_deref(), Some("pt-BR"));
    assert!(livro.capa.is_none());
}

#[test]
fn capa_epub3_com_href_codificado_e_entidades_no_titulo() {
    let livro = epub::ler(&fixture("capa-epub3.epub")).unwrap();
    assert_eq!(
        livro.metadados.titulo.as_deref(),
        Some("Tom & Jerry é um título")
    );
    // Ordem do documento: na fixture, "Autora Um" vem antes de "Leitor".
    assert_eq!(livro.metadados.autores, ["Autora Um", "Leitor"]);
    let capa = livro.capa.expect("tem capa");
    assert_eq!(capa.tipo_midia, "image/png");
    assert!(capa.bytes.starts_with(b"\x89PNG"));
}

#[test]
fn capa_epub2_por_meta_cover() {
    let capa = epub::ler(&fixture("capa-epub2.epub")).unwrap().capa;
    assert_eq!(capa.expect("tem capa").tipo_midia, "image/png");
}

#[test]
fn texto_nao_e_zip() {
    let erro = epub::ler(&fixture("quebrados/texto.epub")).unwrap_err();
    assert!(matches!(erro, ErroEpub::Zip(_)), "{erro:?}");
}

proptest! {
    #[test]
    fn ler_nunca_da_panic(bytes in proptest::collection::vec(any::<u8>(), 0..2048)) {
        let _ = epub::ler(&bytes);
    }
}
