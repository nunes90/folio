//! Metadados de PDF (dicionário `Info`: título e autor).
//!
//! A capa não sai daqui: renderizar uma página exige um motor de PDF. Quem gera a capa é o
//! pdf.js no frontend, que a devolve para a biblioteca (`Biblioteca::definir_capa`).

use lopdf::Document;

use crate::metadados::Metadados;

#[derive(Debug, thiserror::Error)]
// Para quem importa: o detalhe técnico (a causa do lopdf) fica na cadeia de erros, para o log.
#[error("o PDF está danificado ou incompleto")]
pub struct ErroPdf(#[from] lopdf::Error);

/// Lê título e autores. PDFs criptografados só com senha de dono (restrições de cópia ou
/// impressão) têm senha de usuário vazia e são lidos normalmente.
pub fn ler(bytes: &[u8]) -> Result<Metadados, ErroPdf> {
    let info = Document::load_metadata_mem(bytes)
        .or_else(|_| Document::load_metadata_mem_with_password(bytes, ""))?;
    Ok(Metadados {
        titulo: info.title.as_deref().and_then(limpar),
        autores: info
            .author
            .as_deref()
            .map(|a| a.split(';').filter_map(limpar).collect())
            .unwrap_or_default(),
        ..Metadados::default()
    })
}

/// Tira espaços e o BOM que o lopdf mantém em textos UTF-8; texto vazio vira `None`.
fn limpar(texto: &str) -> Option<String> {
    let texto = texto.trim_start_matches('\u{feff}').trim();
    (!texto.is_empty()).then(|| texto.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limpar_remove_bom_e_espacos() {
        assert_eq!(limpar("\u{feff} Título "), Some("Título".into()));
        assert_eq!(limpar("   "), None);
    }
}
