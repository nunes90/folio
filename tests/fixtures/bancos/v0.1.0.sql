-- Folio v0.1.0: esquema na versão 2. Gerado por gerar.py; não editar.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;
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
INSERT INTO "livros" VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','epub','Dom Casmurro','Machado de Assis','pt','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.epub','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',1000,2000);
INSERT INTO "livros" VALUES('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','pdf','Manual','Ana
Beto',NULL,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf',NULL,1500,NULL);
CREATE TABLE preferencias (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
    );
INSERT INTO "preferencias" VALUES('leitura','{"fonte":"literata","tamanho":1.2,"larguraMaxima":720,"tema":"sepia"}');
CREATE TABLE progresso (
        livro_id      TEXT PRIMARY KEY REFERENCES livros(id) ON DELETE CASCADE,
        localizacao   TEXT NOT NULL,     -- EPUB CFI ou `pagina:N` (PDF)
        fracao        REAL NOT NULL,     -- 0.0 a 1.0
        atualizado_em INTEGER NOT NULL
    );
INSERT INTO "progresso" VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','epubcfi(/6/8!/4/2)',0.37,2000);
COMMIT;
PRAGMA user_version = 2;
