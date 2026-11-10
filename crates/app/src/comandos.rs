//! Comandos Tauri: finos, só chamam o core e adaptam o resultado.

use std::path::PathBuf;
use std::sync::Mutex;

use folio_core::biblioteca::{
    Biblioteca, Colecao, Importado, LivroNaBiblioteca, Progresso, importar_sem_segurar,
    ler_sem_segurar, travar,
};
use folio_core::destaques::{Cor, Destaque, Motivo, NovoDestaque};
use folio_core::epub::Capa;
use folio_core::preferencias::PreferenciasLeitura;
use folio_core::sessoes::Sessao;
use folio_core::visitas::{Trecho, Visita};
use folio_core::voz::{ConfigVoz, MotorDeVoz};

use crate::voz_natural::EstadoVoz;
use serde::Serialize;
use tauri::State;
use tauri::ipc::{InvokeBody, Request, Response};

/// A conexão SQLite não pode ser usada por duas threads ao mesmo tempo, daí o Mutex.
///
/// Comandos sem `async` rodam na thread principal, a mesma que desenha a janela. Os que
/// leem ou copiam o livro inteiro (dezenas de MB) são `#[tauri::command(async)]`: rodam
/// numa thread do runtime e a interface não congela enquanto isso.
///
/// A trava só pode ser segurada pelo tempo de uma consulta: um comando da thread principal que
/// a espere para a janela. Trabalho de disco ou de CPU fica fora dela (`importar_sem_segurar`,
/// `ler_sem_segurar`, `trecho_livro`). Os comandos curtos continuam sem `async` de propósito:
/// na thread principal eles rodam na ordem em que a página os chamou (o progresso de duas
/// páginas viradas em seguida não troca de lugar).
pub type EstadoBiblioteca = Mutex<Biblioteca>;

/// A página acabou de recarregar porque o processo dela caiu?
#[tauri::command]
pub fn processo_recuperado(estado: State<'_, crate::processo::ProcessoRecuperado>) -> bool {
    estado.consumir()
}

