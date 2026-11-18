import { describe, expect, it } from "vitest";
import type { Destaque, Livro } from "./biblioteca";
import { agruparDestaques, localParaAbrir, resumoDaEstante } from "./todosOsDestaques";

function livro(id: string, titulo: string, parcial: Partial<Livro> = {}): Livro {
  return {
    id,
    formato: "epub",
    titulo,
    autores: ["Machado de Assis"],
    idioma: null,
    arquivo: "",
    capa: null,
    adicionadoEm: 0,
    abertoEm: null,
    fracao: null,
    situacao: "lendo",
    paraLerEm: null,
    lidoEm: null,
    removidoEm: null,
    favoritoEm: null,
    colecoes: [],
    destaques: 0,
    ...parcial,
  };
}

function destaque(id: number, livroId: string, trecho: string, parcial: Partial<Destaque> = {}): Destaque {
  return {
    id,
    livroId,
    local: `epubcfi(/6/4!/4/2,/1:0,/1:${id})`,
    trecho,
    cor: "amarelo",
    motivo: null,
    nota: null,
    capitulo: null,
    posicao: id / 10,
    criadoEm: 0,
    atualizadoEm: 0,
    ...parcial,
  };
}

const livros = [livro("dc", "Dom Casmurro"), livro("al", "O alienista"), livro("ba", "Às avessas")];
const destaques = [
  destaque(1, "dc", "Capitu tinha os olhos de ressaca", { motivo: "citar", capitulo: "XXXII" }),
  destaque(2, "dc", "olhos de cigana oblíqua e dissimulada", { nota: "comparar com o cap. XXV" }),
  destaque(3, "al", "A ciência é o meu emprego único", { motivo: "duvida" }),
  destaque(4, "ba", "um trecho qualquer"),
  destaque(5, "sumiu", "de um livro que não está mais na lista"),
];

describe("agruparDestaques", () => {
  it("agrupa por livro, em ordem alfabética do título (com acentos), e mantém a ordem de leitura", () => {
    const grupos = agruparDestaques(destaques, livros, "", null);
    expect(grupos.map((g) => g.livro.titulo)).toEqual(["Às avessas", "Dom Casmurro", "O alienista"]);
    expect(grupos[1]!.destaques.map((d) => d.id)).toEqual([1, 2]);
  });

  it("a busca procura no trecho, na nota, no capítulo e no título do livro, sem acentos", () => {
    const ids = (termo: string) => agruparDestaques(destaques, livros, termo, null).flatMap((g) => g.destaques.map((d) => d.id));
    expect(ids("olhos")).toEqual([1, 2]);
    expect(ids("comparar")).toEqual([2]);
    expect(ids("xxxii")).toEqual([1]);
    expect(ids("alienista")).toEqual([3]);
    expect(ids("ciencia emprego")).toEqual([3]);
    expect(ids("nada disso")).toEqual([]);
  });

  it("filtra por motivo", () => {
    const grupos = agruparDestaques(destaques, livros, "", "duvida");
    expect(grupos.map((g) => g.livro.id)).toEqual(["al"]);
  });

  it("um livro na lixeira (ou fora da lista) não aparece", () => {
    const naLixeira = [livros[0]!, { ...livros[1]!, removidoEm: 5 }];
    const grupos = agruparDestaques(destaques, naLixeira, "", null);
    expect(grupos.map((g) => g.livro.id)).toEqual(["dc"]);
  });
});

describe("localParaAbrir", () => {
  it("EPUB: o próprio CFI; PDF: a página do destaque", () => {
    expect(localParaAbrir(destaque(1, "dc", "x"), "epub")).toBe("epubcfi(/6/4!/4/2,/1:0,/1:1)");
    expect(localParaAbrir(destaque(1, "p", "x", { local: "pdf:7:0.1,0.2,0.3,0.4" }), "pdf")).toBe("pagina:7");
    expect(localParaAbrir(destaque(1, "p", "x", { local: "lixo" }), "pdf")).toBeUndefined();
  });
});

describe("resumoDaEstante", () => {
  it("conta destaques e livros, para o leitor de tela", () => {
    expect(resumoDaEstante(agruparDestaques(destaques, livros, "", null))).toBe("4 destaques em 3 livros");
    expect(resumoDaEstante(agruparDestaques(destaques, livros, "comparar", null))).toBe("1 destaque em 1 livro");
    expect(resumoDaEstante([])).toBe("Nenhum destaque");
  });
});
