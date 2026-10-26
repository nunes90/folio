//! Comandos Tauri: finos, só chamam o core e adaptam o resultado.

use std::path::PathBuf;
use std::sync::Mutex;

use leitor_core::biblioteca::{Biblioteca, Colecao, Importado, LivroNaBiblioteca, Progresso};
use leitor_core::destaques::{Cor, Destaque, Motivo, NovoDestaque};
use leitor_core::epub::Capa;
use leitor_core::preferencias::PreferenciasLeitura;
use leitor_core::voz::{ConfigVoz, MotorDeVoz};
use serde::Serialize;
use tauri::State;
use tauri::ipc::{InvokeBody, Request, Response};

/// A conexão SQLite não pode ser usada por duas threads ao mesmo tempo, daí o Mutex.
///
/// Comandos sem `async` rodam na thread principal, a mesma que desenha a janela. Os que
/// leem ou copiam o livro inteiro (dezenas de MB) são `#[tauri::command(async)]`: rodam
/// numa thread do runtime e a interface não congela enquanto isso.
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
    /// Estavam na lixeira e voltaram para a estante.
    restaurados: Vec<LivroNaBiblioteca>,
    falhas: Vec<Falha>,
}

/// Importa vários arquivos; um que falhe não impede os outros.
#[tauri::command(async)]
pub fn importar_livros(bib: State<'_, EstadoBiblioteca>, caminhos: Vec<PathBuf>) -> Importacao {
    let bib = bib.lock().unwrap();
    let mut resultado = Importacao {
        importados: Vec::new(),
        ja_existentes: Vec::new(),
        restaurados: Vec::new(),
        falhas: Vec::new(),
    };
    for caminho in caminhos {
        match bib.importar(&caminho) {
            Ok(Importado::Novo(livro)) => resultado.importados.push(livro),
            Ok(Importado::JaExistia(livro)) => resultado.ja_existentes.push(livro),
            Ok(Importado::Restaurado(livro)) => resultado.restaurados.push(livro),
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
#[tauri::command(async)]
pub fn abrir_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<Response, String> {
    let bytes = bib.lock().unwrap().ler(&id).map_err(|e| registrar(&e))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn listar_colecoes(bib: State<'_, EstadoBiblioteca>) -> Result<Vec<Colecao>, String> {
    bib.lock()
        .unwrap()
        .listar_colecoes()
        .map_err(|e| registrar(&e))
}

/// Nome vazio ou repetido volta como erro com a mensagem para o usuário.
#[tauri::command]
pub fn criar_colecao(bib: State<'_, EstadoBiblioteca>, nome: String) -> Result<Colecao, String> {
    bib.lock()
        .unwrap()
        .criar_colecao(&nome)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn renomear_colecao(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    nome: String,
) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .renomear_colecao(id, &nome)
        .map_err(|e| registrar(&e))
}

/// Os livros continuam na biblioteca.
#[tauri::command]
pub fn apagar_colecao(bib: State<'_, EstadoBiblioteca>, id: i64) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .apagar_colecao(id)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn adicionar_a_colecao(
    bib: State<'_, EstadoBiblioteca>,
    colecao: i64,
    livro: String,
) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .adicionar_a_colecao(colecao, &livro)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn remover_da_colecao(
    bib: State<'_, EstadoBiblioteca>,
    colecao: i64,
    livro: String,
) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .remover_da_colecao(colecao, &livro)
        .map_err(|e| registrar(&e))
}

/// Destaques do livro na ordem de leitura.
#[tauri::command]
pub fn listar_destaques(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
) -> Result<Vec<Destaque>, String> {
    bib.lock()
        .unwrap()
        .listar_destaques(&livro)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn criar_destaque(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
    novo: NovoDestaque,
) -> Result<Destaque, String> {
    bib.lock()
        .unwrap()
        .criar_destaque(&livro, novo)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_cor_destaque(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    cor: Cor,
) -> Result<Destaque, String> {
    bib.lock()
        .unwrap()
        .definir_cor_do_destaque(id, cor)
        .map_err(|e| registrar(&e))
}

/// `motivo` nulo tira o motivo.
#[tauri::command]
pub fn definir_motivo_destaque(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    motivo: Option<Motivo>,
) -> Result<Destaque, String> {
    bib.lock()
        .unwrap()
        .definir_motivo_do_destaque(id, motivo)
        .map_err(|e| registrar(&e))
}

/// `nota` nula ou só com espaços apaga a nota.
#[tauri::command]
pub fn definir_nota_destaque(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    nota: Option<String>,
) -> Result<Destaque, String> {
    bib.lock()
        .unwrap()
        .definir_nota_do_destaque(id, nota.as_deref())
        .map_err(|e| registrar(&e))
}

/// Devolve o destaque apagado, para o "Desfazer" (`restaurar_destaque`).
#[tauri::command]
pub fn apagar_destaque(bib: State<'_, EstadoBiblioteca>, id: i64) -> Result<Destaque, String> {
    bib.lock()
        .unwrap()
        .apagar_destaque(id)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn restaurar_destaque(
    bib: State<'_, EstadoBiblioteca>,
    destaque: Destaque,
) -> Result<Destaque, String> {
    bib.lock()
        .unwrap()
        .restaurar_destaque(&destaque)
        .map_err(|e| registrar(&e))
}

/// Grava os destaques do livro (com `motivo`, só os dele) em Markdown no caminho escolhido;
/// devolve quantos foram.
#[tauri::command]
pub fn exportar_destaques(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
    caminho: PathBuf,
    motivo: Option<Motivo>,
) -> Result<usize, String> {
    bib.lock()
        .unwrap()
        .exportar_destaques(&livro, &caminho, motivo)
        .map_err(|e| registrar(&e))
}

/// Livros na lixeira, o removido por último primeiro.
#[tauri::command]
pub fn listar_lixeira(bib: State<'_, EstadoBiblioteca>) -> Result<Vec<LivroNaBiblioteca>, String> {
    bib.lock()
        .unwrap()
        .listar_lixeira()
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_favorito(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    favorito: bool,
) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .definir_favorito(&id, favorito)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_para_ler(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    para_ler: bool,
) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .definir_para_ler(&id, para_ler)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_lido(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    lido: bool,
) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .definir_lido(&id, lido)
        .map_err(|e| registrar(&e))
}

/// Reversível: a cópia, a capa e o progresso ficam até restaurar ou esvaziar a lixeira.
#[tauri::command]
pub fn mover_para_lixeira(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .mover_para_lixeira(&id)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn restaurar_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .restaurar(&id)
        .map_err(|e| registrar(&e))
}

/// Apaga de vez (a cópia do app; o arquivo original não é tocado).
#[tauri::command(async)]
pub fn apagar_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<(), String> {
    bib.lock()
        .unwrap()
        .apagar_de_vez(&id)
        .map_err(|e| registrar(&e))
}

/// Apaga de vez tudo o que está na lixeira; devolve quantos livros foram.
#[tauri::command(async)]
pub fn esvaziar_lixeira(bib: State<'_, EstadoBiblioteca>) -> Result<usize, String> {
    bib.lock()
        .unwrap()
        .esvaziar_lixeira()
        .map_err(|e| registrar(&e))
}

/// Bytes do livro sem marcá-lo como aberto (usado para gerar a capa de PDFs).
#[tauri::command(async)]
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
#[tauri::command(async)]
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
