//! Um banco de cada versão publicada abre na versão de hoje sem perder nada (M33c).
//!
//! Os bancos em `tests/fixtures/bancos/` têm o esquema que cada versão criava, tirado do código
//! da própria tag (`gerar.py`), com alguns dados. Se uma migração já publicada for editada, ou
//! uma nova estragar o que já existia, é aqui que aparece: um erro de migração custa os dados de
//! quem usa o app.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use folio_core::biblioteca::Biblioteca;
use folio_core::destaques::{Cor, Motivo};
use folio_core::preferencias::{Pagina, Tema};
use rusqlite::Connection;

const EPUB: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PDF: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/// A primeira versão publicada com cada esquema.
const VERSOES: [&str; 5] = ["v0.1.0", "v0.3.0", "v0.6.0", "v0.7.0", "v0.8.0"];

fn banco_da_versao(versao: &str) -> String {
    let caminho = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures/bancos")
        .join(format!("{versao}.sql"));
    std::fs::read_to_string(caminho).expect("o banco da versão deve existir")
}

/// Monta a pasta de dados com o banco antigo e abre a biblioteca (o que roda as migrações).
fn abrir_com(sql: Option<&str>) -> (tempfile::TempDir, Biblioteca) {
    let dir = tempfile::tempdir().unwrap();
    let dados = dir.path().join("dados");
    std::fs::create_dir_all(&dados).unwrap();
    if let Some(sql) = sql {
        let antigo = Connection::open(dados.join("biblioteca.sqlite3")).unwrap();
        antigo.execute_batch(sql).unwrap();
    }
    let bib = Biblioteca::abrir(&dados, &dir.path().join("capas")).unwrap();
    (dir, bib)
}

