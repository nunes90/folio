//! Pastas do app quando ele muda de identificador (o "Leitor" virou "Folio"): os dados e o
//! cache saem da pasta antiga para a nova, uma vez, na primeira abertura.
//!
//! Mover (`rename`) e não copiar: é instantâneo, não duplica os livros e é atômico (ou foi
//! tudo, ou nada). Se não der (ex.: as pastas estão em discos diferentes), o app segue usando
//! a pasta antiga, sem perder nada.

use std::path::{Path, PathBuf};

/// A pasta a usar: `nova`, depois de mover `antiga` para ela se só a antiga existir.
///
/// - `nova` já existe: fica `nova` (a migração já aconteceu, ou o app é novo), e `antiga`
///   não é tocada.
/// - Só `antiga` existe: `antiga` vira `nova`. Se mover falhar, fica `antiga`.
/// - Nenhuma existe: `nova` (quem abrir a biblioteca a cria).
pub fn pasta_migrada(nova: &Path, antiga: &Path) -> PathBuf {
    if nova.exists() || !antiga.exists() {
        return nova.to_path_buf();
    }
    let movida = nova
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .and_then(|()| std::fs::rename(antiga, nova));
    match movida {
        Ok(()) => {
            tracing::info!(de = %antiga.display(), para = %nova.display(), "pasta do app migrada");
            nova.to_path_buf()
        }
        Err(erro) => {
            tracing::warn!(%erro, pasta = %antiga.display(), "não foi possível migrar a pasta; segue a antiga");
            antiga.to_path_buf()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_a_antiga_existe_ela_vira_a_nova_com_tudo_dentro() {
        let dir = tempfile::tempdir().unwrap();
        let antiga = dir.path().join("io.github.nunes90.leitor");
        let nova = dir.path().join("io.github.nunes90.folio");
        std::fs::create_dir_all(antiga.join("livros")).unwrap();
        std::fs::write(antiga.join("biblioteca.sqlite3"), b"banco").unwrap();
        std::fs::write(antiga.join("livros/a.epub"), b"livro").unwrap();

        assert_eq!(pasta_migrada(&nova, &antiga), nova);
        assert!(!antiga.exists());
        assert_eq!(
            std::fs::read(nova.join("biblioteca.sqlite3")).unwrap(),
            b"banco"
        );
        assert_eq!(std::fs::read(nova.join("livros/a.epub")).unwrap(), b"livro");
    }

    #[test]
    fn a_nova_ja_existe_nada_muda() {
        let dir = tempfile::tempdir().unwrap();
        let (antiga, nova) = (dir.path().join("antiga"), dir.path().join("nova"));
        std::fs::create_dir_all(&antiga).unwrap();
        std::fs::create_dir_all(&nova).unwrap();
        std::fs::write(antiga.join("x"), b"antigo").unwrap();

        assert_eq!(pasta_migrada(&nova, &antiga), nova);
        assert!(antiga.join("x").exists(), "a antiga não é tocada");
    }

    #[test]
    fn nenhuma_existe_fica_a_nova_sem_criar_nada() {
        let dir = tempfile::tempdir().unwrap();
        let (antiga, nova) = (dir.path().join("antiga"), dir.path().join("nova"));
        assert_eq!(pasta_migrada(&nova, &antiga), nova);
        assert!(!nova.exists());
    }

    #[test]
    fn se_nao_der_para_mover_segue_a_antiga_sem_perder_nada() {
        let dir = tempfile::tempdir().unwrap();
        let antiga = dir.path().join("antiga");
        std::fs::create_dir_all(&antiga).unwrap();
        std::fs::write(antiga.join("x"), b"dados").unwrap();
        // O "pai" da nova é um arquivo: não dá para criar a pasta nem mover para lá.
        std::fs::write(dir.path().join("arquivo"), b"").unwrap();
        let nova = dir.path().join("arquivo/nova");

        assert_eq!(pasta_migrada(&nova, &antiga), antiga);
        assert_eq!(std::fs::read(antiga.join("x")).unwrap(), b"dados");
    }
}
