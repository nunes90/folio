// Sem janela de console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod logging;

use anyhow::Context;

fn main() -> anyhow::Result<()> {
    // Antes do logging: init() cria uma thread, e set_var só é seguro sem outras threads.
    let dmabuf_desligado = contornar_dmabuf_nvidia();

    // O guard precisa viver até o fim do main: ao ser dropado, esvazia o buffer do arquivo de log.
    let _guard = logging::init()?;
    tracing::info!(versao = leitor_core::VERSION, "iniciando o leitor");
    if dmabuf_desligado {
        tracing::info!("NVIDIA detectada: WEBKIT_DISABLE_DMABUF_RENDERER=1");
    }

    tauri::Builder::default()
        // skip_logger: o plugin não instala logger próprio. Os logs do frontend
        // chegam pelo crate `log` e o tracing-log os encaminha ao mesmo arquivo.
        .plugin(tauri_plugin_log::Builder::new().skip_logger().build())
        .run(tauri::generate_context!())
        .context("falha ao executar o app Tauri")
}

/// WebKitGTK + driver NVIDIA no Wayland derruba a janela com
/// "Error 71 (Protocol error)" no renderizador DMABUF. Desliga-o, a menos que
/// o usuário já tenha definido a variável. Retorna se o contorno foi aplicado.
#[cfg(target_os = "linux")]
fn contornar_dmabuf_nvidia() -> bool {
    const VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
    if std::env::var_os(VAR).is_some() || !std::path::Path::new("/proc/driver/nvidia").exists() {
        return false;
    }
    // SAFETY: chamado no início do main, antes de qualquer outra thread existir.
    unsafe { std::env::set_var(VAR, "1") };
    true
}

#[cfg(not(target_os = "linux"))]
fn contornar_dmabuf_nvidia() -> bool {
    false
}
