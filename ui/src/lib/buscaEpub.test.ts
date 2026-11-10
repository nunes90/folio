import { describe, expect, it } from "vitest";
import { mesmoTermo, ocorrenciasDoPasso, primeiraDesde, textoDaBusca, vizinha } from "./buscaEpub";

describe("ocorrenciasDoPasso", () => {
  it("junta as de uma seção, com o texto em volta numa linha", () => {
    expect(
      ocorrenciasDoPasso({
        label: "Capítulo 1",
        subitems: [
          { cfi: "a", excerpt: { pre: "olhos de ", match: "ressaca", post: ".\n  Vá" } },
          { cfi: "b", excerpt: { match: "Ressaca" } },
        ],
      }),
    ).toEqual([
      { cfi: "a", trecho: "olhos de ressaca. Vá" },
      { cfi: "b", trecho: "Ressaca" },
    ]);
  });

  it("aceita uma ocorrência solta e ignora o andamento e o fim", () => {
    expect(ocorrenciasDoPasso({ cfi: "a", excerpt: { match: "x" } })).toEqual([{ cfi: "a", trecho: "x" }]);
    expect(ocorrenciasDoPasso({ progress: 0.5 })).toEqual([]);
    expect(ocorrenciasDoPasso("done")).toEqual([]);
  });
});

describe("primeiraDesde", () => {
  const lista = ["10", "20", "30"].map((cfi) => ({ cfi, trecho: "" }));
  const comparar = (a: string, b: string) => Number(a) - Number(b);

  it("começa na primeira a partir de onde se está", () => {
    expect(primeiraDesde(lista, "15", comparar)).toBe(1);
    expect(primeiraDesde(lista, "20", comparar)).toBe(1);
    expect(primeiraDesde(lista, "5", comparar)).toBe(0);
  });

  it("depois da última, ou sem saber onde se está, volta ao começo", () => {
    expect(primeiraDesde(lista, "99", comparar)).toBe(0);
    expect(primeiraDesde(lista, undefined, comparar)).toBe(0);
  });

  it("um CFI que não se compara não derruba a busca", () => {
    const quebra = () => {
      throw new Error("CFI inválido");
    };
    expect(primeiraDesde(lista, "15", quebra)).toBe(0);
  });
});

describe("vizinha", () => {
  it("anda e dá a volta nas pontas", () => {
    expect(vizinha(0, 3, false)).toBe(1);
    expect(vizinha(2, 3, false)).toBe(0);
    expect(vizinha(0, 3, true)).toBe(2);
    expect(vizinha(0, 1, false)).toBe(0);
    expect(vizinha(0, 0, false)).toBe(-1);
  });
});

describe("mesmoTermo e textoDaBusca", () => {
  it("espaços e maiúsculas não mudam a busca", () => {
    expect(mesmoTermo(" Capitu", "capitu ")).toBe(true);
    expect(mesmoTermo("Capitu", "Bentinho")).toBe(false);
  });

  it("diz o resultado como no PDF", () => {
    expect(textoDaBusca({ buscando: true, atual: -1, total: 0 })).toBe("Buscando…");
    expect(textoDaBusca({ buscando: false, atual: -1, total: 0 })).toBe("Nada encontrado");
    expect(textoDaBusca({ buscando: false, atual: 2, total: 12 })).toBe("3 de 12");
  });
});
