import { describe, expect, it } from "vitest";
import type { Livro, Situacao } from "./biblioteca";
import { contarPorColecao, contarPorFiltro, filtrarLivros, normalizar } from "./filtro";

function livro(
  titulo: string,
  autores: string[],
  situacao: Situacao,
  paraLer = false,
  naLixeira = false,
  favorito = false,
): Livro {
  return {
    id: titulo,
    formato: "epub",
    titulo,
    autores,
    idioma: null,
    arquivo: "",
    capa: null,
    adicionadoEm: 0,
    abertoEm: null,
    fracao: situacao === "nao-iniciado" ? null : 0.5,
    situacao,
    paraLerEm: paraLer ? 1 : null,
    lidoEm: null,
    removidoEm: naLixeira ? 9 : null,
    favoritoEm: favorito ? 3 : null,
    colecoes: [],
  };
}

const estante = [
  livro("Dom Casmurro", ["Machado de Assis"], "lendo", false, false, true),
  livro("Memórias Póstumas de Brás Cubas", ["Machado de Assis"], "concluido"),
  livro("O Cortiço", ["Aluísio Azevedo"], "nao-iniciado", true),
  livro("The Rust Programming Language", ["Steve Klabnik", "Carol Nichols"], "lendo"),
  livro("Quincas Borba", ["Machado de Assis"], "lendo", false, true),
];
const titulos = (livros: Livro[]) => livros.map((l) => l.titulo);

describe("normalizar", () => {
  it("ignora acentos, maiúsculas e espaços nas pontas", () => {
    expect(normalizar("  Memórias PÓSTUMAS ")).toBe("memorias postumas");
    expect(normalizar("Aluísio")).toBe("aluisio");
  });
});

describe("filtrarLivros", () => {
  it("sem termo e em Todos, mostra tudo (menos a lixeira) na ordem original", () => {
    expect(titulos(filtrarLivros(estante, "", "todos"))).toEqual(titulos(estante.slice(0, 4)));
    expect(filtrarLivros(estante, "   ", "todos")).toHaveLength(4);
  });

  it("busca no título e nos autores, sem acentos nem maiúsculas", () => {
    expect(titulos(filtrarLivros(estante, "memorias", "todos"))).toEqual([
      "Memórias Póstumas de Brás Cubas",
    ]);
    expect(titulos(filtrarLivros(estante, "MACHADO", "todos"))).toEqual([
      "Dom Casmurro",
      "Memórias Póstumas de Brás Cubas",
    ]);
    expect(titulos(filtrarLivros(estante, "nichols", "todos"))).toEqual([
      "The Rust Programming Language",
    ]);
  });

  it("todas as palavras do termo precisam aparecer, em qualquer ordem", () => {
    expect(titulos(filtrarLivros(estante, "assis dom", "todos"))).toEqual(["Dom Casmurro"]);
    expect(filtrarLivros(estante, "dom azevedo", "todos")).toEqual([]);
  });

  it("cada estante mostra os seus livros e combina com a busca", () => {
    expect(titulos(filtrarLivros(estante, "", "lendo"))).toEqual([
      "Dom Casmurro",
      "The Rust Programming Language",
    ]);
    expect(titulos(filtrarLivros(estante, "", "para-ler"))).toEqual(["O Cortiço"]);
    expect(titulos(filtrarLivros(estante, "", "favoritos"))).toEqual(["Dom Casmurro"]);
    // A lixeira só aparece na estante dela.
    expect(titulos(filtrarLivros(estante, "", "lixeira"))).toEqual(["Quincas Borba"]);
    expect(titulos(filtrarLivros(estante, "quincas", "todos"))).toEqual([]);
    expect(titulos(filtrarLivros(estante, "", "lidos"))).toEqual([
      "Memórias Póstumas de Brás Cubas",
    ]);
    expect(titulos(filtrarLivros(estante, "machado", "lendo"))).toEqual(["Dom Casmurro"]);
  });
});

describe("coleções", () => {
  const colecionados = [
    { ...livro("Dom Casmurro", ["Machado de Assis"], "lendo"), colecoes: [1, 2] },
    { ...livro("O Cortiço", ["Aluísio Azevedo"], "nao-iniciado"), colecoes: [1] },
    { ...livro("Quincas Borba", ["Machado de Assis"], "lendo", false, true), colecoes: [1] },
  ];

  it("a estante de uma coleção mostra os livros dela, fora da lixeira, e combina com a busca", () => {
    expect(titulos(filtrarLivros(colecionados, "", "colecao:1"))).toEqual(["Dom Casmurro", "O Cortiço"]);
    expect(titulos(filtrarLivros(colecionados, "", "colecao:2"))).toEqual(["Dom Casmurro"]);
    expect(titulos(filtrarLivros(colecionados, "azevedo", "colecao:1"))).toEqual(["O Cortiço"]);
    expect(filtrarLivros(colecionados, "", "colecao:9")).toEqual([]);
  });

  it("conta os livros de cada coleção com a busca", () => {
    expect(contarPorColecao(colecionados, "", [1, 2, 3])).toEqual({ 1: 2, 2: 1, 3: 0 });
    expect(contarPorColecao(colecionados, "machado", [1, 2])).toEqual({ 1: 1, 2: 1 });
  });
});

describe("contarPorFiltro", () => {
  it("conta cada filtro respeitando a busca", () => {
    expect(contarPorFiltro(estante, "")).toEqual({
      todos: 4,
      favoritos: 1,
      lendo: 2,
      "para-ler": 1,
      lidos: 1,
      lixeira: 1,
    });
    expect(contarPorFiltro(estante, "machado")).toEqual({
      todos: 2,
      favoritos: 1,
      lendo: 1,
      "para-ler": 0,
      lidos: 1,
      lixeira: 1,
    });
  });
});
