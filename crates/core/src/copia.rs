//! Cópia de segurança da biblioteca (M38): um arquivo `.folio-backup`, que por dentro é um ZIP
//! comum (abre em qualquer programa de ZIP, se um dia o Folio não existir):
//!
//! - `manifesto.json`: a versão deste formato, a do app, a do esquema do banco, a data e o que há;
//! - `biblioteca.sqlite3`: o banco inteiro (livros, progresso, destaques e notas, coleções,
//!   sessões, preferências);
//! - `livros/<id>.epub|pdf`: as cópias dos livros, se a pessoa quis levá-las.
//!
//! As capas não vão: são refeitas dos livros. As vozes baixadas também não.
//!
//! Restaurar **substitui** a biblioteca pela da cópia. Antes, a atual é guardada (só os dados) em
//! `copias/` na pasta de dados, para desfazer; os arquivos dos livros atuais ficam onde estão.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tracing::instrument;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::biblioteca::{self, Biblioteca, ErroBiblioteca, travar};

/// A extensão do arquivo (sem o ponto).
pub const EXTENSAO: &str = "folio-backup";
/// A versão deste formato. Uma cópia de formato mais novo é recusada.
const FORMATO: u32 = 1;
const MANIFESTO: &str = "manifesto.json";
const BANCO: &str = "biblioteca.sqlite3";
const LIVROS: &str = "livros/";
/// Onde ficam as cópias que o app faz sozinho antes de restaurar.
const DIR_COPIAS: &str = "copias";
/// O manifesto é pequeno; o banco, alguns MB. Limites contra um arquivo malicioso.
const MANIFESTO_MAXIMO: u64 = 64 * 1024;
const BANCO_MAXIMO: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum ErroCopia {
    #[error(transparent)]
    Biblioteca(#[from] ErroBiblioteca),
    #[error("erro no banco da cópia")]
    Banco(#[from] rusqlite::Error),
    #[error("o arquivo não é uma cópia de segurança do Folio")]
    NaoECopia,
    #[error(
        "esta cópia foi feita por uma versão mais nova do Folio: atualize o app para restaurá-la"
    )]
    VersaoMaisNova,
    #[error("a cópia de segurança está danificada: {0}")]
    Danificada(String),
    #[error("não foi possível ler ou gravar {}", caminho.display())]
    Io {
        caminho: PathBuf,
        #[source]
        fonte: io::Error,
    },
}

impl From<zip::result::ZipError> for ErroCopia {
    fn from(erro: zip::result::ZipError) -> Self {
        Self::Danificada(erro.to_string())
    }
}

type Resultado<T> = Result<T, ErroCopia>;

/// O que a cópia diz de si (mostrado antes de restaurar).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifesto {
    pub formato: u32,
    pub versao_do_app: String,
    /// `PRAGMA user_version` do banco da cópia.
    pub esquema: i64,
    /// Segundos desde 1970 (UTC).
    pub criada_em: i64,
    /// Livros na biblioteca (fora da lixeira ou nela).
    pub livros: usize,
    /// Quantos arquivos de livro vieram na cópia (0 = só os dados).
    pub arquivos: usize,
}

/// O resultado de restaurar.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restaurada {
    pub livros: usize,
    /// Livros da cópia cujo arquivo não está na máquina (a cópia era só dos dados): abrem depois
    /// de importados de novo.
    pub sem_arquivo: usize,
    /// Onde a biblioteca de antes foi guardada.
    pub anterior: PathBuf,
}

fn io_em(caminho: &Path) -> impl FnOnce(io::Error) -> ErroCopia {
    let caminho = caminho.to_path_buf();
    move |fonte| ErroCopia::Io { caminho, fonte }
}

