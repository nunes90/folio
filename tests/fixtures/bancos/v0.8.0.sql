-- Folio v0.8.0: esquema na versão 11. Gerado por gerar.py; não editar.
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;
CREATE TABLE colecoes (
        id        INTEGER PRIMARY KEY,
        nome      TEXT NOT NULL,       -- único sem diferenciar maiúsculas (verificado no Rust)
        criada_em INTEGER NOT NULL
    );
INSERT INTO "colecoes" VALUES(1,'Clássicos',1600);
CREATE TABLE destaques (
        id            INTEGER PRIMARY KEY,
        livro_id      TEXT    NOT NULL REFERENCES livros(id) ON DELETE CASCADE,
        local         TEXT    NOT NULL,  -- EPUB: CFI de intervalo
        trecho        TEXT    NOT NULL,
        cor           TEXT    NOT NULL,  -- amarelo | verde | azul | rosa
        nota          TEXT,
        capitulo      TEXT,              -- título da seção no índice
        posicao       REAL    NOT NULL,  -- 0.0 a 1.0 no livro: a ordem de leitura
        criado_em     INTEGER NOT NULL,
        atualizado_em INTEGER NOT NULL
    , motivo TEXT);
INSERT INTO "destaques" VALUES(1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','epubcfi(/6/8!/4/2,/1:0,/1:20)','olhos de ressaca','verde','a imagem do livro','XXXII',0.3,2100,2100,'citar');
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
INSERT INTO "preferencias" VALUES('leitura','{"tamanho":1.25,"larguraMaxima":720,"pagina":"noite","barrasSoPeloTeclado":true}');
CREATE TABLE progresso (
        livro_id      TEXT PRIMARY KEY REFERENCES livros(id) ON DELETE CASCADE,
        localizacao   TEXT NOT NULL,     -- EPUB CFI ou `pagina:N` (PDF)
        fracao        REAL NOT NULL,     -- 0.0 a 1.0
        atualizado_em INTEGER NOT NULL
    );
INSERT INTO "progresso" VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','epubcfi(/6/8!/4/2)',0.37,2000);
CREATE TABLE sessoes (
        id         INTEGER PRIMARY KEY,
        livro_id   TEXT    NOT NULL REFERENCES livros(id) ON DELETE CASCADE,
        inicio     INTEGER NOT NULL,  -- segundos desde 1970 (UTC)
        fim        INTEGER NOT NULL,  -- o último aviso
        ativo      INTEGER NOT NULL,  -- segundos lendo, sem as pausas longas
        de_local   TEXT    NOT NULL,  -- EPUB CFI ou `pagina:N` (PDF), ao abrir
        de_fracao  REAL    NOT NULL,
        ate_local  TEXT    NOT NULL,  -- onde está agora
        ate_fracao REAL    NOT NULL
    , avanco REAL NOT NULL DEFAULT 0, movido_em INTEGER);
INSERT INTO "sessoes" VALUES(1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',3000,3900,840,'epubcfi(/6/6!/4/2)',0.3,'epubcfi(/6/8!/4/2)',0.37,0.07,NULL);
CREATE TABLE visitas (
        livro_id     TEXT    NOT NULL REFERENCES livros(id) ON DELETE CASCADE,
        trecho       INTEGER NOT NULL,  -- a ordem do trecho no livro (o leitor decide o que é um trecho)
        rotulo       TEXT    NOT NULL,
        local        TEXT    NOT NULL,  -- para onde ir (ex.: secao:3, pagina:41)
        voltas       INTEGER NOT NULL,
        primeira     INTEGER NOT NULL,  -- primeira visita (segundos desde 1970, UTC)
        ultima_volta INTEGER,
        PRIMARY KEY (livro_id, trecho)
    );
INSERT INTO "visitas" VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',3,'Capítulo 3','secao:3',2,2500,3500);
CREATE INDEX livros_colecoes_por_livro ON livros_colecoes (livro_id);
CREATE INDEX destaques_por_livro ON destaques (livro_id, posicao);
CREATE INDEX sessoes_por_livro ON sessoes (livro_id, inicio);
COMMIT;
PRAGMA user_version = 11;
