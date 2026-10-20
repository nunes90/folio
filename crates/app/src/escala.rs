//! Escala de texto do sistema.
//!
//! No Linux, o WebKitGTK transforma a escala de texto do GTK (`gtk-xft-dpi`) em zoom da
//! página, e dentro de iframes esse zoom é aplicado duas vezes: as medidas do foliate-js
//! deixam de bater e as páginas saem cortadas. Por isso o zoom da webview é mantido em 1
//! e a escala é repassada ao frontend, que a aplica via CSS (interface e livro).
//! No macOS não há zoom implícito: a escala é sempre 1.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

/// Evento emitido ao frontend quando a escala muda com o app aberto.
pub const EVENTO: &str = "escala-texto";

/// Escala atual, consultada pelo frontend ao iniciar.
#[derive(Default)]
pub struct EscalaTexto(pub Mutex<f64>);

/// DPI de referência: escala 1.
#[cfg(target_os = "linux")]
const DPI_BASE: f64 = 96.0;

/// Converte `gtk-xft-dpi` (DPI × 1024; ≤ 0 significa "não definido") em fator de escala.
#[cfg(target_os = "linux")]
pub fn fator_de_xft_dpi(xft_dpi: i32) -> f64 {
    if xft_dpi <= 0 {
        return 1.0;
    }
    f64::from(xft_dpi) / 1024.0 / DPI_BASE
}

/// Lê a escala do sistema, compensa o zoom da janela e passa a acompanhar mudanças.
pub fn configurar<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let janela = app
        .get_webview_window("main")
        .expect("a janela main é criada pelo tauri.conf.json");
    app.manage(EscalaTexto::default());
    aplicar(app, &janela, fator_do_sistema())?;
    observar(app.clone(), janela);
    Ok(())
}

fn aplicar<R: Runtime>(
    app: &AppHandle<R>,
    janela: &WebviewWindow<R>,
    fator: f64,
) -> tauri::Result<()> {
    // set_zoom é relativo ao zoom que o WebKitGTK já aplica; 1/fator o anula.
    janela.set_zoom(1.0 / fator)?;
    *app.state::<EscalaTexto>().0.lock().unwrap() = fator;
    tracing::info!(fator, "escala de texto");
    app.emit(EVENTO, fator)
}

#[cfg(target_os = "linux")]
fn fator_do_sistema() -> f64 {
    use gtk::prelude::*;
    gtk::Settings::default().map_or(1.0, |s| fator_de_xft_dpi(s.gtk_xft_dpi()))
}

#[cfg(target_os = "linux")]
fn observar<R: Runtime>(app: AppHandle<R>, janela: WebviewWindow<R>) {
    use gtk::prelude::*;
    let Some(settings) = gtk::Settings::default() else {
        return;
    };
    settings.connect_gtk_xft_dpi_notify(move |s| {
        if let Err(erro) = aplicar(&app, &janela, fator_de_xft_dpi(s.gtk_xft_dpi())) {
            tracing::warn!(%erro, "falha ao atualizar a escala de texto");
        }
    });
}

#[cfg(not(target_os = "linux"))]
fn fator_do_sistema() -> f64 {
    1.0
}

#[cfg(not(target_os = "linux"))]
fn observar<R: Runtime>(_app: AppHandle<R>, _janela: WebviewWindow<R>) {}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn dpi_padrao_e_escala_1() {
        assert_eq!(fator_de_xft_dpi(96 * 1024), 1.0);
    }

    #[test]
    fn dpi_ampliado() {
        // Valor real de um GNOME com escala de texto 1,3636.
        assert!((fator_de_xft_dpi(134_047) - 1.3636).abs() < 1e-3);
    }

    #[test]
    fn nao_definido_e_escala_1() {
        assert_eq!(fator_de_xft_dpi(0), 1.0);
        assert_eq!(fator_de_xft_dpi(-1), 1.0);
    }
}