/// Exporta a biblioteca para `destino`. Com `com_livros`, os arquivos dos livros vão junto.
///
/// A biblioteca fica travada só para tirar uma fotografia do banco (`VACUUM INTO`, consistente
/// mesmo com o app em uso) e listar os arquivos; compactar e copiar é com ela solta. O arquivo é
/// escrito como `.parcial` e renomeado no fim: uma exportação interrompida não deixa uma cópia
/// pela metade com cara de inteira.
#[instrument(skip(biblioteca))]
pub fn exportar(
    biblioteca: &Mutex<Biblioteca>,
    destino: &Path,
    com_livros: bool,
) -> Resultado<Manifesto> {
    let (foto, dir_livros, arquivos, livros, criada_em) = {
        let bib = travar(biblioteca);
        let foto = bib.dir_dados.join("copia.parcial.sqlite3");
        let _ = fs::remove_file(&foto);
        bib.conexao
            .execute("VACUUM INTO ?1", [foto.to_string_lossy().as_ref()])?;
        let arquivos = bib.arquivos_dos_livros()?;
        (
            foto,
            bib.dir_livros().to_path_buf(),
            arquivos,
            bib.total_de_livros()?,
            (bib.relogio)(),
        )
    };
    let resultado = escrever(
        &foto,
        &dir_livros,
        if com_livros { &arquivos } else { &[] },
        livros,
        criada_em,
        destino,
    );
    let _ = fs::remove_file(&foto);
    if resultado.is_err() {
        let _ = fs::remove_file(parcial(destino));
    }
    resultado
}

fn parcial(destino: &Path) -> PathBuf {
    let mut nome = destino.as_os_str().to_owned();
    nome.push(".parcial");
    PathBuf::from(nome)
}

fn escrever(
    foto: &Path,
    dir_livros: &Path,
    arquivos: &[String],
    livros: usize,
    criada_em: i64,
    destino: &Path,
) -> Resultado<Manifesto> {
    // Só os arquivos que existem: um livro restaurado sem arquivo continua sem ele na cópia nova.
    let presentes: Vec<&String> = arquivos
        .iter()
        .filter(|a| dir_livros.join(a).is_file())
        .collect();
    let manifesto = Manifesto {
        formato: FORMATO,
        versao_do_app: crate::VERSION.to_string(),
        esquema: biblioteca::versao_do_esquema(),
        criada_em,
        livros,
        arquivos: presentes.len(),
    };
    let temporario = parcial(destino);
    let arquivo = File::create(&temporario).map_err(io_em(&temporario))?;
    let mut zip = ZipWriter::new(arquivo);
    let comprimido = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // EPUB já é um ZIP e PDF já vem comprimido: só guardar é mais rápido e dá no mesmo tamanho.
    // `large_file`: um PDF pode passar de 4 GB.
    let guardado = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .large_file(true);

    zip.start_file(MANIFESTO, comprimido)?;
    let json =
        serde_json::to_vec_pretty(&manifesto).map_err(|e| ErroCopia::Danificada(e.to_string()))?;
    zip.write_all(&json).map_err(io_em(&temporario))?;

    zip.start_file(BANCO, comprimido.large_file(true))?;
    copiar_para(foto, &mut zip, &temporario)?;

    for nome in presentes {
        zip.start_file(format!("{LIVROS}{nome}"), guardado)?;
        copiar_para(&dir_livros.join(nome), &mut zip, &temporario)?;
    }
    let arquivo = zip.finish()?;
    arquivo.sync_all().map_err(io_em(&temporario))?;
    fs::rename(&temporario, destino).map_err(io_em(destino))?;
    tracing::info!(
        livros = manifesto.livros,
        arquivos = manifesto.arquivos,
        "biblioteca exportada"
    );
    Ok(manifesto)
}

fn copiar_para(origem: &Path, zip: &mut impl Write, destino: &Path) -> Resultado<()> {
    let mut entrada = File::open(origem).map_err(io_em(origem))?;
    io::copy(&mut entrada, zip).map_err(io_em(destino))?;
    Ok(())
}

/// Lê o manifesto de uma cópia, conferindo que ela pode ser restaurada por esta versão do app.
pub fn ler_manifesto(caminho: &Path) -> Resultado<Manifesto> {
    let arquivo = File::open(caminho).map_err(io_em(caminho))?;
    let mut zip = ZipArchive::new(arquivo).map_err(|_| ErroCopia::NaoECopia)?;
    manifesto_de(&mut zip)
}

