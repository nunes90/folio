// Sem janela de console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod comandos;
mod escala;
mod logging;

use std::path::{Path, PathBuf};

use anyhow::Context;
use tauri::{Emitter, Manager};

/// Identificador do app (o mesmo do tauri.conf.json): nomeia as pastas de dados e de cache.
const IDENTIFICADOR: &str = "io.github.nunes90.folio";
/// Identificador quando o app se chamava "Leitor".
const IDENTIFICADOR_ANTIGO: &str = "io.github.nunes90.leitor";

/// Pastas de dados e de cache do app, depois de trazer as antigas (do "Leitor"), se só elas
/// existirem. Roda antes do Tauri: o WebKitGTK cria a pasta de dados nova para o cache dele ao
/// iniciar, e aí a migração achava a pasta nova "já existente" e não movia a biblioteca.
/// `directories` dá as mesmas pastas que o Tauri (`dirs::data_dir()`/`cache_dir()` +
/// identificador).
fn pastas_do_app() -> Option<(PathBuf, PathBuf)> {
    let base = directories::BaseDirs::new()?;
    let migrar = |raiz: &Path| {
        folio_core::pastas::pasta_migrada(
            &raiz.join(IDENTIFICADOR),
            &raiz.join(IDENTIFICADOR_ANTIGO),
        )
    };
    Some((migrar(base.data_dir()), migrar(base.cache_dir())))
}

fn main() -> anyhow::Result<()> {
    // Antes do logging: init() cria uma thread, e set_var só é seguro sem outras threads.
    let dmabuf_desligado = contornar_dmabuf_nvidia();

    // O guard precisa viver até o fim do main: ao ser dropado, esvazia o buffer do arquivo de log.
    let _guard = logging::init()?;
    // Antes do Tauri (ver pastas_do_app): depois do logging, para a migração aparecer no log.
    let pastas = pastas_do_app();
    tracing::info!(versao = folio_core::VERSION, "iniciando o Folio");
    if dmabuf_desligado {
        tracing::info!("NVIDIA detectada: WEBKIT_DISABLE_DMABUF_RENDERER=1");
    }

    tauri::Builder::default()
        // skip_logger: o plugin não instala logger próprio. Os logs do frontend
        // chegam pelo crate `log` e o tracing-log os encaminha ao mesmo arquivo.
        .plugin(tauri_plugin_log::Builder::new().skip_logger().build())
        .plugin(tauri_plugin_dialog::init())
        // `move`: o setup leva as pastas consigo (roda uma vez, depois que o main já seguiu).
        .setup(move |app| {
            escala::configurar(app.handle())?;
            // Dados (banco e livros) e cache de capas nos diretórios do app no sistema.
            // O escopo do protocolo de assets (tauri.conf.json) libera só $APPCACHE/capas.
            let caminhos = app.path();
            let (dados, cache) = match pastas {
                Some(pastas) => pastas,
                None => (caminhos.app_data_dir()?, caminhos.app_cache_dir()?),
            };
            let biblioteca =
                folio_core::biblioteca::Biblioteca::abrir(&dados, &cache.join("capas"))?;
            app.manage(comandos::EstadoBiblioteca::new(biblioteca));

            // Voz é opcional: sem o speech-dispatcher, o app abre e só a leitura em voz alta
            // fica indisponível. Os eventos do motor vão ao frontend como o evento `voz`.
            let app_voz = app.handle().clone();
            let motor = folio_core::voz::SpeechDispatcher::conectar(move |evento| {
                if let Err(erro) = app_voz.emit("voz", evento) {
                    tracing::warn!(%erro, "falha ao enviar evento de voz");
                }
            })
            .map(|m| Box::new(m) as Box<dyn folio_core::voz::MotorDeVoz>)
            .inspect_err(|erro| tracing::warn!(%erro, "leitura em voz alta indisponível"))
            .ok();
            app.manage(comandos::EstadoVoz(motor));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::listar_livros,
            comandos::importar_livros,
            comandos::listar_lixeira,
            comandos::listar_colecoes,
            comandos::criar_colecao,
            comandos::renomear_colecao,
            comandos::apagar_colecao,
            comandos::adicionar_a_colecao,
            comandos::remover_da_colecao,
            comandos::listar_destaques,
            comandos::criar_destaque,
            comandos::definir_cor_destaque,
            comandos::definir_motivo_destaque,
            comandos::definir_nota_destaque,
            comandos::apagar_destaque,
            comandos::restaurar_destaque,
            comandos::exportar_destaques,
            comandos::definir_favorito,
            comandos::definir_para_ler,
            comandos::definir_lido,
            comandos::mover_para_lixeira,
            comandos::restaurar_livro,
            comandos::apagar_livro,
            comandos::esvaziar_lixeira,
            comandos::abrir_livro,
            comandos::arquivo_livro,
            comandos::definir_capa,
            comandos::progresso_livro,
            comandos::salvar_progresso,
            comandos::iniciar_sessao,
            comandos::registrar_sessao,
            comandos::encerrar_sessao,
            comandos::listar_sessoes,
            comandos::ritmo_de_leitura,
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