#[tauri::command]
pub fn listar_livros(bib: State<'_, EstadoBiblioteca>) -> Result<Vec<LivroNaBiblioteca>, String> {
    travar(&bib).listar().map_err(|e| registrar(&e))
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
    let mut resultado = Importacao {
        importados: Vec::new(),
        ja_existentes: Vec::new(),
        restaurados: Vec::new(),
        falhas: Vec::new(),
    };
    for caminho in caminhos {
        match importar_sem_segurar(&bib, &caminho) {
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
    let bytes = ler_sem_segurar(&bib, &id).map_err(|e| registrar(&e))?;
    Ok(Response::new(bytes))
}

/// Registra a abertura de um PDF e devolve o tamanho dele: o pdf.js pede os trechos que precisar.
#[tauri::command(async)]
pub fn abrir_por_trechos(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<u64, String> {
    travar(&bib)
        .abrir_por_trechos(&id)
        .map_err(|e| registrar(&e))
}

/// Um trecho do livro. A biblioteca só é travada para achar o arquivo, não durante a leitura.
#[tauri::command(async)]
pub fn trecho_livro(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    inicio: u64,
    tamanho: u64,
) -> Result<Response, String> {
    let caminho = travar(&bib)
        .caminho_do_arquivo(&id)
        .map_err(|e| registrar(&e))?;
    let bytes =
        folio_core::biblioteca::ler_trecho(&caminho, inicio, tamanho).map_err(|e| registrar(&e))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn listar_colecoes(bib: State<'_, EstadoBiblioteca>) -> Result<Vec<Colecao>, String> {
    travar(&bib).listar_colecoes().map_err(|e| registrar(&e))
}

/// Nome vazio ou repetido volta como erro com a mensagem para o usuário.
#[tauri::command]
pub fn criar_colecao(bib: State<'_, EstadoBiblioteca>, nome: String) -> Result<Colecao, String> {
    travar(&bib).criar_colecao(&nome).map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn renomear_colecao(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    nome: String,
) -> Result<(), String> {
    travar(&bib)
        .renomear_colecao(id, &nome)
        .map_err(|e| registrar(&e))
}

/// Os livros continuam na biblioteca.
#[tauri::command]
pub fn apagar_colecao(bib: State<'_, EstadoBiblioteca>, id: i64) -> Result<(), String> {
    travar(&bib).apagar_colecao(id).map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn adicionar_a_colecao(
    bib: State<'_, EstadoBiblioteca>,
    colecao: i64,
    livro: String,
) -> Result<(), String> {
    travar(&bib)
        .adicionar_a_colecao(colecao, &livro)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn remover_da_colecao(
    bib: State<'_, EstadoBiblioteca>,
    colecao: i64,
    livro: String,
) -> Result<(), String> {
    travar(&bib)
        .remover_da_colecao(colecao, &livro)
        .map_err(|e| registrar(&e))
}

/// Destaques do livro na ordem de leitura.
#[tauri::command]
pub fn listar_destaques(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
) -> Result<Vec<Destaque>, String> {
    travar(&bib)
        .listar_destaques(&livro)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn criar_destaque(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
    novo: NovoDestaque,
) -> Result<Destaque, String> {
    travar(&bib)
        .criar_destaque(&livro, novo)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_cor_destaque(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    cor: Cor,
) -> Result<Destaque, String> {
    travar(&bib)
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
    travar(&bib)
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
    travar(&bib)
        .definir_nota_do_destaque(id, nota.as_deref())
        .map_err(|e| registrar(&e))
}

/// Devolve o destaque apagado, para o "Desfazer" (`restaurar_destaque`).
#[tauri::command]
pub fn apagar_destaque(bib: State<'_, EstadoBiblioteca>, id: i64) -> Result<Destaque, String> {
    travar(&bib).apagar_destaque(id).map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn restaurar_destaque(
    bib: State<'_, EstadoBiblioteca>,
    destaque: Destaque,
) -> Result<Destaque, String> {
    travar(&bib)
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
    travar(&bib)
        .exportar_destaques(&livro, &caminho, motivo)
        .map_err(|e| registrar(&e))
}

/// Livros na lixeira, o removido por último primeiro.
#[tauri::command]
pub fn listar_lixeira(bib: State<'_, EstadoBiblioteca>) -> Result<Vec<LivroNaBiblioteca>, String> {
    travar(&bib).listar_lixeira().map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_favorito(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    favorito: bool,
) -> Result<(), String> {
    travar(&bib)
        .definir_favorito(&id, favorito)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_para_ler(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    para_ler: bool,
) -> Result<(), String> {
    travar(&bib)
        .definir_para_ler(&id, para_ler)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn definir_lido(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    lido: bool,
) -> Result<(), String> {
    travar(&bib)
        .definir_lido(&id, lido)
        .map_err(|e| registrar(&e))
}

/// Reversível: a cópia, a capa e o progresso ficam até restaurar ou esvaziar a lixeira.
#[tauri::command]
pub fn mover_para_lixeira(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<(), String> {
    travar(&bib)
        .mover_para_lixeira(&id)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn restaurar_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<(), String> {
    travar(&bib).restaurar(&id).map_err(|e| registrar(&e))
}

/// Apaga de vez (a cópia do app; o arquivo original não é tocado).
#[tauri::command(async)]
pub fn apagar_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<(), String> {
    travar(&bib).apagar_de_vez(&id).map_err(|e| registrar(&e))
}

/// Apaga de vez tudo o que está na lixeira; devolve quantos livros foram.
#[tauri::command(async)]
pub fn esvaziar_lixeira(bib: State<'_, EstadoBiblioteca>) -> Result<usize, String> {
    travar(&bib).esvaziar_lixeira().map_err(|e| registrar(&e))
}

/// Tamanho do livro, sem marcá-lo como aberto (para gerar a capa de PDFs, por trechos).
#[tauri::command(async)]
pub fn tamanho_livro(bib: State<'_, EstadoBiblioteca>, id: String) -> Result<u64, String> {
    travar(&bib)
        .tamanho_do_arquivo(&id)
        .map_err(|e| registrar(&e))
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
    travar(&bib)
        .definir_capa(&id, &capa)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn progresso_livro(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
) -> Result<Option<Progresso>, String> {
    travar(&bib).progresso(&id).map_err(|e| registrar(&e))
}

/// Começa uma sessão de leitura (M20) ao abrir o livro, no ponto em que ele abriu.
#[tauri::command]
pub fn iniciar_sessao(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
    onde: Progresso,
) -> Result<Sessao, String> {
    travar(&bib)
        .iniciar_sessao(&livro, &onde)
        .map_err(|e| registrar(&e))
}

/// A leitura continua (atividade ou mudança de lugar, com `onde`).
#[tauri::command]
pub fn registrar_sessao(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    onde: Option<Progresso>,
) -> Result<Sessao, String> {
    travar(&bib)
        .registrar_na_sessao(id, onde.as_ref())
        .map_err(|e| registrar(&e))
}

/// Encerra a sessão ao fechar o livro; `None` se ela foi curta demais e não ficou.
#[tauri::command]
pub fn encerrar_sessao(
    bib: State<'_, EstadoBiblioteca>,
    id: i64,
    onde: Option<Progresso>,
) -> Result<Option<Sessao>, String> {
    travar(&bib)
        .encerrar_sessao(id, onde.as_ref())
        .map_err(|e| registrar(&e))
}

/// O ritmo de leitura no livro (fração por segundo), ou `None` se ainda não há dado bastante.
#[tauri::command]
pub fn ritmo_de_leitura(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
) -> Result<Option<f64>, String> {
    travar(&bib)
        .ritmo_de_leitura(&livro)
        .map_err(|e| registrar(&e))
}

/// O leitor entrou num trecho (M21b): registra e diz se foi uma volta.
#[tauri::command]
pub fn visitar_trecho(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
    trecho: Trecho,
) -> Result<Visita, String> {
    travar(&bib)
        .visitar_trecho(&livro, &trecho)
        .map_err(|e| registrar(&e))
}

/// Os trechos a que se voltou pelo menos `minimo` vezes, dos mais revisitados aos menos.
#[tauri::command]
pub fn trechos_revisitados(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
    minimo: i64,
) -> Result<Vec<Visita>, String> {
    travar(&bib)
        .trechos_revisitados(&livro, minimo)
        .map_err(|e| registrar(&e))
}

/// As sessões do livro, da mais recente para a mais antiga.
#[tauri::command]
pub fn listar_sessoes(
    bib: State<'_, EstadoBiblioteca>,
    livro: String,
) -> Result<Vec<Sessao>, String> {
    travar(&bib)
        .listar_sessoes(&livro)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn salvar_progresso(
    bib: State<'_, EstadoBiblioteca>,
    id: String,
    progresso: Progresso,
) -> Result<(), String> {
    travar(&bib)
        .salvar_progresso(&id, &progresso)
        .map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn preferencias_leitura(
    bib: State<'_, EstadoBiblioteca>,
) -> Result<PreferenciasLeitura, String> {
    travar(&bib)
        .preferencias_leitura()
        .map_err(|e| registrar(&e))
}

/// Devolve o que foi gravado: valores fora dos limites voltam corrigidos.
/// A voz natural segue as preferências novas (voz escolhida, usar em inglês).
#[tauri::command]
pub fn salvar_preferencias_leitura(
    bib: State<'_, EstadoBiblioteca>,
    voz: State<'_, EstadoVoz>,
    preferencias: PreferenciasLeitura,
) -> Result<PreferenciasLeitura, String> {
    let salvas = travar(&bib)
        .salvar_preferencias_leitura(preferencias)
        .map_err(|e| registrar(&e))?;
    voz.aplicar(&salvas);
    Ok(salvas)
}

/// Erros de comando precisam ser serializáveis; viram texto depois de ir para o log.
fn registrar(erro: &(dyn std::error::Error + 'static)) -> String {
    tracing::warn!(erro, "comando falhou");
    erro.to_string()
}

/// Caminho passado na linha de comando (`folio livro.epub`), usado pelo "Abrir com…" do sistema.
#[tauri::command]
pub fn caminho_inicial() -> Option<PathBuf> {
    std::env::args_os().nth(1).map(PathBuf::from)
}

/// Escala de texto do sistema (1 = padrão); o frontend a aplica via CSS.
#[tauri::command]
pub fn escala_texto(estado: State<'_, crate::escala::EscalaTexto>) -> f64 {
    *estado.0.lock().unwrap()
}

#[tauri::command]
pub fn voz_disponivel(voz: State<'_, EstadoVoz>) -> bool {
    voz.motor.as_ref().is_some_and(|m| m.disponivel())
}

/// Fala um bloco SSML; o progresso chega pelo evento `voz` (emitido em `main.rs`).
#[tauri::command]
pub fn falar(voz: State<'_, EstadoVoz>, ssml: String, config: ConfigVoz) -> Result<(), String> {
    voz.motor()?.falar(ssml, config).map_err(|e| registrar(&e))
}

/// O bloco seguinte ao que está sendo falado: a voz natural adianta o começo dele.
#[tauri::command]
pub fn preparar_voz(
    voz: State<'_, EstadoVoz>,
    ssml: String,
    config: ConfigVoz,
) -> Result<(), String> {
    voz.motor()?.preparar(ssml, config);
    Ok(())
}

#[tauri::command]
pub fn pausar_voz(voz: State<'_, EstadoVoz>) -> Result<(), String> {
    voz.motor()?.pausar().map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn retomar_voz(voz: State<'_, EstadoVoz>) -> Result<(), String> {
    voz.motor()?.retomar().map_err(|e| registrar(&e))
}

#[tauri::command]
pub fn parar_voz(voz: State<'_, EstadoVoz>) -> Result<(), String> {
    voz.motor()?.parar().map_err(|e| registrar(&e))
}