fn manifesto_de(zip: &mut ZipArchive<File>) -> Resultado<Manifesto> {
    let mut json = Vec::new();
    zip.by_name(MANIFESTO)
        .map_err(|_| ErroCopia::NaoECopia)?
        .take(MANIFESTO_MAXIMO)
        .read_to_end(&mut json)
        .map_err(|e| ErroCopia::Danificada(e.to_string()))?;
    let manifesto: Manifesto = serde_json::from_slice(&json).map_err(|_| ErroCopia::NaoECopia)?;
    if manifesto.formato > FORMATO || manifesto.esquema > biblioteca::versao_do_esquema() {
        return Err(ErroCopia::VersaoMaisNova);
    }
    if zip.by_name(BANCO).is_err() {
        return Err(ErroCopia::Danificada("falta o banco".into()));
    }
    Ok(manifesto)
}

/// O nome de um livro dentro da cópia, se for só isso: `<64 hexadecimais>.epub` ou `.pdf`. Um
/// nome com `/`, `..` ou qualquer outra coisa não é extraído (um ZIP malicioso escreveria fora
/// da pasta dos livros).
fn nome_de_livro(entrada: &str) -> Option<&str> {
    let nome = entrada.strip_prefix(LIVROS)?;
    let (id, extensao) = nome.split_once('.')?;
    let id_valido = id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit());
    (id_valido && matches!(extensao, "epub" | "pdf")).then_some(nome)
}

/// Restaura a cópia em `caminho`: a biblioteca passa a ser a dela. A atual é guardada antes (só
/// os dados) em `copias/`, e os arquivos dos livros atuais ficam onde estão.
///
/// Tudo o que pode falhar acontece antes de mexer na biblioteca: a cópia é extraída para uma
/// pasta de preparo, o banco dela é aberto e conferido, a atual é exportada. Só então, com a
/// biblioteca travada, o banco é trocado (um `rename`) e os livros entram na pasta.
#[instrument(skip(biblioteca))]
pub fn restaurar(biblioteca: &Mutex<Biblioteca>, caminho: &Path) -> Resultado<Restaurada> {
    let (dir_dados, dir_livros, agora) = {
        let bib = travar(biblioteca);
        (
            bib.dir_dados.clone(),
            bib.dir_livros().to_path_buf(),
            (bib.relogio)(),
        )
    };
    let preparo = dir_dados.join("restaurar.parcial");
    let _ = fs::remove_dir_all(&preparo);
    let resultado = (|| {
        fs::create_dir_all(preparo.join(LIVROS)).map_err(io_em(&preparo))?;
        let banco_novo = extrair(caminho, &preparo)?;
        conferir_banco(&banco_novo)?;

        // A biblioteca de antes, para desfazer.
        let copias = dir_dados.join(DIR_COPIAS);
        fs::create_dir_all(&copias).map_err(io_em(&copias))?;
        let anterior = copias.join(format!("antes-de-restaurar-{agora}.{EXTENSAO}"));
        exportar(biblioteca, &anterior, false)?;

        let mut bib = travar(biblioteca);
        // Os livros primeiro: se o banco novo entrar, os arquivos dele já estão lá. O id é o
        // SHA-256 do conteúdo: um arquivo que já existe é o mesmo livro.
        let dir_preparo = preparo.join(LIVROS);
        for entrada in fs::read_dir(&dir_preparo).map_err(io_em(&dir_preparo))? {
            let entrada = entrada.map_err(io_em(&dir_preparo))?;
            let destino = dir_livros.join(entrada.file_name());
            if !destino.exists() {
                fs::rename(entrada.path(), &destino).map_err(io_em(&destino))?;
            }
        }
        bib.trocar_banco(&banco_novo)?;
        let arquivos = bib.arquivos_dos_livros()?;
        let sem_arquivo = arquivos
            .iter()
            .filter(|a| !dir_livros.join(a).is_file())
            .count();
        let restaurada = Restaurada {
            livros: bib.total_de_livros()?,
            sem_arquivo,
            anterior,
        };
        tracing::info!(
            livros = restaurada.livros,
            sem_arquivo,
            "biblioteca restaurada de uma cópia"
        );
        Ok(restaurada)
    })();
    let _ = fs::remove_dir_all(&preparo);
    resultado
}

