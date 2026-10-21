// Sem janela de console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod comandos;
mod escala;
mod logging;

use anyhow::Context;
use tauri::{Emitter, Manager};

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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            escala::configurar(app.handle())?;
            // Dados (banco e livros) e cache de capas nos diretórios do app no sistema.
            // O escopo do protocolo de assets (tauri.conf.json) libera só $APPCACHE/capas.
            let caminhos = app.path();
            let biblioteca = leitor_core::biblioteca::Biblioteca::abrir(
                &caminhos.app_data_dir()?,
                &caminhos.app_cache_dir()?.join("capas"),
            )?;
            app.manage(comandos::EstadoBiblioteca::new(biblioteca));

            // Voz é opcional: sem o speech-dispatcher, o app abre e só a leitura em voz alta
            // fica indisponível. Os eventos do motor vão ao frontend como o evento `voz`.
            let app_voz = app.handle().clone();
            let motor = leitor_core::voz::SpeechDispatcher::conectar(move |evento| {
                if let Err(erro) = app_voz.emit("voz", evento) {
                    tracing::warn!(%erro, "falha ao enviar evento de voz");
                }
            })
            .map(|m| Box::new(m) as Box<dyn leitor_core::voz::MotorDeVoz>)
            .inspect_err(|erro| tracing::warn!(%erro, "leitura em voz alta indisponível"))
            .ok();
            app.manage(comandos::EstadoVoz(motor));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::listar_livros,
            comandos::importar_livros,
            comandos::abrir_livro,
            comandos::arquivo_livro,
            comandos::definir_capa,
            comandos::progresso_livro,
            comandos::salvar_progresso,
            comandos::preferencias_leitura,
            comandos::salvar_preferencias_leitura,
            comandos::voz_disponivel,
            comandos::falar,
            comandos::pausar_voz,
            comandos::retomar_voz,
            comandos::parar_voz,
            comandos::caminho_inicial,
            comandos::escala_texto
        ])
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
