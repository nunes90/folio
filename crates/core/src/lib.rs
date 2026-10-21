//! Núcleo do Leitor: lógica pura, sem dependência de Tauri.

pub mod biblioteca;
pub mod epub;
pub mod formato;
pub mod livro;
pub mod metadados;
pub mod pdf;

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
