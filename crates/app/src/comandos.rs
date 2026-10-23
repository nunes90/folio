//! Comandos Tauri: finos, só chamam o core e adaptam o resultado.

use std::path::PathBuf;
use std::sync::Mutex;

use leitor_core::biblioteca::{Biblioteca, Importado, LivroNaBiblioteca, Progresso};
use leitor_core::epub::Capa;
use leitor_core::preferencias::PreferenciasLeitura;
use leitor_core::voz::{ConfigVoz, MotorDeVoz};
use serde::Serialize;
use tauri::State;
use tauri::ipc::{InvokeBody, Request, Response};

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
#[serde(rename_all = "camelCase")]
pub struct Importacao {
    importados: Vec<LivroNaBiblioteca>,
    /// Arquivos que já estavam na biblioteca (nada foi copiado).
    ja_existentes: Vec<LivroNaBiblioteca>,
    falhas: Vec<Falha>,
}

/// Importa vários arquivos; um que falhe não impede os outros.
#[tauri::command]
pub fn importar_livros(bib: State<'_, EstadoBiblioteca>, caminhos: Vec<PathBuf>) -> Importacao {
    let bib = bib.lock().unwrap();
    let mut resultado = Importacao {
        importados: Vec::new(),
        ja_existentes: Vec::new(),
        falhas: Vec::new(),
    };
    for caminho in caminhos {
        match bib.importar(&caminho) {
            Ok(Importado::Novo(livro)) => resultado.importados.push(livro),
            Ok(Importado::JaExistia(livro)) => resultado.ja_existentes.push(livro),
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

/// Remove o livro da biblioteca (a cópia do app; o arquivo original não é tocado).
#[tauri::command]
pub fn remover_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<(), String> {
    bib.lock().unwrap().remover(&id).map_err(|e| registrar(&e))
}

/// Bytes do livro sem marcá-lo como aberto (usado para gerar a capa de PDFs).
#[tauri::command]
pub fn arquivo_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<Response, String> {
    let bytes = bib
        .lock()
        .unwrap()
        .arquivo(&id)
        .map_err(|e| registrar(&e))?;
    Ok(Response::new(bytes))
}

/// Capa gerada no frontend. A imagem vem como corpo binário cru (sem JSON); o id do livro
/// e o tipo da imagem vêm nos cabeçalhos `livro` e `tipo`. (Não dá para usar `content-type`:
/// o Tauri o sobrescreve com `application/octet-stream` em corpos binários.)
#[tauri::command]
pub fn definir_capa(
    bib: State<'_, EstadoBiblioteca>,
    requisicao: Request<'_>,
) -> Result<LivroNaBiblioteca, String> {
    let InvokeBody::Raw(bytes) = requisicao.body() else {
        return Err("a capa deve vir como bytes".into());
    };
    let cabecalho = |nome: &str| {
        requisicao
            .headers()
            .get(nome)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let id = cabecalho("livro").ok_or("falta o cabeçalho `livro`")?;
    let capa = Capa {
        tipo_midia: cabecalho("tipo").unwrap_or_else(|| "image/jpeg".into()),
        bytes: bytes.clone(),
    };
    bib.lock()
        .unwrap()
        .definir_capa(&id, &capa)
        .map_err(|e| registrar(&e))
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

#[tauri::command]
pub fn preferencias_leitura(
    bib: State<'_, EstadoBiblioteca>,
) -> Result<PreferenciasLeitura, String> {
    bib.lock()
        .unwrap()
        .preferencias_leitura()
        .map_err(|e| registrar(&e))
}

/// Devolve o que foi gravado: valores fora dos limites voltam corrigidos.
#[tauri::command]
pub fn salvar_preferencias_leitura(
    bib: State<'_, EstadoBiblioteca>,
    preferencias: PreferenciasLeitura,
) -> Result<PreferenciasLeitura, String> {
    bib.lock()
        .unwrap()
        .salvar_preferencias_leitura(preferencias)
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

/// Motor de voz, se o sistema de voz estiver disponível (`None` = leitura em voz alta desligada).
pub struct EstadoVoz(pub Option<Box<dyn MotorDeVoz>>);

fn motor<'a>(voz: &'a State<'_, EstadoVoz>) -> Result<&'a dyn MotorDeVoz, String> {
    voz.0
        .as_deref()
        .ok_or_else(|| "a leitura em voz alta precisa do speech-dispatcher".to_string())
}

#[tauri::command]
pub fn voz_disponivel(voz: State<'_, EstadoVoz>) -> bool {
    voz.0.is_some()
}

/// Fala um bloco SSML; o progresso chega pelo evento `voz` (emitido em `main.rs`).
#[tauri::command]
pub fn falar(voz: State<'_, EstadoVoz>, ssml: String, config: ConfigVoz) -> Result<(), String> {
    motor(&voz)?.falar(ssml, config).map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn pausar_voz(voz: State<'_, EstadoVoz>) -> Result<(), String> {
    motor(&voz)?.pausar().map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn retomar_voz(voz: State<'_, EstadoVoz>) -> Result<(), String> {
    motor(&voz)?.retomar().map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn parar_voz(voz: State<'_, EstadoVoz>) -> Result<(), String> {
    motor(&voz)?.parar().map_err(|e| registrar(&e))
}