/// O esquema como o SQLite o vê: as colunas de cada tabela e os índices, e a versão.
fn esquema(dados: &Path) -> (i64, BTreeMap<String, Vec<String>>) {
    let banco = Connection::open(dados.join("dados/biblioteca.sqlite3")).unwrap();
    let versao = banco
        .pragma_query_value(None, "user_version", |l| l.get(0))
        .unwrap();
    let nomes: Vec<(String, String)> = banco
        .prepare(
            "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .unwrap()
        .query_map([], |l| Ok((l.get(0)?, l.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    let mut tabelas = BTreeMap::new();
    for (tipo, nome) in nomes {
        let colunas = if tipo == "table" {
            banco
                .prepare(&format!("PRAGMA table_info({nome})"))
                .unwrap()
                .query_map([], |l| {
                    Ok(format!(
                        "{} {} notnull={} pk={}",
                        l.get::<_, String>(1)?,
                        l.get::<_, String>(2)?,
                        l.get::<_, i64>(3)?,
                        l.get::<_, i64>(5)?
                    ))
                })
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        } else {
            Vec::new()
        };
        tabelas.insert(format!("{tipo} {nome}"), colunas);
    }
    (versao, tabelas)
}

#[test]
fn todo_banco_antigo_chega_ao_esquema_de_hoje() {
    let (novo_dir, novo) = abrir_com(None);
    drop(novo);
    let de_hoje = esquema(novo_dir.path());
    for versao in VERSOES {
        let (dir, bib) = abrir_com(Some(&banco_da_versao(versao)));
        drop(bib);
        assert_eq!(
            esquema(dir.path()),
            de_hoje,
            "o banco da {versao} migrado difere de um novo"
        );
    }
}

#[test]
fn os_livros_e_o_progresso_sobrevivem() {
    for versao in VERSOES {
        let (_dir, bib) = abrir_com(Some(&banco_da_versao(versao)));
        let livros = bib.listar().unwrap();
        assert_eq!(livros.len(), 2, "{versao}");

        // Por atividade recente: o EPUB foi aberto por último.
        let epub = &livros[0];
        assert_eq!(
            (epub.id.as_str(), epub.titulo.as_str()),
            (EPUB, "Dom Casmurro"),
            "{versao}"
        );
        assert_eq!(epub.autores, ["Machado de Assis"], "{versao}");
        assert_eq!(epub.idioma.as_deref(), Some("pt"), "{versao}");
        assert_eq!(epub.aberto_em, Some(2000), "{versao}");
        assert_eq!(epub.fracao, Some(0.37), "{versao}");
        let progresso = bib.progresso(EPUB).unwrap().expect("o progresso sumiu");
        assert_eq!(progresso.localizacao, "epubcfi(/6/8!/4/2)", "{versao}");

        let pdf = &livros[1];
        assert_eq!(
            (pdf.id.as_str(), pdf.titulo.as_str()),
            (PDF, "Manual"),
            "{versao}"
        );
        assert_eq!(pdf.autores, ["Ana", "Beto"], "{versao}");
        assert_eq!(pdf.fracao, None, "{versao}");
    }
}

#[test]
fn o_que_cada_versao_ja_guardava_continua_la() {
    for (i, versao) in VERSOES.iter().enumerate() {
        let (_dir, bib) = abrir_com(Some(&banco_da_versao(versao)));
        let livros = bib.listar().unwrap();
        let (epub, pdf) = (&livros[0], &livros[1]);

        // v0.3: estantes, favoritos e coleções.
        if i >= 1 {
            assert_eq!(
                (pdf.favorito_em, pdf.para_ler_em),
                (Some(1800), Some(1700)),
                "{versao}"
            );
            let colecoes = bib.listar_colecoes().unwrap();
            assert_eq!(colecoes.len(), 1, "{versao}");
            assert_eq!(
                (colecoes[0].nome.as_str(), colecoes[0].quantidade),
                ("Clássicos", 1),
                "{versao}"
            );
            assert_eq!(epub.colecoes, [1], "{versao}");
        } else {
            assert!(bib.listar_colecoes().unwrap().is_empty(), "{versao}");
        }

        // v0.6: destaques; v0.7: o motivo.
        let destaques = bib.listar_destaques(EPUB).unwrap();
        if i >= 2 {
            assert_eq!(epub.destaques, 1, "{versao}");
            let d = &destaques[0];
            assert_eq!(
                (d.trecho.as_str(), d.cor),
                ("olhos de ressaca", Cor::Verde),
                "{versao}"
            );
            assert_eq!(d.nota.as_deref(), Some("a imagem do livro"), "{versao}");
            assert_eq!(d.motivo, (i >= 3).then_some(Motivo::Citar), "{versao}");
        } else {
            assert!(destaques.is_empty(), "{versao}");
        }

        // v0.8: sessões de leitura e trechos revisitados.
        let sessoes = bib.listar_sessoes(EPUB).unwrap();
        if i >= 4 {
            assert_eq!(sessoes.len(), 1, "{versao}");
            assert_eq!(
                (sessoes[0].ativo, sessoes[0].avanco),
                (840, 0.07),
                "{versao}"
            );
            let visitas = bib.trechos_revisitados(EPUB, 2).unwrap();
            assert_eq!(visitas.len(), 1, "{versao}");
        } else {
            assert!(sessoes.is_empty(), "{versao}");
        }
    }
}

#[test]
fn as_preferencias_antigas_sao_lidas() {
    // (tamanho, caracteres por linha = largura em px ÷ 8, tema, página)
    let esperado = [
        // O tema sépia virou página sépia sobre a interface clara.
        (1.2, 90, Tema::Claro, Pagina::Sepia),
        // `paginaPdf` virou `pagina`.
        (1.3, 80, Tema::Escuro, Pagina::Creme),
        (1.1, 100, Tema::Claro, Pagina::Sepia),
        (1.1, 100, Tema::Claro, Pagina::Sepia),
        (1.25, 90, Tema::Sistema, Pagina::Noite),
    ];
    for (versao, (tamanho, caracteres, tema, pagina)) in VERSOES.iter().zip(esperado) {
        let (_dir, bib) = abrir_com(Some(&banco_da_versao(versao)));
        let p = bib.preferencias_leitura().unwrap();
        assert_eq!(p.tamanho, tamanho, "{versao}");
        assert_eq!(p.caracteres_por_linha, caracteres, "{versao}");
        assert_eq!((p.tema, p.pagina), (tema, pagina), "{versao}");
    }
    let (_dir, bib) = abrir_com(Some(&banco_da_versao("v0.8.0")));
    assert!(bib.preferencias_leitura().unwrap().barras_so_pelo_teclado);
}
