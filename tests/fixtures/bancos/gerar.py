#!/usr/bin/env python3
"""Gera um banco de exemplo com o esquema de cada versão publicada do Folio (M33c).

As migrações vêm do código de cada tag (`git show <tag>:crates/core/src/biblioteca.rs`), não do
código de hoje: se alguém editar uma migração já publicada, o teste `migracoes.rs` passa a falhar
com o banco antigo. Cada banco sai como um `.sql` (texto, bom de revisar), com alguns dados do que
a versão já guardava.

Uso (da raiz do repositório, com as tags no clone): python3 tests/fixtures/bancos/gerar.py
"""
import re
import sqlite3
import subprocess
from pathlib import Path

AQUI = Path(__file__).parent

# A primeira versão publicada com cada esquema, e as preferências como ela as gravava.
VERSOES = {
    "v0.1.0": '{"fonte":"literata","tamanho":1.2,"larguraMaxima":720,"tema":"sepia"}',
    "v0.3.0": '{"tamanho":1.3,"larguraMaxima":640,"tema":"escuro","paginaPdf":"creme"}',
    "v0.6.0": '{"tamanho":1.1,"larguraMaxima":800,"tema":"claro","pagina":"sepia"}',
    "v0.7.0": '{"tamanho":1.1,"larguraMaxima":800,"tema":"claro","pagina":"sepia"}',
    "v0.8.0": '{"tamanho":1.25,"larguraMaxima":720,"pagina":"noite","barrasSoPeloTeclado":true}',
}

EPUB = "a" * 64
PDF = "b" * 64


def migracoes_da_tag(tag: str) -> list[str]:
    fonte = subprocess.run(
        ["git", "show", f"{tag}:crates/core/src/biblioteca.rs"], check=True, capture_output=True, text=True
    ).stdout
    lista = fonte[fonte.index("const MIGRACOES") :]
    lista = lista[: lista.index("\n];")]
    # Cada migração é um literal de texto do Rust; só `\"` precisa ser desfeito.
    return [m.replace('\\"', '"') for m in re.findall(r'"((?:[^"\\]|\\.)*)"', lista, flags=re.S)]


def tabelas(banco: sqlite3.Connection) -> set[str]:
    return {nome for (nome,) in banco.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def colunas(banco: sqlite3.Connection, tabela: str) -> set[str]:
    return {linha[1] for linha in banco.execute(f"PRAGMA table_info({tabela})")}


def dados(banco: sqlite3.Connection, preferencias: str) -> None:
    banco.execute(
        "INSERT INTO livros (id, formato, titulo, autores, idioma, arquivo, capa, adicionado_em, aberto_em) "
        "VALUES (?, 'epub', 'Dom Casmurro', 'Machado de Assis', 'pt', ?, ?, 1000, 2000)",
        (EPUB, f"{EPUB}.epub", f"{EPUB}.jpg"),
    )
    banco.execute(
        "INSERT INTO livros (id, formato, titulo, autores, idioma, arquivo, capa, adicionado_em, aberto_em) "
        "VALUES (?, 'pdf', 'Manual', 'Ana\nBeto', NULL, ?, NULL, 1500, NULL)",
        (PDF, f"{PDF}.pdf"),
    )
    banco.execute(
        "INSERT INTO progresso (livro_id, localizacao, fracao, atualizado_em) VALUES (?, 'epubcfi(/6/8!/4/2)', 0.37, 2000)",
        (EPUB,),
    )
    banco.execute("INSERT INTO preferencias (chave, valor) VALUES ('leitura', ?)", (preferencias,))
    if "favorito_em" in colunas(banco, "livros"):
        banco.execute("UPDATE livros SET favorito_em = 1800, para_ler_em = 1700 WHERE id = ?", (PDF,))
    if "colecoes" in tabelas(banco):
        banco.execute("INSERT INTO colecoes (id, nome, criada_em) VALUES (1, 'Clássicos', 1600)")
        banco.execute("INSERT INTO livros_colecoes (colecao_id, livro_id, adicionado_em) VALUES (1, ?, 1601)", (EPUB,))
    if "destaques" in tabelas(banco):
        banco.execute(
            "INSERT INTO destaques (id, livro_id, local, trecho, cor, nota, capitulo, posicao, criado_em, atualizado_em) "
            "VALUES (1, ?, 'epubcfi(/6/8!/4/2,/1:0,/1:20)', 'olhos de ressaca', 'verde', 'a imagem do livro', "
            "'XXXII', 0.3, 2100, 2100)",
            (EPUB,),
        )
        if "motivo" in colunas(banco, "destaques"):
            banco.execute("UPDATE destaques SET motivo = 'citar' WHERE id = 1")
    if "sessoes" in tabelas(banco):
        banco.execute(
            "INSERT INTO sessoes (id, livro_id, inicio, fim, ativo, de_local, de_fracao, ate_local, ate_fracao, avanco) "
            "VALUES (1, ?, 3000, 3900, 840, 'epubcfi(/6/6!/4/2)', 0.30, 'epubcfi(/6/8!/4/2)', 0.37, 0.07)",
            (EPUB,),
        )
    if "visitas" in tabelas(banco):
        banco.execute(
            "INSERT INTO visitas (livro_id, trecho, rotulo, local, voltas, primeira, ultima_volta) "
            "VALUES (?, 3, 'Capítulo 3', 'secao:3', 2, 2500, 3500)",
            (EPUB,),
        )


for tag, preferencias in VERSOES.items():
    migracoes = migracoes_da_tag(tag)
    banco = sqlite3.connect(":memory:")
    for sql in migracoes:
        banco.executescript(sql)
    dados(banco, preferencias)
    banco.commit()
    linhas = [f"-- Folio {tag}: esquema na versão {len(migracoes)}. Gerado por gerar.py; não editar."]
    # Como o `.dump` do sqlite3: as tabelas saem em ordem alfabética, e `destaques` vem antes de `livros`.
    linhas.append("PRAGMA foreign_keys = OFF;")
    linhas += list(banco.iterdump())
    linhas.append(f"PRAGMA user_version = {len(migracoes)};")
    (AQUI / f"{tag}.sql").write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(tag, "esquema", len(migracoes))
