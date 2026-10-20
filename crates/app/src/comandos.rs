//! Comandos Tauri: finos, só chamam o core e adaptam o resultado.

use std::path::PathBuf;

use leitor_core::formato::Formato;
use tauri::ipc::Response;

/// Lê um EPUB e devolve os bytes crus. O `Response` evita serializar o
/// arquivo como JSON (um array de números); o frontend recebe um ArrayBuffer.
#[tauri::command]
pub fn abrir_livro(caminho: PathBuf) -> Result<Response, String> {
    let livro = leitor_core::livro::abrir(&caminho).map_err(|e| registrar(&e))?;
    match livro.formato {
        Formato::Epub => Ok(Response::new(livro.bytes)),
        Formato::Pdf => Err("PDF ainda não é suportado".into()),
    }
}

/// Erros de comando precisam ser serializáveis; viram texto depois de ir para o log.
fn registrar(erro: &(dyn std::error::Error + 'static)) -> String {
    tracing::warn!(erro, "falha ao abrir livro");
    erro.to_string()
}

/// Caminho passado na linha de comando (`leitor livro.epub`), usado pelo "Abrir com…" do sistema.
#[tauri::command]
pub fn caminho_inicial() -> Option<PathBuf> {
    std::env::args_os().nth(1).map(PathBuf::from)
}

/// Escala de texto do sistema (1 = padrão); o frontend a aplica via CSS.
#[tauri::command]
pub fn escala_texto(estado: tauri::State<'_, crate::escala::EscalaTexto>) -> f64 {
    *estado.0.lock().unwrap()
}
