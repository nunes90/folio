import { describe, expect, it } from "vitest";
import { agruparPorAutor, SEM_AUTOR } from "./autores";
import type { Livro } from "./biblioteca";
import { filtrarLivros } from "./filtro";

function livro(titulo: string, autores: string[], naLixeira = false): Livro {
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
    fracao: null,
    situacao: "nao-iniciado",
    paraLerEm: null,
    lidoEm: null,
    removidoEm: naLixeira ? 1 : null,
    favoritoEm: null,
    colecoes: [],
    destaques: 0,
  };
}

const estante = [
  livro("Dom Casmurro", ["Machado de Assis"]),
  livro("Quincas Borba", ["machado de assís"]),
  livro("O Cortiço", ["Aluísio Azevedo"]),
  livro("The Rust Programming Language", ["Steve Klabnik", "Carol Nichols"]),
  livro("Manual sem autor", []),
  livro("Esaú e Jacó", ["Machado de Assis"], true),
];

describe("agruparPorAutor", () => {
  it("um autor por nome (sem diferenciar acentos nem maiúsculas), em ordem alfabética", () => {
    expect(agruparPorAutor(estante)).toEqual([
      { chave: "aluisio azevedo", nome: "Aluísio Azevedo", quantidade: 1 },
      { chave: "carol nichols", nome: "Carol Nichols", quantidade: 1 },
      { chave: "machado de assis", nome: "Machado de Assis", quantidade: 2 },
      { chave: "steve klabnik", nome: "Steve Klabnik", quantidade: 1 },
      { chave: "", nome: SEM_AUTOR, quantidade: 1 },
    ]);
  });

  it("a lixeira não entra; a busca filtra pelo nome do autor", () => {
    expect(agruparPorAutor(estante, "machado")).toEqual([
      { chave: "machado de assis", nome: "Machado de Assis", quantidade: 2 },
    ]);
    expect(agruparPorAutor(estante, "AZEVEDO").map((a) => a.nome)).toEqual(["Aluísio Azevedo"]);
  });
});

describe("filtrarLivros por autor", () => {
  const titulos = (livros: Livro[]) => livros.map((l) => l.titulo);

  it("mostra os livros do autor (qualquer grafia), fora da lixeira", () => {
    expect(titulos(filtrarLivros(estante, "", "autor:machado de assis"))).toEqual([
      "Dom Casmurro",
      "Quincas Borba",
    ]);
    expect(titulos(filtrarLivros(estante, "", "autor:carol nichols"))).toEqual([
      "The Rust Programming Language",
    ]);
    expect(titulos(filtrarLivros(estante, "", "autor:"))).toEqual(["Manual sem autor"]);
    expect(titulos(filtrarLivros(estante, "quincas", "autor:machado de assis"))).toEqual([
      "Quincas Borba",
    ]);
  });

  it("a vista da lista de autores não mostra livros", () => {
    expect(filtrarLivros(estante, "", "autores")).toEqual([]);
  });
});
