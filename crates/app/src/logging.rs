//! Logging: stderr + arquivo com rotação diária.
//!
//! Filtro via `RUST_LOG` (ex.: `RUST_LOG=folio=debug`); padrão `info`.

use std::path::PathBuf;

use anyhow::Context;
use directories::{BaseDirs, ProjectDirs};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{EnvFilter, fmt, prelude::*};

const APP: &str = "folio";
const MAX_ARQUIVOS: usize = 7;

/// Diretório de logs por plataforma:
/// - Linux: `~/.local/state/folio/logs` (respeita `XDG_STATE_HOME`)
/// - macOS: `~/Library/Logs/folio`
/// - outros: `<dados locais>/logs`
pub fn log_dir() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        return BaseDirs::new().map(|b| b.home_dir().join("Library/Logs").join(APP));
    }
    let dirs = ProjectDirs::from("", "", APP)?;
    let base = dirs.state_dir().unwrap_or_else(|| dirs.data_local_dir());
    Some(base.join("logs"))
}

/// Inicializa o subscriber global. Guarde o `WorkerGuard` até o fim do programa.
pub fn init() -> anyhow::Result<WorkerGuard> {
    let dir = log_dir().context("não foi possível determinar o diretório de logs")?;
    std::fs::create_dir_all(&dir).with_context(|| format!("criando {}", dir.display()))?;

    let arquivo = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(APP)
        .filename_suffix("log")
        .max_log_files(MAX_ARQUIVOS)
        .build(&dir)
        .context("criando o appender de arquivo")?;
    let (escritor, guard) = tracing_appender::non_blocking(arquivo);

    let filtro = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    // try_init também instala o LogTracer (feature `tracing-log`), que converte
    // registros do crate `log` (Tauri, plugins, frontend) em eventos tracing.
    //
    // A camada do arquivo vem primeiro: as duas camadas compartilham o cache dos campos
    // formatados de cada span, e quem formata primeiro decide. Se fosse a do stderr, os
    // códigos de cor ANSI iriam parar no arquivo.
    tracing_subscriber::registry()
        .with(filtro)
        .with(fmt::layer().with_ansi(false).with_writer(escritor))
        .with(fmt::layer().with_writer(std::io::stderr))
        .try_init()
        .context("inicializando o tracing")?;

    tracing::debug!(dir = %dir.display(), "logs em arquivo");
    Ok(guard)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_dir_termina_no_lugar_certo() {
        let dir = log_dir().expect("home deve existir no ambiente de teste");
        if cfg!(target_os = "macos") {
            assert!(dir.ends_with("Library/Logs/folio"), "{}", dir.display());
        } else {
            assert!(dir.ends_with("folio/logs"), "{}", dir.display());
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn log_dir_linux_usa_state_dir() {
        let dir = log_dir().unwrap();
        let state = BaseDirs::new().unwrap().state_dir().unwrap().to_path_buf();
        assert!(dir.starts_with(state), "{}", dir.display());
    }
}
