//! Metadados de um livro, comuns a todos os formatos.

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Metadados {
    pub titulo: Option<String>,
    pub autores: Vec<String>,
    pub idioma: Option<String>,
    pub identificador: Option<String>,
}
