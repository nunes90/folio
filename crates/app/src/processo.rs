//! O processo da página pode cair (ver `e2e/atspi/rodar.sh`) e a janela ficaria parada, sem aviso.
//! Aqui ela recarrega; o frontend pergunta ao iniciar se foi por isso e avisa quem está lendo.

use std::sync::atomic::{AtomicBool, Ordering};

/// A página recarregou depois de uma queda: consultado uma vez pelo frontend.
#[derive(Default)]
pub struct ProcessoRecuperado(AtomicBool);

impl ProcessoRecuperado {
    /// Devolve se houve recarga desde a última consulta e zera.
    pub fn consumir(&self) -> bool {
        self.0.swap(false, Ordering::SeqCst)
    }
}

/// Passa a vigiar o processo da página da janela principal.
#[cfg(target_os = "linux")]
pub fn vigiar(app: &tauri::AppHandle) -> anyhow::Result<()> {
    use anyhow::Context;
    use folio_core::recuperacao::Recuperacoes;
    use std::cell::RefCell;
    use std::time::Instant;
    use tauri::Manager;
    use webkit2gtk::{WebProcessTerminationReason, WebViewExt};

    let janela = app
        .get_webview_window("main")
        .context("sem a janela principal")?;
    let app = app.clone();
    janela.with_webview(move |webview| {
        // O sinal pede um `Fn` (sem `mut`), mas só chega na thread da interface: `RefCell` basta.
        let recuperacoes = RefCell::new(Recuperacoes::default());
        webview
            .inner()
            .connect_web_process_terminated(move |webview, motivo| {
                tracing::error!(?motivo, "o processo da página caiu");
                // Só quando fechamos a janela o próprio app o encerra.
                if motivo == WebProcessTerminationReason::TerminatedByApi {
                    return;
                }
                if recuperacoes.borrow_mut().pode_recarregar(Instant::now()) {
                    app.state::<ProcessoRecuperado>()
                        .0
                        .store(true, Ordering::SeqCst);
                    webview.reload();
                } else {
                    // Uma janela em branco, sem aviso, é pior que fechar: o erro fica no log.
                    tracing::error!("o processo da página continua caindo: fechando o app");
                    app.exit(1);
                }
            });
    })?;
    Ok(())
}
