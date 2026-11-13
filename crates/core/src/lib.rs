//! Núcleo do Folio: lógica pura, sem dependência de Tauri.

pub mod baixar;
pub mod biblioteca;
pub mod catalogo_vozes;
pub mod destaques;
pub mod epub;
pub mod formato;
pub mod kokoro;
pub mod links;
pub mod livro;
pub mod metadados;
pub mod miniatura;
pub mod pastas;
pub mod pdf;
pub mod piper;
pub mod preferencias;
pub mod recuperacao;
pub mod sessoes;
mod ssip;
pub mod visitas;
pub mod voz;
pub mod voz_neural;
pub mod voz_por_idioma;

/// Versão do núcleo, exposta para o app registrar no log de inicialização.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versao_nao_vazia() {
        assert!(!VERSION.is_empty());
    }
}