/// Extrai o banco e os livros da cópia para `preparo`; devolve o caminho do banco extraído.
fn extrair(caminho: &Path, preparo: &Path) -> Resultado<PathBuf> {
    let arquivo = File::open(caminho).map_err(io_em(caminho))?;
    let mut zip = ZipArchive::new(arquivo).map_err(|_| ErroCopia::NaoECopia)?;
    manifesto_de(&mut zip)?;

    let banco = preparo.join(BANCO);
    {
        let entrada = zip.by_name(BANCO)?;
        let mut saida = File::create(&banco).map_err(io_em(&banco))?;
        // `take`: um banco "de 100 GB" dentro do ZIP não enche o disco.
        let copiados =
            io::copy(&mut entrada.take(BANCO_MAXIMO + 1), &mut saida).map_err(io_em(&banco))?;
        if copiados > BANCO_MAXIMO {
            return Err(ErroCopia::Danificada("o banco é grande demais".into()));
        }
    }
    let mut vistos = HashSet::new();
    for i in 0..zip.len() {
        let mut entrada = zip.by_index(i)?;
        // Um nome ilegível, ou que não é o de um livro, não é extraído.
        let Some(nome) = entrada
            .name()
            .ok()
            .and_then(|n| nome_de_livro(&n).map(str::to_owned))
        else {
            continue;
        };
        if !vistos.insert(nome.clone()) {
            continue;
        }
        let destino = preparo.join(LIVROS).join(&nome);
        let mut saida = File::create(&destino).map_err(io_em(&destino))?;
        io::copy(&mut entrada, &mut saida).map_err(io_em(&destino))?;
    }
    Ok(banco)
}

