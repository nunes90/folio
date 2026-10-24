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
    "
    -- Vistas e lixeira (M9). Datas em vez de 0/1: ordenam as vistas; NULL quer dizer \"não\".
    ALTER TABLE livros ADD COLUMN para_ler_em INTEGER;  -- marcado \"para ler\" em
    ALTER TABLE livros ADD COLUMN lido_em     INTEGER;  -- marcado como lido à mão em (vence o progresso)
    ALTER TABLE livros ADD COLUMN removido_em INTEGER;  -- na lixeira desde
",
    "
    ALTER TABLE livros ADD COLUMN favorito_em INTEGER;  -- favoritado em (NULL = não)
",
    "
    -- Coleções (M10): criadas pelo usuário; um livro pode estar em várias.
    CREATE TABLE colecoes (
        id        INTEGER PRIMARY KEY,
        nome      TEXT NOT NULL,       -- único sem diferenciar maiúsculas (verificado no Rust)
        criada_em INTEGER NOT NULL
    );
    CREATE TABLE livros_colecoes (
        colecao_id    INTEGER NOT NULL REFERENCES colecoes(id) ON DELETE CASCADE,
        livro_id      TEXT    NOT NULL REFERENCES livros(id)   ON DELETE CASCADE,
        adicionado_em INTEGER NOT NULL,
        PRIMARY KEY (colecao_id, livro_id)
    );
    CREATE INDEX livros_colecoes_por_livro ON livros_colecoes (livro_id);
",
];

/// Resultado de [`Biblioteca::importar`]: o livro, e se ele acabou de entrar ou já estava lá.
///
/// Um enum em vez de `(LivroNaBiblioteca, bool)`: quem chama precisa decidir o que fazer em
/// cada caso (o `match` não deixa esquecer um), e o nome diz o que o `bool` só sugeriria.
#[derive(Debug, Clone, PartialEq)]
pub enum Importado {
    /// O livro entrou agora: a cópia e a capa foram gravadas.
    Novo(LivroNaBiblioteca),
    /// O mesmo arquivo (mesmo SHA-256) já estava na biblioteca; nada foi copiado.
    JaExistia(LivroNaBiblioteca),
    /// O livro estava na lixeira e voltou para a estante (com o progresso que tinha).
    Restaurado(LivroNaBiblioteca),
}

impl Importado {
    /// O livro, nos dois casos (emprestado).
    pub fn livro(&self) -> &LivroNaBiblioteca {
        match self {
            Importado::Novo(livro) | Importado::JaExistia(livro) | Importado::Restaurado(livro) => {
                livro
            }
        }
    }

    /// O livro, nos dois casos (consome o `Importado`, sem clonar).
    pub fn into_livro(self) -> LivroNaBiblioteca {
        match self {
            Importado::Novo(livro) | Importado::JaExistia(livro) | Importado::Restaurado(livro) => {
                livro
            }
        }
    }
}

/// Em que pé está a leitura de um livro (filtros da biblioteca e texto do card).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Situacao {
    /// Nunca foi aberto (não há progresso salvo).
    NaoIniciado,
    Lendo,
    Concluido,
}

impl Situacao {
    /// A partir de que fração o livro conta como concluído: a última página raramente dá 1.0
    /// exato, e o que arredonda para 100% já aparece como "100% lido".
    const LIMIAR_CONCLUIDO: f64 = 0.995;

    /// `None` é "nunca aberto"; qualquer progresso salvo, mesmo 0.0, já é "lendo".
    pub fn da_fracao(fracao: Option<f64>) -> Self {
        match fracao {
            None => Situacao::NaoIniciado,
            Some(f) if f >= Self::LIMIAR_CONCLUIDO => Situacao::Concluido,
            Some(_) => Situacao::Lendo,
        }
    }

    /// Com o "lido" marcado à mão: ele vence o progresso (um livro largado em 80% pode ser
    /// dado como lido); sem ele, vale [`Situacao::da_fracao`].
    pub fn do_livro(fracao: Option<f64>, lido_manual: bool) -> Self {
        if lido_manual {
            Situacao::Concluido
        } else {
            Self::da_fracao(fracao)
        }
    }
}

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
    /// Derivada de `fracao` e `lido_em` (ver [`Situacao::do_livro`]); vai pronta para a interface.
    pub situacao: Situacao,
    /// Marcado "para ler" em (sai ao abrir o livro).
    pub para_ler_em: Option<i64>,
    /// Marcado como lido à mão em.
    pub lido_em: Option<i64>,
    /// Na lixeira desde. Livros na lixeira não aparecem em [`Biblioteca::listar`].
    pub removido_em: Option<i64>,
    /// Favoritado em.
    pub favorito_em: Option<i64>,
    /// Ids das coleções em que o livro está.
    pub colecoes: Vec<i64>,
}

