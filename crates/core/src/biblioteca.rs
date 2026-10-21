//! Biblioteca: livros importados e progresso de leitura, em SQLite.
//!
//! Ao importar, o arquivo é **copiado** para o diretório de dados (`<id>.epub` ou `<id>.pdf`), então a
//! biblioteca continua funcionando se o original for movido ou apagado. O id é o SHA-256
//! do conteúdo: importar o mesmo livro duas vezes não duplica nada.

use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tracing::instrument;

use crate::epub::{self, Capa, ErroEpub};
use crate::formato::Formato;
use crate::livro::{self, ErroAbrir};
use crate::pdf::{self, ErroPdf};
use crate::preferencias::PreferenciasLeitura;

const CHAVE_LEITURA: &str = "leitura";

const ARQUIVO_BANCO: &str = "biblioteca.sqlite3";
const DIR_LIVROS: &str = "livros";

/// Cada entrada leva o banco da versão `i` para `i + 1`. Nunca edite uma migração já
/// publicada: acrescente outra. A versão atual fica em `PRAGMA user_version`.
const MIGRACOES: &[&str] = &[
    "
    CREATE TABLE livros (
        id            TEXT PRIMARY KEY,  -- SHA-256 do arquivo, em hexadecimal
        formato       TEXT NOT NULL,
        titulo        TEXT NOT NULL,
        autores       TEXT NOT NULL,     -- um por linha
        idioma        TEXT,
        arquivo       TEXT NOT NULL,     -- nome dentro do diretório de livros
        capa          TEXT,              -- nome dentro do diretório de capas
        adicionado_em INTEGER NOT NULL,  -- segundos desde 1970 (UTC)
        aberto_em     INTEGER
    );
    CREATE TABLE progresso (
        livro_id      TEXT PRIMARY KEY REFERENCES livros(id) ON DELETE CASCADE,
        localizacao   TEXT NOT NULL,     -- EPUB CFI ou `pagina:N` (PDF)
        fracao        REAL NOT NULL,     -- 0.0 a 1.0
        atualizado_em INTEGER NOT NULL
    );
",
    "
    -- Preferências gerais, em JSON por chave (ex.: 'leitura').
    CREATE TABLE preferencias (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
    );
",
];

/// Um livro como a interface o vê.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LivroNaBiblioteca {
    pub id: String,
    pub formato: Formato,
    pub titulo: String,
    pub autores: Vec<String>,
    pub idioma: Option<String>,
    pub arquivo: PathBuf,
    pub capa: Option<PathBuf>,
    pub adicionado_em: i64,
    pub aberto_em: Option<i64>,
    /// Quanto já foi lido (0.0 a 1.0), se o livro já foi aberto.
    pub fracao: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, serde::Deserialize)]
pub struct Progresso {
    pub localizacao: String,
    pub fracao: f64,
}