/// O banco extraído é um banco do Folio, inteiro? (Antes de pôr no lugar do de verdade.)
fn conferir_banco(banco: &Path) -> Resultado<()> {
    let conexao =
        rusqlite::Connection::open_with_flags(banco, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let estado: String = conexao
        .query_row("PRAGMA integrity_check", [], |l| l.get(0))
        .map_err(|e| ErroCopia::Danificada(e.to_string()))?;
    if estado != "ok" {
        return Err(ErroCopia::Danificada(format!(
            "o banco não passou na conferência: {estado}"
        )));
    }
    let versao: i64 = conexao.pragma_query_value(None, "user_version", |l| l.get(0))?;
    if versao > biblioteca::versao_do_esquema() {
        return Err(ErroCopia::VersaoMaisNova);
    }
    let tem_livros: bool = conexao
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'livros')",
            [],
            |l| l.get(0),
        )
        .map_err(|e| ErroCopia::Danificada(e.to_string()))?;
    if !tem_livros {
        return Err(ErroCopia::Danificada(
            "o banco não é de uma biblioteca".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::biblioteca::Progresso;
    use crate::destaques::{Cor, NovoDestaque};

    fn fixture(nome: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures")
            .join(nome)
    }

    fn nova() -> (tempfile::TempDir, Mutex<Biblioteca>) {
        let dir = tempfile::tempdir().unwrap();
        let bib = Biblioteca::abrir(&dir.path().join("dados"), &dir.path().join("capas")).unwrap();
        (dir, Mutex::new(bib))
    }

    /// Uma biblioteca com dois livros, progresso e um destaque com nota. Devolve o id do EPUB.
    fn com_livros() -> (tempfile::TempDir, Mutex<Biblioteca>, String) {
        let (dir, bib) = nova();
        let id = {
            let b = travar(&bib);
            let epub = b
                .importar(&fixture("dom-casmurro.epub"))
                .unwrap()
                .into_livro();
            b.importar(&fixture("texto.pdf")).unwrap();
            b.salvar_progresso(
                &epub.id,
                &Progresso {
                    localizacao: "epubcfi(/6/8!/4/2)".into(),
                    fracao: 0.37,
                },
            )
            .unwrap();
            b.criar_destaque(
                &epub.id,
                NovoDestaque {
                    local: "epubcfi(/6/8!/4/2,/1:0,/1:20)".into(),
                    trecho: "olhos de ressaca".into(),
                    cor: Cor::Verde,
                    motivo: None,
                    nota: Some("a imagem do livro".into()),
                    capitulo: None,
                    posicao: 0.3,
                },
            )
            .unwrap();
            epub.id
        };
        (dir, bib, id)
    }

    fn titulos(bib: &Mutex<Biblioteca>) -> Vec<String> {
        let mut t: Vec<String> = travar(bib)
            .listar()
            .unwrap()
            .into_iter()
            .map(|l| l.titulo)
            .collect();
        t.sort();
        t
    }

    #[test]
    fn exporta_com_os_livros_e_restaura_numa_biblioteca_vazia() {
        let (dir, origem, id) = com_livros();
        let copia = dir.path().join("minha.folio-backup");
        let manifesto = exportar(&origem, &copia, true).unwrap();
        assert_eq!((manifesto.livros, manifesto.arquivos), (2, 2));
        assert_eq!(ler_manifesto(&copia).unwrap(), manifesto);
        assert!(!parcial(&copia).exists());

        let (_dir2, destino) = nova();
        let r = restaurar(&destino, &copia).unwrap();
        assert_eq!((r.livros, r.sem_arquivo), (2, 0));
        assert_eq!(titulos(&destino), ["Documento de Teste", "Dom Casmurro"]);
        let b = travar(&destino);
        assert_eq!(b.progresso(&id).unwrap().unwrap().fracao, 0.37);
        let destaques = b.listar_destaques(&id).unwrap();
        assert_eq!(destaques[0].nota.as_deref(), Some("a imagem do livro"));
        // O livro abre: o arquivo veio, e a capa foi refeita dele.
        assert_eq!(
            b.ler(&id).unwrap(),
            fs::read(fixture("dom-casmurro.epub")).unwrap()
        );
        assert!(
            b.obter(&id)
                .unwrap()
                .unwrap()
                .capa
                .is_some_and(|c| c.exists())
        );
    }

    #[test]
    fn so_os_dados_restaura_sem_os_arquivos_e_importar_os_repoe() {
        let (dir, origem, id) = com_livros();
        let copia = dir.path().join("dados.folio-backup");
        let manifesto = exportar(&origem, &copia, false).unwrap();
        assert_eq!((manifesto.livros, manifesto.arquivos), (2, 0));
        assert!(fs::metadata(&copia).unwrap().len() < 100 * 1024);

        let (_dir2, destino) = nova();
        let r = restaurar(&destino, &copia).unwrap();
        assert_eq!((r.livros, r.sem_arquivo), (2, 2));
        let b = travar(&destino);
        assert!(b.ler(&id).is_err());
        // Importar o arquivo de novo põe o livro de volta, com o progresso que veio na cópia.
        b.importar(&fixture("dom-casmurro.epub")).unwrap();
        assert!(b.ler(&id).is_ok());
        assert_eq!(b.progresso(&id).unwrap().unwrap().fracao, 0.37);
    }

    #[test]
    fn restaurar_substitui_e_guarda_a_biblioteca_de_antes() {
        let (dir, origem, _) = com_livros();
        let copia = dir.path().join("a.folio-backup");
        exportar(&origem, &copia, true).unwrap();

        let (_dir2, destino) = nova();
        let de_antes = travar(&destino)
            .importar(&fixture("ingles.epub"))
            .unwrap()
            .into_livro();
        let r = restaurar(&destino, &copia).unwrap();

        // A biblioteca é a da cópia: o livro de antes saiu da lista, mas o arquivo dele ficou.
        assert_eq!(titulos(&destino), ["Documento de Teste", "Dom Casmurro"]);
        assert!(de_antes.arquivo.exists());
        // E dá para desfazer: a de antes foi guardada, e restaurá-la traz o livro de volta.
        assert!(r.anterior.exists());
        let volta = restaurar(&destino, &r.anterior).unwrap();
        assert_eq!((volta.livros, volta.sem_arquivo), (1, 0));
        assert_eq!(titulos(&destino), ["Pride and Prejudice"]);
    }

    #[test]
    fn o_que_nao_e_copia_e_recusado_sem_mexer_na_biblioteca() {
        let (dir, bib, _) = com_livros();
        let lixo = dir.path().join("lixo.folio-backup");
        fs::write(&lixo, b"isto nao e um zip").unwrap();
        assert!(matches!(restaurar(&bib, &lixo), Err(ErroCopia::NaoECopia)));
        // Um ZIP qualquer (um EPUB): sem manifesto.
        assert!(matches!(
            restaurar(&bib, &fixture("minimo.epub")),
            Err(ErroCopia::NaoECopia)
        ));
        assert_eq!(titulos(&bib), ["Documento de Teste", "Dom Casmurro"]);
        assert!(!travar(&bib).dir_dados.join("restaurar.parcial").exists());
    }

    /// Um ZIP feito à mão, com o manifesto e as entradas dadas.
    fn zip_com(caminho: &Path, manifesto: &str, entradas: &[(&str, &[u8])]) {
        let mut zip = ZipWriter::new(File::create(caminho).unwrap());
        let opcoes = SimpleFileOptions::default();
        zip.start_file(MANIFESTO, opcoes).unwrap();
        zip.write_all(manifesto.as_bytes()).unwrap();
        for (nome, bytes) in entradas {
            zip.start_file(*nome, opcoes).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }

    fn manifesto_json(formato: u32, esquema: i64) -> String {
        format!(
            r#"{{"formato":{formato},"versaoDoApp":"9.9.9","esquema":{esquema},"criadaEm":1,"livros":0,"arquivos":0}}"#
        )
    }

    #[test]
    fn copia_de_versao_mais_nova_e_recusada() {
        let (dir, bib, _) = com_livros();
        for (formato, esquema) in [(FORMATO + 1, 1), (FORMATO, 999)] {
            let caminho = dir.path().join("nova.folio-backup");
            zip_com(
                &caminho,
                &manifesto_json(formato, esquema),
                &[(BANCO, b"x")],
            );
            assert!(matches!(
                restaurar(&bib, &caminho),
                Err(ErroCopia::VersaoMaisNova)
            ));
        }
        assert_eq!(titulos(&bib).len(), 2);
    }

    #[test]
    fn banco_danificado_nao_entra_e_a_biblioteca_fica_como_estava() {
        let (dir, bib, id) = com_livros();
        let caminho = dir.path().join("ruim.folio-backup");
        zip_com(
            &caminho,
            &manifesto_json(FORMATO, 1),
            &[(BANCO, b"isto nao e um banco sqlite, de jeito nenhum")],
        );
        assert!(restaurar(&bib, &caminho).is_err());
        assert_eq!(titulos(&bib), ["Documento de Teste", "Dom Casmurro"]);
        // A biblioteca continua funcionando (a conexão é a de antes).
        assert_eq!(travar(&bib).progresso(&id).unwrap().unwrap().fracao, 0.37);
    }

    #[test]
    fn nomes_fora_da_pasta_dos_livros_nao_sao_extraidos() {
        let hex = "a".repeat(64);
        assert_eq!(
            nome_de_livro(&format!("livros/{hex}.epub")),
            Some(format!("{hex}.epub").as_str())
        );
        for ruim in [
            "livros/../../fora.epub".to_string(),
            format!("livros/sub/{hex}.epub"),
            format!("livros/{hex}.sh"),
            format!("{hex}.epub"),
            "livros/curto.pdf".to_string(),
            format!("/livros/{hex}.pdf"),
        ] {
            assert_eq!(nome_de_livro(&ruim), None, "{ruim}");
        }

        // Num ZIP de verdade: o livro com nome bom entra; o que tenta sair da pasta, não.
        let (dir, origem, _) = com_livros();
        let boa = dir.path().join("boa.folio-backup");
        exportar(&origem, &boa, false).unwrap();
        let banco = {
            let mut zip = ZipArchive::new(File::open(&boa).unwrap()).unwrap();
            let mut bytes = Vec::new();
            zip.by_name(BANCO).unwrap().read_to_end(&mut bytes).unwrap();
            bytes
        };
        let maliciosa = dir.path().join("maliciosa.folio-backup");
        zip_com(
            &maliciosa,
            &manifesto_json(FORMATO, biblioteca::versao_do_esquema()),
            &[
                (BANCO, &banco),
                ("livros/../../../escapou.txt", b"fora"),
                (&format!("livros/{hex}.epub"), b"dentro"),
            ],
        );
        let (dir2, destino) = nova();
        restaurar(&destino, &maliciosa).unwrap();
        assert!(!dir2.path().join("escapou.txt").exists());
        assert!(!dir2.path().join("dados/escapou.txt").exists());
        assert!(
            travar(&destino)
                .dir_livros()
                .join(format!("{hex}.epub"))
                .exists()
        );
    }
}
