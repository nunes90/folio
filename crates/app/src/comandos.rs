//! Comandos Tauri: finos, só chamam o core e adaptam o resultado.

use std::path::PathBuf;
use std::sync::Mutex;

use leitor_core::biblioteca::{Biblioteca, LivroNaBiblioteca, Progresso};
use serde::Serialize;
use tauri::State;
use tauri::ipc::Response;

/// A conexão SQLite não pode ser usada por duas threads ao mesmo tempo, daí o Mutex.
pub type EstadoBiblioteca = Mutex<Biblioteca>;

#[tauri::command]
pub fn listar_livros(bib: State<'_, EstadoBiblioteca>) -> Result<Vec<LivroNaBiblioteca>, String> {
    bib.lock().unwrap().listar().map_err(|e| registrar(&e))
}

#[derive(Serialize)]
pub struct Falha {
    caminho: PathBuf,
    erro: String,
}

#[derive(Serialize)]
pub struct Importacao {
    importados: Vec<LivroNaBiblioteca>,
    falhas: Vec<Falha>,
}

/// Importa vários arquivos; um que falhe não impede os outros.
#[tauri::command]
pub fn importar_livros(bib: State<'_, EstadoBiblioteca>, caminhos: Vec<PathBuf>) -> Importacao {
    let bib = bib.lock().unwrap();
    let mut resultado = Importacao {
        importados: Vec::new(),
        falhas: Vec::new(),
    };
    for caminho in caminhos {
        match bib.importar(&caminho) {
            Ok(livro) => resultado.importados.push(livro),
            Err(e) => resultado.falhas.push(Falha {
                erro: registrar(&e),
                caminho,
            }),
        }
    }
    resultado
}

/// Bytes crus do livro. O `Response` evita serializar o arquivo como JSON (um array de
/// números); o frontend recebe um ArrayBuffer.
#[tauri::command]
pub fn abrir_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<Response, String> {
    let bytes = bib.lock().unwrap().ler(&id).map_err(|e| registrar(&e))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn progresso_livro(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
) -> Result<Option<Progresso>, String> {
    bib.lock()
        .unwrap()
        .progresso(&id)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn salvar_progresso(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    progresso: Progresso,
) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .salvar_progresso(&id, &progresso)
        .map_err(|e| registrar(&e))
}

/// Erros de comando precisam ser serializáveis; viram texto depois de ir para o log.
fn registrar(erro: &(dyn std::error::Error + 'static)) -> String {
    tracing::warn!(erro, "comando falhou");
    erro.to_string()
}

/// Caminho passado na linha de comando (`leitor livro.epub`), usado pelo "Abrir com…" do sistema.
#[tauri::command]
pub fn caminho_inicial() -> Option<PathBuf> {
    std::env::args_os().nth(1).map(PathBuf::from)
}

/// Escala de texto do sistema (1 = padrão); o frontend a aplica via CSS.
#[tauri::command]
pub fn escala_texto(estado: State<'_, crate::escala::EscalaTexto>) -> f64 {
    *estado.0.lock().unwrap()
}
