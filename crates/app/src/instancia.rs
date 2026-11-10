//! Uma instância só (M30). Abrir um segundo livro pelo gerenciador de arquivos ("Abrir com")
//! iniciava outro processo do app sobre o mesmo banco: duas sessões de leitura, duas vozes. Agora
//! o segundo processo entrega o arquivo ao que já está aberto e sai (`tauri-plugin-single-instance`,
//! que no Linux usa um nome no D-Bus da sessão).

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, Manager, Runtime};

/// O evento que a página ouve: o caminho do livro a abrir, ou `null` (o app só foi chamado de novo).
pub const EVENTO: &str = "abrir-arquivo";

/// Em compilações de depuração a instância única fica desligada, para o `cargo tauri dev` abrir
/// ao lado do Folio instalado. `FOLIO_INSTANCIA_UNICA=1` a liga (os testes E2E).
pub fn ligada() -> bool {
    match std::env::var("FOLIO_INSTANCIA_UNICA").as_deref() {
        Ok("1") => true,
        Ok("0") => false,
        _ => !cfg!(debug_assertions),
    }
}

/// O arquivo pedido na linha de comando de outra instância (`argv[1]`), como caminho absoluto:
/// um caminho relativo vale a partir da pasta de onde ela foi chamada, não da nossa.
pub fn arquivo_pedido(argv: &[String], pasta: &str) -> Option<PathBuf> {
    let arquivo = argv
        .get(1)
        .filter(|a| !a.is_empty() && !a.starts_with('-'))?;
    Some(Path::new(pasta).join(arquivo))
}

/// Outra instância foi iniciada: traz a janela para a frente e manda o arquivo dela à página.
pub fn ao_chamar_de_novo<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>, pasta: String) {
    let arquivo = arquivo_pedido(&argv, &pasta);
    tracing::info!(?arquivo, "outra instância chamada: o pedido veio para esta");
    if let Some(janela) = app.get_webview_window("main") {
        // No Wayland, o compositor decide se a janela ganha o foco; pedir não faz mal.
        let _ = janela.unminimize();
        let _ = janela.set_focus();
    }
    if let Err(erro) = app.emit(EVENTO, arquivo) {
        tracing::warn!(%erro, "falha ao avisar a página do arquivo pedido");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(partes: &[&str]) -> Vec<String> {
        partes.iter().map(|p| p.to_string()).collect()
    }

    #[test]
    fn caminho_absoluto_fica_como_veio() {
        assert_eq!(
            arquivo_pedido(&argv(&["folio", "/livros/a.epub"]), "/home/x"),
            Some(PathBuf::from("/livros/a.epub"))
        );
    }

    #[test]
    fn caminho_relativo_parte_da_pasta_de_quem_chamou() {
        assert_eq!(
            arquivo_pedido(&argv(&["folio", "a.pdf"]), "/home/x/Livros"),
            Some(PathBuf::from("/home/x/Livros/a.pdf"))
        );
    }

    #[test]
    fn sem_arquivo_ou_com_opcao_nao_ha_pedido() {
        assert_eq!(arquivo_pedido(&argv(&["folio"]), "/home/x"), None);
        assert_eq!(arquivo_pedido(&argv(&["folio", ""]), "/home/x"), None);
        assert_eq!(
            arquivo_pedido(&argv(&["folio", "--versao"]), "/home/x"),
            None
        );
        assert_eq!(arquivo_pedido(&[], "/home/x"), None);
    }
}
