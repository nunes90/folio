-- Folio v0.3.0: esquema na versão 5. Gerado por gerar.py; não editar.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;
CREATE TABLE colecoes (
        id        INTEGER PRIMARY KEY,
        nome      TEXT NOT NULL,       -- único sem diferenciar maiúsculas (verificado no Rust)
        criada_em INTEGER NOT NULL
    );
INSERT INTO "colecoes" VALUES(1,'Clássicos',1600);
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
    , para_ler_em INTEGER, lido_em     INTEGER, removido_em INTEGER, favorito_em INTEGER);
INSERT INTO "livros" VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','epub','Dom Casmurro','Machado de Assis','pt','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.epub','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',1000,2000,NULL,NULL,NULL,NULL);
INSERT INTO "livros" VALUES('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','pdf','Manual','Ana
Beto',NULL,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf',NULL,1500,NULL,1700,NULL,NULL,1800);
CREATE TABLE livros_colecoes (
        colecao_id    INTEGER NOT NULL REFERENCES colecoes(id) ON DELETE CASCADE,
        livro_id      TEXT    NOT NULL REFERENCES livros(id)   ON DELETE CASCADE,
        adicionado_em INTEGER NOT NULL,
        PRIMARY KEY (colecao_id, livro_id)
    );
INSERT INTO "livros_colecoes" VALUES(1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1601);
CREATE TABLE preferencias (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
    );
INSERT INTO "preferencias" VALUES('leitura','{"tamanho":1.3,"larguraMaxima":640,"tema":"escuro","paginaPdf":"creme"}');
CREATE TABLE progresso (
        livro_id      TEXT PRIMARY KEY REFERENCES livros(id) ON DELETE CASCADE,
        localizacao   TEXT NOT NULL,     -- EPUB CFI ou `pagina:N` (PDF)
        fracao        REAL NOT NULL,     -- 0.0 a 1.0
        atualizado_em INTEGER NOT NULL
    );
INSERT INTO "progresso" VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','epubcfi(/6/8!/4/2)',0.37,2000);
CREATE INDEX livros_colecoes_por_livro ON livros_colecoes (livro_id);
COMMIT;
PRAGMA user_version = 5;