#[derive(Debug, thiserror::Error)]
pub enum ErroBiblioteca {
    #[error("erro no banco da biblioteca")]
    Banco(#[from] rusqlite::Error),
    #[error(transparent)]
    Abrir(#[from] ErroAbrir),
    #[error("EPUB inválido")]
    Epub(#[from] ErroEpub),
    #[error(transparent)]
    Pdf(#[from] ErroPdf),
    #[error("livro não encontrado na biblioteca: {0}")]
    NaoEncontrado(String),
    #[error("não foi possível gravar {}", caminho.display())]
    Io {
        caminho: PathBuf,
        #[source]
        fonte: io::Error,
    },
}

type Resultado<T> = Result<T, ErroBiblioteca>;

pub struct Biblioteca {
    conexao: Connection,
    dir_livros: PathBuf,
    dir_capas: PathBuf,
    /// Fonte do "agora"; trocável nos testes.
    relogio: fn() -> i64,
}

fn agora() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
}

impl Biblioteca {
    /// Abre (ou cria) a biblioteca. `dados` guarda o banco e os livros; `capas` é um cache.
    #[instrument(skip_all, fields(dados = %dados.display()))]
    pub fn abrir(dados: &Path, capas: &Path) -> Resultado<Self> {
        let dir_livros = dados.join(DIR_LIVROS);
        for dir in [&dir_livros, capas] {
            criar_dir(dir)?;
        }
        let mut conexao = Connection::open(dados.join(ARQUIVO_BANCO))?;
        conexao.pragma_update(None, "foreign_keys", true)?;
        conexao.pragma_update(None, "journal_mode", "WAL")?;
        migrar(&mut conexao)?;
        Ok(Self {
            conexao,
            dir_livros,
            dir_capas: capas.to_path_buf(),
            relogio: agora,
        })
    }

    /// Importa um livro. Se ele já estiver na biblioteca, devolve o existente.
    #[instrument(skip(self), fields(origem = %origem.display()))]
    pub fn importar(&self, origem: &Path) -> Resultado<LivroNaBiblioteca> {
        let livro = livro::abrir(origem)?;
        let id = hash(&livro.bytes);
        if let Some(existente) = self.obter(&id)? {
            tracing::info!(%id, "livro já estava na biblioteca");
            return Ok(existente);
        }

        // PDFs chegam sem capa: o frontend a gera com o pdf.js e chama `definir_capa`.
        let (m, capa) = match livro.formato {
            Formato::Epub => {
                let epub = epub::ler(&livro.bytes)?;
                (epub.metadados, epub.capa)
            }
            Formato::Pdf => (pdf::ler(&livro.bytes)?, None),
        };
        let arquivo = format!("{id}.{}", livro.formato.como_texto());
        gravar(&self.dir_livros.join(&arquivo), &livro.bytes)?;
        let capa = capa.map(|c| self.gravar_capa(&id, &c)).transpose()?;

        // Sem título nos metadados, usa o nome do arquivo.
        let titulo = m.titulo.unwrap_or_else(|| {
            origem
                .file_stem()
                .map_or_else(|| id.clone(), |s| s.to_string_lossy().into_owned())
        });
        self.conexao.execute(
            "INSERT INTO livros (id, formato, titulo, autores, idioma, arquivo, capa, adicionado_em)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                livro.formato.como_texto(),
                titulo,
                m.autores.join("\n"),
                m.idioma,
                arquivo,
                capa,
                (self.relogio)(),
            ],
        )?;
        tracing::info!(%id, %titulo, "livro importado");
        self.obter(&id)?.ok_or(ErroBiblioteca::NaoEncontrado(id))
    }

    /// Livros por atividade recente: o último aberto (ou adicionado) primeiro.
    pub fn listar(&self) -> Resultado<Vec<LivroNaBiblioteca>> {
        let sql = format!(
            "{SELECT_LIVRO} ORDER BY COALESCE(l.aberto_em, l.adicionado_em) DESC, l.titulo"
        );
        let mut consulta = self.conexao.prepare(&sql)?;
        let livros = consulta
            .query_map([], |linha| self.livro_da_linha(linha))?
            .collect::<Result<_, _>>()?;
        Ok(livros)
    }

    pub fn obter(&self, id: &str) -> Resultado<Option<LivroNaBiblioteca>> {
        let sql = format!("{SELECT_LIVRO} WHERE l.id = ?1");
        Ok(self
            .conexao
            .query_row(&sql, [id], |linha| self.livro_da_linha(linha))
            .optional()?)
    }

    /// Bytes do livro, sem efeitos colaterais (ex.: para gerar a capa de um PDF).
    pub fn arquivo(&self, id: &str) -> Resultado<Vec<u8>> {
        let livro = self
            .obter(id)?
            .ok_or_else(|| ErroBiblioteca::NaoEncontrado(id.to_owned()))?;
        Ok(livro::abrir(&livro.arquivo)?.bytes)
    }

    /// Bytes do livro para leitura; registra a abertura.
    #[instrument(skip(self))]
    pub fn ler(&self, id: &str) -> Resultado<Vec<u8>> {
        let bytes = self.arquivo(id)?;
        self.marcar_aberto(id)?;
        Ok(bytes)
    }

    /// Guarda uma capa gerada fora do core (a primeira página de um PDF, renderizada pelo pdf.js).
    #[instrument(skip(self, capa), fields(tipo = %capa.tipo_midia, tamanho = capa.bytes.len()))]
    pub fn definir_capa(&self, id: &str, capa: &Capa) -> Resultado<LivroNaBiblioteca> {
        if self.obter(id)?.is_none() {
            return Err(ErroBiblioteca::NaoEncontrado(id.to_owned()));
        }
        let nome = self.gravar_capa(id, capa)?;
        self.conexao.execute(
            "UPDATE livros SET capa = ?1 WHERE id = ?2",
            params![nome, id],
        )?;
        self.obter(id)?
            .ok_or_else(|| ErroBiblioteca::NaoEncontrado(id.to_owned()))
    }

    fn gravar_capa(&self, id: &str, capa: &Capa) -> Resultado<String> {
        let nome = format!("{id}.{}", extensao(&capa.tipo_midia));
        gravar(&self.dir_capas.join(&nome), &capa.bytes)?;
        Ok(nome)
    }

    /// Registra que o livro foi aberto agora (para a ordenação por leitura recente).
    pub fn marcar_aberto(&self, id: &str) -> Resultado<()> {
        let alterados = self.conexao.execute(
            "UPDATE livros SET aberto_em = ?1 WHERE id = ?2",
            params![(self.relogio)(), id],
        )?;
        if alterados == 0 {
            return Err(ErroBiblioteca::NaoEncontrado(id.to_owned()));
        }
        Ok(())
    }

    pub fn salvar_progresso(&self, id: &str, progresso: &Progresso) -> Resultado<()> {
        let resultado = self.conexao.execute(
            "INSERT INTO progresso (livro_id, localizacao, fracao, atualizado_em)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (livro_id) DO UPDATE SET
                 localizacao = excluded.localizacao,
                 fracao = excluded.fracao,
                 atualizado_em = excluded.atualizado_em",
            params![
                id,
                progresso.localizacao,
                progresso.fracao.clamp(0.0, 1.0),
                (self.relogio)()
            ],
        );
        match resultado {
            Ok(_) => Ok(()),
            // A chave estrangeira falha se o livro não existir.
            Err(rusqlite::Error::SqliteFailure(e, _))
                if e.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                Err(ErroBiblioteca::NaoEncontrado(id.to_owned()))
            }
            Err(e) => Err(e.into()),
        }
    }

    pub fn progresso(&self, id: &str) -> Resultado<Option<Progresso>> {
        Ok(self
            .conexao
            .query_row(
                "SELECT localizacao, fracao FROM progresso WHERE livro_id = ?1",
                [id],
                |linha| {
                    Ok(Progresso {
                        localizacao: linha.get(0)?,
                        fracao: linha.get(1)?,
                    })
                },
            )
            .optional()?)
    }

    /// Preferências de leitura salvas, ou o padrão se ainda não houver.
    pub fn preferencias_leitura(&self) -> Resultado<PreferenciasLeitura> {
        let json: Option<String> = self
            .conexao
            .query_row(
                "SELECT valor FROM preferencias WHERE chave = ?1",
                [CHAVE_LEITURA],
                |linha| linha.get(0),
            )
            .optional()?;
        Ok(json.map_or_else(PreferenciasLeitura::default, |j| {
            PreferenciasLeitura::de_json(&j)
        }))
    }

    /// Salva as preferências (normalizadas) e devolve o que foi de fato gravado.
    pub fn salvar_preferencias_leitura(
        &self,
        preferencias: PreferenciasLeitura,
    ) -> Resultado<PreferenciasLeitura> {
        let preferencias = preferencias.normalizada();
        self.conexao.execute(
            "INSERT INTO preferencias (chave, valor) VALUES (?1, ?2)
             ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor",
            params![CHAVE_LEITURA, preferencias.para_json()],
        )?;
        Ok(preferencias)
    }

    fn livro_da_linha(&self, linha: &Row) -> rusqlite::Result<LivroNaBiblioteca> {
        let formato: String = linha.get("formato")?;
        let autores: String = linha.get("autores")?;
        let arquivo: String = linha.get("arquivo")?;
        let capa: Option<String> = linha.get("capa")?;
        Ok(LivroNaBiblioteca {
            id: linha.get("id")?,
            formato: Formato::de_texto(&formato).unwrap_or(Formato::Epub),
            titulo: linha.get("titulo")?,
            autores: autores.lines().map(str::to_owned).collect(),
            idioma: linha.get("idioma")?,
            arquivo: self.dir_livros.join(arquivo),
            capa: capa.map(|c| self.dir_capas.join(c)),
            adicionado_em: linha.get("adicionado_em")?,
            aberto_em: linha.get("aberto_em")?,
            fracao: linha.get("fracao")?,
        })
    }
}

const SELECT_LIVRO: &str = "
    SELECT l.id, l.formato, l.titulo, l.autores, l.idioma, l.arquivo, l.capa,
           l.adicionado_em, l.aberto_em, p.fracao
    FROM livros l LEFT JOIN progresso p ON p.livro_id = l.id";

fn migrar(conexao: &mut Connection) -> rusqlite::Result<()> {
    let versao: i64 = conexao.pragma_query_value(None, "user_version", |l| l.get(0))?;
    let versao = usize::try_from(versao).unwrap_or(0);
    for (i, sql) in MIGRACOES.iter().enumerate().skip(versao) {
        // Uma transação por migração: se falhar, o banco fica na versão anterior.
        let transacao = conexao.transaction()?;
        transacao.execute_batch(sql)?;
        transacao.pragma_update(None, "user_version", (i + 1) as i64)?;
        transacao.commit()?;
        tracing::info!(versao = i + 1, "banco migrado");
    }
    Ok(())
}

fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn extensao(tipo_midia: &str) -> &'static str {
    match tipo_midia {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        _ => "img",
    }
}

