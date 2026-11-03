// Sem janela de console no Windows em release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod comandos;
mod escala;
mod logging;
mod orca;
mod processo;
mod voz_natural;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Context;
use folio_core::voz::{MotorDeVoz, SpeechDispatcher};
use folio_core::voz_neural::MotorNeural;
use folio_core::voz_por_idioma::MotorPorIdioma;
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
            app.manage(processo::ProcessoRecuperado::default());
            #[cfg(target_os = "linux")]
            processo::vigiar(app.handle())?;
            // Dados (banco e livros) e cache de capas nos diretórios do app no sistema.
            // O escopo do protocolo de assets (tauri.conf.json) libera só $APPCACHE/capas.
            let caminhos = app.path();
            let (dados, cache) = match pastas {
                Some(pastas) => pastas,
                None => (caminhos.app_data_dir()?, caminhos.app_cache_dir()?),
            };
            let biblioteca =
                folio_core::biblioteca::Biblioteca::abrir(&dados, &cache.join("capas"))?;

            // Voz é opcional: sem o speech-dispatcher e sem a voz natural baixada, o app abre e
            // só a leitura em voz alta fica indisponível. Os eventos do motor em uso vão ao
            // frontend como o evento `voz`. O motor neural sempre existe (não carrega nada até
            // falar); a voz natural é ligada quando o modelo está baixado (`EstadoVoz::aplicar`).
            let app_voz = app.handle().clone();
            let mut neural = None;
            let motor = MotorPorIdioma::novo(
                move |evento| {
                    if let Err(erro) = app_voz.emit("voz", evento) {
                        tracing::warn!(%erro, "falha ao enviar evento de voz");
                    }
                },
                |ao_evento| {
                    SpeechDispatcher::conectar(ao_evento)
                        .map(|m| Box::new(m) as Box<dyn MotorDeVoz>)
                        .inspect_err(|erro| tracing::warn!(%erro, "speech-dispatcher indisponível"))
                        .ok()
                },
                |ao_evento| {
                    let motor = Arc::new(MotorNeural::novo(ao_evento));
                    neural = Some(Arc::clone(&motor));
                    Some(Box::new(motor) as Box<dyn MotorDeVoz>)
                },
            );
            let neural = neural.context("motor neural não criado")?;
            let voz = voz_natural::EstadoVoz::novo(motor, neural, &dados);
            voz.aplicar(&biblioteca.preferencias_leitura().unwrap_or_default());
            if !voz.motor()?.disponivel() {
                tracing::warn!("leitura em voz alta indisponível até baixar a voz natural");
            }
            app.manage(comandos::EstadoBiblioteca::new(biblioteca));
            app.manage(voz);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::processo_recuperado,
            comandos::anunciar_ao_leitor_de_tela,
            comandos::listar_livros,
            comandos::abrir_por_trechos,
            comandos::trecho_livro,
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
            comandos::tamanho_livro,
            comandos::definir_capa,
            comandos::progresso_livro,
            comandos::salvar_progresso,
            comandos::iniciar_sessao,
            comandos::registrar_sessao,
            comandos::encerrar_sessao,
            comandos::listar_sessoes,
            comandos::ritmo_de_leitura,
            comandos::visitar_trecho,
            comandos::trechos_revisitados,
            comandos::preferencias_leitura,
            comandos::salvar_preferencias_leitura,
            comandos::voz_disponivel,
            comandos::falar,
            comandos::pausar_voz,
            comandos::retomar_voz,
            comandos::parar_voz,
            voz_natural::vozes_naturais,
            voz_natural::baixar_voz_natural,
            voz_natural::cancelar_download_voz,
            voz_natural::remover_voz_natural,
            voz_natural::ouvir_amostra_voz,
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