/// Uma coleção criada pelo usuário, com quantos livros (fora da lixeira) ela tem.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Colecao {
    pub id: i64,
    pub nome: String,
    pub quantidade: usize,
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
    #[error("coleção não encontrada: {0}")]
    ColecaoNaoEncontrada(i64),
    #[error("o nome da coleção não pode ficar vazio")]
    NomeDeColecaoVazio,
    #[error("já existe uma coleção chamada “{0}”")]
    ColecaoJaExiste(String),
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

    /// Importa um livro. Se ele já estiver na biblioteca, devolve o existente como
    /// [`Importado::JaExistia`].
    #[instrument(skip(self), fields(origem = %origem.display()))]
    pub fn importar(&self, origem: &Path) -> Resultado<Importado> {
        let livro = livro::abrir(origem)?;
        let id = hash(&livro.bytes);
        if let Some(existente) = self.obter(&id)? {
            if existente.removido_em.is_some() {
                self.restaurar(&id)?;
                tracing::info!(%id, "livro restaurado da lixeira ao importar");
                let restaurado = self.obter(&id)?.ok_or(ErroBiblioteca::NaoEncontrado(id))?;
                return Ok(Importado::Restaurado(restaurado));
            }
            tracing::info!(%id, "livro já estava na biblioteca");
            return Ok(Importado::JaExistia(existente));
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
        let novo = self.obter(&id)?.ok_or(ErroBiblioteca::NaoEncontrado(id))?;
        Ok(Importado::Novo(novo))
    }

    /// Livros da estante (fora da lixeira) por atividade recente: o último aberto (ou
    /// adicionado) primeiro.
    pub fn listar(&self) -> Resultado<Vec<LivroNaBiblioteca>> {
        self.consultar(
            "WHERE l.removido_em IS NULL
             ORDER BY COALESCE(l.aberto_em, l.adicionado_em) DESC, l.titulo",
        )
    }

    /// Livros na lixeira, o removido por último primeiro.
    pub fn listar_lixeira(&self) -> Resultado<Vec<LivroNaBiblioteca>> {
        self.consultar("WHERE l.removido_em IS NOT NULL ORDER BY l.removido_em DESC, l.titulo")
    }

    /// `SELECT_LIVRO` + `resto` (WHERE/ORDER BY), uma linha por livro.
    fn consultar(&self, resto: &str) -> Resultado<Vec<LivroNaBiblioteca>> {
        let sql = format!("{SELECT_LIVRO} {resto}");
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

    /// Apaga o livro de vez: o registro, o progresso (`ON DELETE CASCADE`), a cópia do
    /// arquivo e a capa em cache. O arquivo original, de onde foi importado, não é tocado.
    /// Para algo reversível, use [`Biblioteca::mover_para_lixeira`].
    #[instrument(skip(self))]
    pub fn apagar_de_vez(&self, id: &str) -> Resultado<()> {
        let livro = self
            .obter(id)?
            .ok_or_else(|| ErroBiblioteca::NaoEncontrado(id.to_owned()))?;
        // Primeiro o banco: se apagar um arquivo falhar depois, sobra só um arquivo órfão
        // (inofensivo), nunca um livro listado sem arquivo.
        self.conexao
            .execute("DELETE FROM livros WHERE id = ?1", [id])?;
        for arquivo in std::iter::once(&livro.arquivo).chain(livro.capa.as_ref()) {
            match std::fs::remove_file(arquivo) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(erro) => {
                    tracing::warn!(%erro, arquivo = %arquivo.display(), "arquivo do livro não apagado")
                }
            }
        }
        tracing::info!(%id, titulo = %livro.titulo, "livro apagado de vez");
        Ok(())
    }

    /// Manda o livro para a lixeira: some da estante, mas a cópia, a capa e o progresso
    /// ficam até [`Biblioteca::restaurar`] ou [`Biblioteca::esvaziar_lixeira`].
    #[instrument(skip(self))]
    pub fn mover_para_lixeira(&self, id: &str) -> Resultado<()> {
        self.atualizar(
            "UPDATE livros SET removido_em = ?1 WHERE id = ?2",
            params![(self.relogio)(), id],
            id,
        )
    }

    #[instrument(skip(self))]
    pub fn restaurar(&self, id: &str) -> Resultado<()> {
        self.atualizar(
            "UPDATE livros SET removido_em = NULL WHERE id = ?1",
            params![id],
            id,
        )
    }

    /// Apaga de vez todos os livros da lixeira; devolve quantos foram.
    #[instrument(skip(self))]
    pub fn esvaziar_lixeira(&self) -> Resultado<usize> {
        let lixeira = self.listar_lixeira()?;
        for livro in &lixeira {
            self.apagar_de_vez(&livro.id)?;
        }
        Ok(lixeira.len())
    }

    /// Coleções em ordem alfabética, com a quantidade de livros fora da lixeira.
    pub fn listar_colecoes(&self) -> Resultado<Vec<Colecao>> {
        let mut consulta = self.conexao.prepare(
            "SELECT c.id, c.nome,
                    (SELECT COUNT(*) FROM livros_colecoes lc JOIN livros l ON l.id = lc.livro_id
                     WHERE lc.colecao_id = c.id AND l.removido_em IS NULL)
             FROM colecoes c ORDER BY c.nome COLLATE NOCASE, c.id",
        )?;
        let colecoes = consulta
            .query_map([], |linha| {
                Ok(Colecao {
                    id: linha.get(0)?,
                    nome: linha.get(1)?,
                    quantidade: linha.get::<_, i64>(2)? as usize,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(colecoes)
    }

    /// Cria uma coleção. O nome é aparado; vazio ou repetido (sem diferenciar maiúsculas) é
    /// recusado.
    #[instrument(skip(self))]
    pub fn criar_colecao(&self, nome: &str) -> Resultado<Colecao> {
        let nome = self.validar_nome_de_colecao(nome, None)?;
        self.conexao.execute(
            "INSERT INTO colecoes (nome, criada_em) VALUES (?1, ?2)",
            params![nome, (self.relogio)()],
        )?;
        Ok(Colecao {
            id: self.conexao.last_insert_rowid(),
            nome,
            quantidade: 0,
        })
    }

    #[instrument(skip(self))]
    pub fn renomear_colecao(&self, id: i64, nome: &str) -> Resultado<()> {
        let nome = self.validar_nome_de_colecao(nome, Some(id))?;
        let alterados = self.conexao.execute(
            "UPDATE colecoes SET nome = ?1 WHERE id = ?2",
            params![nome, id],
        )?;
        if alterados == 0 {
            return Err(ErroBiblioteca::ColecaoNaoEncontrada(id));
        }
        Ok(())
    }

    /// Apaga a coleção; os livros continuam na biblioteca.
    #[instrument(skip(self))]
    pub fn apagar_colecao(&self, id: i64) -> Resultado<()> {
        if self
            .conexao
            .execute("DELETE FROM colecoes WHERE id = ?1", [id])?
            == 0
        {
            return Err(ErroBiblioteca::ColecaoNaoEncontrada(id));
        }
        Ok(())
    }

    /// Põe o livro na coleção (se já estiver, nada muda).
    pub fn adicionar_a_colecao(&self, colecao: i64, livro: &str) -> Resultado<()> {
        self.exigir_colecao(colecao)?;
        if self.obter(livro)?.is_none() {
            return Err(ErroBiblioteca::NaoEncontrado(livro.to_owned()));
        }
        self.conexao.execute(
            "INSERT OR IGNORE INTO livros_colecoes (colecao_id, livro_id, adicionado_em)
             VALUES (?1, ?2, ?3)",
            params![colecao, livro, (self.relogio)()],
        )?;
        Ok(())
    }

    /// Tira o livro da coleção (se não estiver, nada muda).
    pub fn remover_da_colecao(&self, colecao: i64, livro: &str) -> Resultado<()> {
        self.exigir_colecao(colecao)?;
        self.conexao.execute(
            "DELETE FROM livros_colecoes WHERE colecao_id = ?1 AND livro_id = ?2",
            params![colecao, livro],
        )?;
        Ok(())
    }

    fn exigir_colecao(&self, id: i64) -> Resultado<()> {
        let existe = self
            .conexao
            .query_row("SELECT 1 FROM colecoes WHERE id = ?1", [id], |_| Ok(()))
            .optional()?;
        existe.ok_or(ErroBiblioteca::ColecaoNaoEncontrada(id))
    }

    /// Nome aparado, não vazio e sem repetir o de outra coleção. A comparação é em Rust
    /// (`to_lowercase`): o `COLLATE NOCASE` do SQLite só ignora a caixa em ASCII, e "Ficção"
    /// e "FICÇÃO" seriam nomes diferentes para ele. `exceto` é a própria coleção, ao renomear.
    fn validar_nome_de_colecao(&self, nome: &str, exceto: Option<i64>) -> Resultado<String> {
        let nome = nome.trim();
        if nome.is_empty() {
            return Err(ErroBiblioteca::NomeDeColecaoVazio);
        }
        let procurado = nome.to_lowercase();
        if let Some(existente) = self
            .listar_colecoes()?
            .into_iter()
            .find(|c| Some(c.id) != exceto && c.nome.to_lowercase() == procurado)
        {
            return Err(ErroBiblioteca::ColecaoJaExiste(existente.nome));
        }
        Ok(nome.to_owned())
    }

    /// Marca ou desmarca o livro como favorito.
    pub fn definir_favorito(&self, id: &str, favorito: bool) -> Resultado<()> {
        let quando = favorito.then(self.relogio);
        self.atualizar(
            "UPDATE livros SET favorito_em = ?1 WHERE id = ?2",
            params![quando, id],
            id,
        )
    }

    /// Marca ou desmarca "para ler".
    pub fn definir_para_ler(&self, id: &str, para_ler: bool) -> Resultado<()> {
        let quando = para_ler.then(self.relogio);
        self.atualizar(
            "UPDATE livros SET para_ler_em = ?1 WHERE id = ?2",
            params![quando, id],
            id,
        )
    }

    /// Marca ou desmarca o livro como lido, à mão. Marcar tira de "para ler"; o progresso
    /// salvo não é tocado (desmarcar volta à situação dele).
    pub fn definir_lido(&self, id: &str, lido: bool) -> Resultado<()> {
        if lido {
            self.atualizar(
                "UPDATE livros SET lido_em = ?1, para_ler_em = NULL WHERE id = ?2",
                params![(self.relogio)(), id],
                id,
            )
        } else {
            self.atualizar(
                "UPDATE livros SET lido_em = NULL WHERE id = ?1",
                params![id],
                id,
            )
        }
    }

    /// Registra que o livro foi aberto agora (para a ordenação por leitura recente). Começar
    /// a ler tira o livro de "para ler".
    pub fn marcar_aberto(&self, id: &str) -> Resultado<()> {
        self.atualizar(
            "UPDATE livros SET aberto_em = ?1, para_ler_em = NULL WHERE id = ?2",
            params![(self.relogio)(), id],
            id,
        )
    }

    /// Executa um UPDATE de um livro só; nenhuma linha alterada vira `NaoEncontrado`.
    fn atualizar(&self, sql: &str, parametros: impl rusqlite::Params, id: &str) -> Resultado<()> {
        if self.conexao.execute(sql, parametros)? == 0 {
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
        let fracao: Option<f64> = linha.get("fracao")?;
        let lido_em: Option<i64> = linha.get("lido_em")?;
        // "3,7" (GROUP_CONCAT) → [3, 7]; sem coleções, NULL.
        let colecoes: Option<String> = linha.get("colecoes")?;
        let colecoes = colecoes
            .iter()
            .flat_map(|texto| texto.split(','))
            .filter_map(|id| id.parse().ok())
            .collect();
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
            fracao,
            situacao: Situacao::do_livro(fracao, lido_em.is_some()),
            para_ler_em: linha.get("para_ler_em")?,
            lido_em,
            removido_em: linha.get("removido_em")?,
            favorito_em: linha.get("favorito_em")?,
            colecoes,
        })
    }
}

const SELECT_LIVRO: &str = "
    SELECT l.id, l.formato, l.titulo, l.autores, l.idioma, l.arquivo, l.capa,
           l.adicionado_em, l.aberto_em, l.para_ler_em, l.lido_em, l.removido_em,
           l.favorito_em, p.fracao,
           (SELECT group_concat(lc.colecao_id) FROM livros_colecoes lc
            WHERE lc.livro_id = l.id) AS colecoes
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
        let livro = bib
            .importar(&fixture("dom-casmurro.epub"))
            .unwrap()
            .into_livro();

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
        assert!(matches!(a, Importado::Novo(_)), "{a:?}");
        assert!(matches!(b, Importado::JaExistia(_)), "{b:?}");
        assert_eq!(a.livro(), b.livro());
        assert_eq!(bib.listar().unwrap().len(), 1);
    }

    #[test]
    fn importa_pdf_com_metadados_e_sem_capa() {
        let (_dir, bib) = nova();
        let livro = bib
            .importar(&fixture("metadados-utf16.pdf"))
            .unwrap()
            .into_livro();
        assert_eq!(livro.formato, Formato::Pdf);
        assert_eq!(livro.titulo, "Memórias Póstumas");
        assert_eq!(livro.autores, ["Machado de Assis", "Outro"]);
        assert!(livro.arquivo.extension().is_some_and(|e| e == "pdf"));
        assert_eq!(livro.capa, None);
    }

    #[test]
    fn pdf_sem_titulo_usa_nome_do_arquivo() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.pdf")).unwrap().into_livro();
        assert_eq!(livro.titulo, "minimo");
    }

    #[test]
    fn definir_capa_grava_e_atualiza() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.pdf")).unwrap().into_livro();
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
        let livro = bib.importar(&fixture("minimo.pdf")).unwrap().into_livro();
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
        let antigo = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        bib.relogio = || 200;
        let novo = bib
            .importar(&fixture("capa-epub2.epub"))
            .unwrap()
            .into_livro();

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
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
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
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
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
    fn situacao_vem_da_fracao() {
        assert_eq!(Situacao::da_fracao(None), Situacao::NaoIniciado);
        assert_eq!(Situacao::da_fracao(Some(0.0)), Situacao::Lendo);
        assert_eq!(Situacao::da_fracao(Some(0.37)), Situacao::Lendo);
        assert_eq!(Situacao::da_fracao(Some(0.994)), Situacao::Lendo);
        // A última página raramente dá 1.0 exato: o que arredonda para 100% está concluído.
        assert_eq!(Situacao::da_fracao(Some(0.995)), Situacao::Concluido);
        assert_eq!(Situacao::da_fracao(Some(1.0)), Situacao::Concluido);
    }

    #[test]
    fn situacao_vai_para_a_interface_em_kebab_case() {
        let json = |s: Situacao| serde_json::to_string(&s).unwrap();
        assert_eq!(json(Situacao::NaoIniciado), r#""nao-iniciado""#);
        assert_eq!(json(Situacao::Lendo), r#""lendo""#);
        assert_eq!(json(Situacao::Concluido), r#""concluido""#);
    }

    #[test]
    fn livro_acompanha_a_situacao_do_progresso() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        assert_eq!(livro.situacao, Situacao::NaoIniciado);

        let ate = |fracao| Progresso {
            localizacao: "epubcfi(/6/2)".into(),
            fracao,
        };
        bib.salvar_progresso(&livro.id, &ate(0.4)).unwrap();
        assert_eq!(
            bib.obter(&livro.id).unwrap().unwrap().situacao,
            Situacao::Lendo
        );
        bib.salvar_progresso(&livro.id, &ate(1.0)).unwrap();
        assert_eq!(
            bib.obter(&livro.id).unwrap().unwrap().situacao,
            Situacao::Concluido
        );
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
    fn apagar_de_vez_apaga_registro_progresso_copia_e_capa() {
        let (_dir, bib) = nova();
        let livro = bib
            .importar(&fixture("dom-casmurro.epub"))
            .unwrap()
            .into_livro();
        let p = Progresso {
            localizacao: "epubcfi(/6/2)".into(),
            fracao: 0.3,
        };
        bib.salvar_progresso(&livro.id, &p).unwrap();
        let capa = livro.capa.clone().expect("tem capa");

        bib.apagar_de_vez(&livro.id).unwrap();

        assert!(bib.obter(&livro.id).unwrap().is_none());
        assert!(bib.listar().unwrap().is_empty());
        assert_eq!(
            bib.progresso(&livro.id).unwrap(),
            None,
            "progresso vai junto (cascade)"
        );
        assert!(!livro.arquivo.exists(), "cópia do livro apagada");
        assert!(!capa.exists(), "capa apagada");
        assert!(
            fixture("dom-casmurro.epub").exists(),
            "o original nunca é tocado"
        );
    }

    #[test]
    fn apagar_de_vez_livro_inexistente() {
        let (_dir, bib) = nova();
        assert!(matches!(
            bib.apagar_de_vez("nao-existe").unwrap_err(),
            ErroBiblioteca::NaoEncontrado(_)
        ));
    }

    #[test]
    fn apagar_de_vez_sem_capa_e_com_arquivo_ja_apagado_funciona() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        std::fs::remove_file(&livro.arquivo).unwrap();
        bib.apagar_de_vez(&livro.id).unwrap();
        assert!(bib.obter(&livro.id).unwrap().is_none());
    }

    #[test]
    fn reimportar_depois_de_apagar_de_vez() {
        let (_dir, bib) = nova();
        let id = bib
            .importar(&fixture("minimo.epub"))
            .unwrap()
            .into_livro()
            .id;
        bib.apagar_de_vez(&id).unwrap();
        let de_novo = bib.importar(&fixture("minimo.epub")).unwrap();
        assert!(matches!(de_novo, Importado::Novo(_)), "{de_novo:?}");
        let de_novo = de_novo.into_livro();
        assert_eq!(de_novo.id, id);
        assert!(de_novo.arquivo.exists());
    }

    #[test]
    fn para_ler_marca_e_sai_ao_abrir() {
        let (_dir, mut bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        assert_eq!(livro.para_ler_em, None);

        bib.relogio = || 500;
        bib.definir_para_ler(&livro.id, true).unwrap();
        assert_eq!(
            bib.obter(&livro.id).unwrap().unwrap().para_ler_em,
            Some(500)
        );
        bib.definir_para_ler(&livro.id, false).unwrap();
        assert_eq!(bib.obter(&livro.id).unwrap().unwrap().para_ler_em, None);

        // Começar a ler tira o livro de "Para ler".
        bib.definir_para_ler(&livro.id, true).unwrap();
        bib.marcar_aberto(&livro.id).unwrap();
        assert_eq!(bib.obter(&livro.id).unwrap().unwrap().para_ler_em, None);
    }

    #[test]
    fn favorito_marca_e_desmarca() {
        let (_dir, mut bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        assert_eq!(livro.favorito_em, None);

        bib.relogio = || 800;
        bib.definir_favorito(&livro.id, true).unwrap();
        assert_eq!(
            bib.obter(&livro.id).unwrap().unwrap().favorito_em,
            Some(800)
        );
        // Abrir o livro não mexe no favorito (só em "para ler").
        bib.marcar_aberto(&livro.id).unwrap();
        assert_eq!(
            bib.obter(&livro.id).unwrap().unwrap().favorito_em,
            Some(800)
        );
        bib.definir_favorito(&livro.id, false).unwrap();
        assert_eq!(bib.obter(&livro.id).unwrap().unwrap().favorito_em, None);
        assert!(matches!(
            bib.definir_favorito("x", true),
            Err(ErroBiblioteca::NaoEncontrado(_))
        ));
    }

    #[test]
    fn lido_manual_vence_o_progresso_e_pode_ser_desfeito() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        let p = Progresso {
            localizacao: "epubcfi(/6/2)".into(),
            fracao: 0.3,
        };
        bib.salvar_progresso(&livro.id, &p).unwrap();
        bib.definir_para_ler(&livro.id, true).unwrap();

        bib.definir_lido(&livro.id, true).unwrap();
        let lido = bib.obter(&livro.id).unwrap().unwrap();
        assert_eq!(lido.situacao, Situacao::Concluido);
        assert!(lido.lido_em.is_some());
        assert_eq!(lido.para_ler_em, None, "lido sai de \"para ler\"");
        assert_eq!(lido.fracao, Some(0.3), "o progresso não é tocado");

        bib.definir_lido(&livro.id, false).unwrap();
        assert_eq!(
            bib.obter(&livro.id).unwrap().unwrap().situacao,
            Situacao::Lendo,
            "desmarcar volta à situação do progresso"
        );
    }

    #[test]
    fn situacao_com_lido_manual() {
        assert_eq!(Situacao::do_livro(None, true), Situacao::Concluido);
        assert_eq!(Situacao::do_livro(Some(0.1), true), Situacao::Concluido);
        assert_eq!(Situacao::do_livro(Some(0.1), false), Situacao::Lendo);
        assert_eq!(Situacao::do_livro(None, false), Situacao::NaoIniciado);
    }

    #[test]
    fn lixeira_tira_da_lista_e_restaura_sem_perder_nada() {
        let (_dir, mut bib) = nova();
        let livro = bib
            .importar(&fixture("dom-casmurro.epub"))
            .unwrap()
            .into_livro();
        let p = Progresso {
            localizacao: "epubcfi(/6/2)".into(),
            fracao: 0.3,
        };
        bib.salvar_progresso(&livro.id, &p).unwrap();

        bib.relogio = || 700;
        bib.mover_para_lixeira(&livro.id).unwrap();
        assert!(bib.listar().unwrap().is_empty());
        let lixeira = bib.listar_lixeira().unwrap();
        assert_eq!(lixeira.len(), 1);
        assert_eq!(lixeira[0].removido_em, Some(700));
        assert!(livro.arquivo.exists(), "na lixeira, a cópia continua");

        bib.restaurar(&livro.id).unwrap();
        assert!(bib.listar_lixeira().unwrap().is_empty());
        let de_volta = bib.listar().unwrap().pop().unwrap();
        assert_eq!(de_volta.removido_em, None);
        assert_eq!(
            bib.progresso(&livro.id).unwrap(),
            Some(p),
            "progresso intacto"
        );
    }

    #[test]
    fn esvaziar_lixeira_apaga_so_o_que_esta_nela() {
        let (_dir, bib) = nova();
        let fica = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        let vai = bib
            .importar(&fixture("dom-casmurro.epub"))
            .unwrap()
            .into_livro();
        bib.mover_para_lixeira(&vai.id).unwrap();

        assert_eq!(bib.esvaziar_lixeira().unwrap(), 1);
        assert!(bib.obter(&vai.id).unwrap().is_none());
        assert!(!vai.arquivo.exists(), "cópia apagada");
        assert_eq!(bib.listar().unwrap().len(), 1);
        assert!(fica.arquivo.exists());
        assert_eq!(
            bib.esvaziar_lixeira().unwrap(),
            0,
            "lixeira vazia: nada a fazer"
        );
    }

    #[test]
    fn importar_livro_que_esta_na_lixeira_o_restaura() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        bib.mover_para_lixeira(&livro.id).unwrap();

        let de_novo = bib.importar(&fixture("minimo.epub")).unwrap();
        assert!(matches!(de_novo, Importado::Restaurado(_)), "{de_novo:?}");
        assert_eq!(de_novo.livro().removido_em, None);
        assert_eq!(bib.listar().unwrap().len(), 1);
    }

    #[test]
    fn operacoes_em_livro_inexistente() {
        let (_dir, bib) = nova();
        let nao_encontrado = |r: Resultado<()>| matches!(r, Err(ErroBiblioteca::NaoEncontrado(_)));
        assert!(nao_encontrado(bib.definir_para_ler("x", true)));
        assert!(nao_encontrado(bib.definir_lido("x", true)));
        assert!(nao_encontrado(bib.mover_para_lixeira("x")));
        assert!(nao_encontrado(bib.restaurar("x")));
    }

    #[test]
    fn colecoes_criar_listar_renomear_apagar() {
        let (_dir, bib) = nova();
        let ficcao = bib.criar_colecao("  Ficção ").unwrap();
        assert_eq!(ficcao.nome, "Ficção", "o nome é aparado");
        let trabalho = bib.criar_colecao("Trabalho").unwrap();
        let nomes = |bib: &Biblioteca| -> Vec<String> {
            bib.listar_colecoes()
                .unwrap()
                .into_iter()
                .map(|c| c.nome)
                .collect()
        };
        assert_eq!(nomes(&bib), ["Ficção", "Trabalho"]);

        bib.renomear_colecao(trabalho.id, "Estudo").unwrap();
        assert_eq!(nomes(&bib), ["Estudo", "Ficção"], "em ordem alfabética");
        // Renomear para o mesmo nome com outra caixa é permitido.
        bib.renomear_colecao(ficcao.id, "FICÇÃO").unwrap();

        bib.apagar_colecao(trabalho.id).unwrap();
        assert_eq!(nomes(&bib), ["FICÇÃO"]);
    }

    #[test]
    fn nome_de_colecao_vazio_ou_repetido_e_recusado() {
        let (_dir, bib) = nova();
        let ficcao = bib.criar_colecao("Ficção").unwrap();
        let outra = bib.criar_colecao("Outra").unwrap();
        assert!(matches!(
            bib.criar_colecao("   "),
            Err(ErroBiblioteca::NomeDeColecaoVazio)
        ));
        // Repetido sem diferenciar maiúsculas (inclusive com acento).
        assert!(matches!(
            bib.criar_colecao("ficção"),
            Err(ErroBiblioteca::ColecaoJaExiste(nome)) if nome == "Ficção"
        ));
        assert!(matches!(
            bib.criar_colecao("FICÇÃO"),
            Err(ErroBiblioteca::ColecaoJaExiste(_))
        ));
        assert!(matches!(
            bib.renomear_colecao(outra.id, " ficção "),
            Err(ErroBiblioteca::ColecaoJaExiste(_))
        ));
        assert!(matches!(
            bib.renomear_colecao(ficcao.id, ""),
            Err(ErroBiblioteca::NomeDeColecaoVazio)
        ));
    }

    #[test]
    fn livros_entram_e_saem_de_colecoes() {
        let (_dir, bib) = nova();
        let a = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        let b = bib
            .importar(&fixture("dom-casmurro.epub"))
            .unwrap()
            .into_livro();
        let ficcao = bib.criar_colecao("Ficção").unwrap();
        let classicos = bib.criar_colecao("Clássicos").unwrap();

        bib.adicionar_a_colecao(ficcao.id, &a.id).unwrap();
        bib.adicionar_a_colecao(ficcao.id, &b.id).unwrap();
        bib.adicionar_a_colecao(ficcao.id, &b.id).unwrap(); // de novo: nada muda
        bib.adicionar_a_colecao(classicos.id, &b.id).unwrap();

        let colecoes_de = |id: &str| bib.obter(id).unwrap().unwrap().colecoes;
        assert_eq!(colecoes_de(&a.id), [ficcao.id]);
        let mut de_b = colecoes_de(&b.id);
        de_b.sort();
        assert_eq!(de_b, [ficcao.id, classicos.id]);

        let quantidade = |id: i64| {
            bib.listar_colecoes()
                .unwrap()
                .into_iter()
                .find(|c| c.id == id)
                .unwrap()
                .quantidade
        };
        assert_eq!(quantidade(ficcao.id), 2);

        bib.remover_da_colecao(ficcao.id, &a.id).unwrap();
        assert!(colecoes_de(&a.id).is_empty());
        assert_eq!(quantidade(ficcao.id), 1);

        // Na lixeira, o livro continua na coleção, mas não conta.
        bib.mover_para_lixeira(&b.id).unwrap();
        assert_eq!(quantidade(ficcao.id), 0);
        bib.restaurar(&b.id).unwrap();
        assert_eq!(quantidade(ficcao.id), 1);

        // Apagar a coleção não apaga os livros; apagar o livro de vez o tira das coleções.
        bib.apagar_colecao(classicos.id).unwrap();
        assert_eq!(colecoes_de(&b.id), [ficcao.id]);
        bib.apagar_de_vez(&b.id).unwrap();
        assert_eq!(quantidade(ficcao.id), 0);
    }

    #[test]
    fn colecao_ou_livro_inexistente() {
        let (_dir, bib) = nova();
        let livro = bib.importar(&fixture("minimo.epub")).unwrap().into_livro();
        let colecao = bib.criar_colecao("Ficção").unwrap();
        let sem_colecao =
            |r: Resultado<()>| matches!(r, Err(ErroBiblioteca::ColecaoNaoEncontrada(99)));
        assert!(sem_colecao(bib.renomear_colecao(99, "x")));
        assert!(sem_colecao(bib.apagar_colecao(99)));
        assert!(sem_colecao(bib.adicionar_a_colecao(99, &livro.id)));
        assert!(matches!(
            bib.adicionar_a_colecao(colecao.id, "nao-existe"),
            Err(ErroBiblioteca::NaoEncontrado(_))
        ));
    }

    #[test]
    fn reabrir_preserva_dados_e_nao_migra_de_novo() {
        let dir = tempfile::tempdir().unwrap();
        let (dados, capas) = (dir.path().join("dados"), dir.path().join("capas"));
        let id = Biblioteca::abrir(&dados, &capas)
            .unwrap()
            .importar(&fixture("minimo.epub"))
            .unwrap()
            .into_livro()
            .id;
        let bib = Biblioteca::abrir(&dados, &capas).unwrap();
        assert!(bib.obter(&id).unwrap().is_some());
    }
}
