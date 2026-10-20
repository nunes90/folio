//! Abrir um livro do disco.

use std::io;
use std::path::{Path, PathBuf};

use tracing::instrument;

use crate::formato::{self, ErroFormato, Formato};

/// Um livro lido do disco, com o formato já identificado.
#[derive(Debug)]
pub struct Livro {
    pub formato: Formato,
    pub bytes: Vec<u8>,
}

#[derive(Debug, thiserror::Error)]
pub enum ErroAbrir {
    // A causa (`fonte`) fica no `source()`, não na mensagem: quem exibe a cadeia de erros
    // (ex.: anyhow com `{:#}`) já a mostra, e assim ela não aparece duplicada.
    #[error("não foi possível ler {}", caminho.display())]
    Io {
        caminho: PathBuf,
        #[source]
        fonte: io::Error,
    },
    #[error(transparent)]
    Formato(#[from] ErroFormato),
}

/// Lê o arquivo inteiro e identifica o formato.
#[instrument(skip_all, fields(caminho = %caminho.display()))]
pub fn abrir(caminho: &Path) -> Result<Livro, ErroAbrir> {
    let bytes = std::fs::read(caminho).map_err(|fonte| ErroAbrir::Io {
        caminho: caminho.to_path_buf(),
        fonte,
    })?;
    let formato = formato::detectar(&bytes)?;
    tracing::info!(?formato, tamanho = bytes.len(), "livro aberto");
    Ok(Livro { formato, bytes })
}