fn criar_dir(dir: &Path) -> Resultado<()> {
    std::fs::create_dir_all(dir).map_err(|fonte| ErroBiblioteca::Io {
        caminho: dir.to_path_buf(),
        fonte,
    })
}

/// Grava num arquivo temporário e renomeia: quem lê nunca vê um arquivo pela metade.
fn gravar(destino: &Path, bytes: &[u8]) -> Resultado<()> {
    let temporario = destino.with_extension("parcial");
    std::fs::write(&temporario, bytes)
        .and_then(|()| std::fs::rename(&temporario, destino))
        .map_err(|fonte| ErroBiblioteca::Io {
            caminho: destino.to_path_buf(),
            fonte,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(nome: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures")
            .join(nome)
    }

    /// Biblioteca num diretório temporário (apagado quando o `TempDir` sai de escopo).
    fn nova() -> (tempfile::TempDir, Biblioteca) {
        let dir = tempfile::tempdir().unwrap();
        let bib = Biblioteca::abrir(&dir.path().join("dados"), &dir.path().join("capas")).unwrap();
        (dir, bib)
    }

    #[test]
    fn importa_com_metadados_capa_e_copia() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("dom-casmurro.epub")).unwrap();

        assert_eq!(livro.titulo, "Dom Casmurro");
        assert_eq!(livro.autores, ["Machado de Assis"]);
        assert_eq!(livro.idioma.as_deref(), Some("pt"));
        assert_eq!(livro.id.len(), 64);
        assert_eq!(
            std::fs::read(&livro.arquivo).unwrap(),
            std::fs::read(fixture("dom-casmurro.epub")).unwrap()
        );
        let capa = livro.capa.expect("tem capa");
        assert!(capa.extension().is_some_and(|e| e == "jpg"));
        assert_eq!(std::fs::metadata(capa).unwrap().len(), 40_980);
    }

    #[test]
    fn importar_duas_vezes_nao_duplica() {
        let (_dir, bib) = nova();
        let a = bib.importar(&fixture("minimo.epub")).unwrap();
        let b = bib.importar(&fixture("minimo.epub")).unwrap();
        assert_eq!(a, b);
        assert_eq!(bib.listar().unwrap().len(), 1);
    }

    #[test]
    fn importa_pdf_com_metadados_e_sem_capa() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("metadados-utf16.pdf")).unwrap();
        assert_eq!(livro.formato, Formato::Pdf);
        assert_eq!(livro.titulo, "Memórias Póstumas");
        assert_eq!(livro.autores, ["Machado de Assis", "Outro"]);
        assert!(livro.arquivo.extension().is_some_and(|e| e == "pdf"));
        assert_eq!(livro.capa, None);
    }

    #[test]
    fn pdf_sem_titulo_usa_nome_do_arquivo() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.pdf")).unwrap();
        assert_eq!(livro.titulo, "minimo");
    }

    #[test]
    fn definir_capa_grava_e_atualiza() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.pdf")).unwrap();
        let capa = Capa {
            tipo_midia: "image/jpeg".into(),
            bytes: vec![0xff, 0xd8, 0xff],
        };
        let atualizado = bib.definir_capa(&livro.id, &capa).unwrap();
        let caminho = atualizado.capa.expect("capa definida");
        assert_eq!(std::fs::read(caminho).unwrap(), capa.bytes);
        assert!(matches!(
            bib.definir_capa("nao-existe", &capa).unwrap_err(),
            ErroBiblioteca::NaoEncontrado(_)
        ));
    }

    #[test]
    fn arquivo_nao_marca_como_aberto() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.pdf")).unwrap();
        bib.arquivo(&livro.id).unwrap();
        assert_eq!(bib.obter(&livro.id).unwrap().unwrap().aberto_em, None);
    }

    #[test]
    fn arquivo_invalido_nao_entra() {
        let (_dir, bib) = nova();
        assert!(bib.importar(&fixture("quebrados/texto.epub")).is_err());
        assert!(bib.listar().unwrap().is_empty());
    }

    #[test]
    fn lista_por_atividade_recente() {
        let (_dir, mut bib) = nova();
        bib.relogio = || 100;
        let antigo = bib.importar(&fixture("minimo.epub")).unwrap();
        bib.relogio = || 200;
        let novo = bib.importar(&fixture("capa-epub2.epub")).unwrap();

        let ids = |bib: &Biblioteca| -> Vec<String> {
            bib.listar().unwrap().into_iter().map(|l| l.id).collect()
        };
        assert_eq!(ids(&bib), [novo.id.clone(), antigo.id.clone()]);

        bib.relogio = || 300;
        bib.marcar_aberto(&antigo.id).unwrap();
        assert_eq!(ids(&bib), [antigo.id, novo.id]);
    }

    #[test]
    fn ler_devolve_bytes_e_marca_aberto() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap();
        assert_eq!(livro.aberto_em, None);
        let bytes = bib.ler(&livro.id).unwrap();
        assert_eq!(bytes, std::fs::read(fixture("minimo.epub")).unwrap());
        assert!(bib.obter(&livro.id).unwrap().unwrap().aberto_em.is_some());
        assert!(matches!(
            bib.ler("nao-existe").unwrap_err(),
            ErroBiblioteca::NaoEncontrado(_)
        ));
    }

    #[test]
    fn progresso_salva_e_atualiza() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap();
        assert_eq!(bib.progresso(&livro.id).unwrap(), None);

        let p1 = Progresso {
            localizacao: "epubcfi(/6/2)".into(),
            fracao: 0.25,
        };
        bib.salvar_progresso(&livro.id, &p1).unwrap();
        let p2 = Progresso {
            localizacao: "epubcfi(/6/4)".into(),
            fracao: 0.5,
        };
        bib.salvar_progresso(&livro.id, &p2).unwrap();

        assert_eq!(bib.progresso(&livro.id).unwrap(), Some(p2));
        assert_eq!(bib.obter(&livro.id).unwrap().unwrap().fracao, Some(0.5));
    }

    #[test]
    fn progresso_de_livro_inexistente() {
        let (_dir, bib) = nova();
        let p = Progresso {
            localizacao: "x".into(),
            fracao: 0.1,
        };
        let erro = bib.salvar_progresso("nao-existe", &p).unwrap_err();
        assert!(matches!(erro, ErroBiblioteca::NaoEncontrado(_)), "{erro:?}");
        assert!(matches!(
            bib.marcar_aberto("nao-existe").unwrap_err(),
            ErroBiblioteca::NaoEncontrado(_)
        ));
    }

    #[test]
    fn preferencias_padrao_salvas_e_normalizadas() {
        use crate::preferencias::Fonte;

        let (_dir, bib) = nova();
        assert_eq!(
            bib.preferencias_leitura().unwrap(),
            PreferenciasLeitura::default()
        );

        let pedidas = PreferenciasLeitura {
            fonte: Fonte::Atkinson,
            tamanho: 50.0,
            ..Default::default()
        };
        let gravadas = bib.salvar_preferencias_leitura(pedidas).unwrap();
        assert_eq!(gravadas.tamanho, crate::preferencias::limites::TAMANHO.1);
        assert_eq!(bib.preferencias_leitura().unwrap(), gravadas);

        let outras = PreferenciasLeitura {
            fonte: Fonte::Lexend,
            ..Default::default()
        };
        bib.salvar_preferencias_leitura(outras.clone()).unwrap();
        assert_eq!(bib.preferencias_leitura().unwrap(), outras);
    }

    #[test]
    fn migra_banco_da_versao_1_sem_perder_dados() {
        let dir = tempfile::tempdir().unwrap();
        let (dados, capas) = (dir.path().join("dados"), dir.path().join("capas"));
        std::fs::create_dir_all(&dados).unwrap();
        // Banco como o M2 deixava: só a primeira migração aplicada.
        {
            let conexao = Connection::open(dados.join(ARQUIVO_BANCO)).unwrap();
            conexao.execute_batch(MIGRACOES[0]).unwrap();
            conexao.pragma_update(None, "user_version", 1).unwrap();
            conexao
                .execute(
                    "INSERT INTO livros (id, formato, titulo, autores, arquivo, adicionado_em)
                     VALUES ('x', 'epub', 'Antigo', '', 'x.epub', 0)",
                    [],
                )
                .unwrap();
        }
        let bib = Biblioteca::abrir(&dados, &capas).unwrap();
        assert_eq!(bib.obter("x").unwrap().unwrap().titulo, "Antigo");
        assert_eq!(
            bib.preferencias_leitura().unwrap(),
            PreferenciasLeitura::default()
        );
        let versao: i64 = bib
            .conexao
            .pragma_query_value(None, "user_version", |l| l.get(0))
            .unwrap();
        assert_eq!(versao as usize, MIGRACOES.len());
    }

    #[test]
    fn reabrir_preserva_dados_e_nao_migra_de_novo() {
        let dir = tempfile::tempdir().unwrap();
        let (dados, capas) = (dir.path().join("dados"), dir.path().join("capas"));
        let id = Biblioteca::abrir(&dados, &capas)
            .unwrap()
            .importar(&fixture("minimo.epub"))
            .unwrap()
            .id;
        let bib = Biblioteca::abrir(&dados, &capas).unwrap();
        assert!(bib.obter(&id).unwrap().is_some());
    }
}
