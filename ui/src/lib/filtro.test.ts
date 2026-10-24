import { describe, expect, it } from "vitest";
import type { Livro, Situacao } from "./biblioteca";
import { contarPorFiltro, filtrarLivros, normalizar } from "./filtro";

function livro(titulo: string, autores: string[], situacao: Situacao): Livro {
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
    paraLerEm: null,
    lidoEm: null,
    removidoEm: null,
  };
}

const estante = [
  livro("Dom Casmurro", ["Machado de Assis"], "lendo"),
  livro("Memórias Póstumas de Brás Cubas", ["Machado de Assis"], "concluido"),
  livro("O Cortiço", ["Aluísio Azevedo"], "nao-iniciado"),
  livro("The Rust Programming Language", ["Steve Klabnik", "Carol Nichols"], "lendo"),
];
const titulos = (livros: Livro[]) => livros.map((l) => l.titulo);

describe("normalizar", () => {
  it("ignora acentos, maiúsculas e espaços nas pontas", () => {
    expect(normalizar("  Memórias PÓSTUMAS ")).toBe("memorias postumas");
    expect(normalizar("Aluísio")).toBe("aluisio");
  });
});

describe("filtrarLivros", () => {
  it("sem termo e em Todos, mostra tudo na ordem original", () => {
    expect(titulos(filtrarLivros(estante, "", "todos"))).toEqual(titulos(estante));
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

  it("filtra pela situação e combina com a busca", () => {
    expect(titulos(filtrarLivros(estante, "", "lendo"))).toEqual([
      "Dom Casmurro",
      "The Rust Programming Language",
    ]);
    expect(titulos(filtrarLivros(estante, "", "concluidos"))).toEqual([
      "Memórias Póstumas de Brás Cubas",
    ]);
    expect(titulos(filtrarLivros(estante, "machado", "lendo"))).toEqual(["Dom Casmurro"]);
  });
});

describe("contarPorFiltro", () => {
  it("conta cada filtro respeitando a busca", () => {
    expect(contarPorFiltro(estante, "")).toEqual({ todos: 4, lendo: 2, concluidos: 1 });
    expect(contarPorFiltro(estante, "machado")).toEqual({ todos: 2, lendo: 1, concluidos: 1 });
  });
});
