import { describe, expect, it } from "vitest";
import { achatar, converterSumario, itemAtual, type ItemSumarioPdf } from "./sumario";

const item = (title: string, dest: ItemSumarioPdf["dest"], items: ItemSumarioPdf[] = []) => ({
  title,
  dest,
  items,
});

describe("converterSumario", () => {
  it("converte o sumário aninhado e guarda o destino de cada item", () => {
    const { itens, destinos } = converterSumario([
      item("Introdução", "intro"),
      item("Capítulo 1", [{ num: 5 }, { name: "XYZ" }], [item("Seção 1.1", "s11")]),
    ]);
    expect(itens).toEqual([
      { label: "Introdução", href: "pdf-0" },
      {
        label: "Capítulo 1",
        href: "pdf-1",
        subitems: [{ label: "Seção 1.1", href: "pdf-2" }],
      },
    ]);
    expect(destinos.get("pdf-0")).toBe("intro");
    expect(destinos.get("pdf-2")).toBe("s11");
  });

  it("descarta itens sem destino, mas mantém os filhos deles", () => {
    const { itens } = converterSumario([item("Site", null, [item("Parte", "p")])]);
    expect(itens).toEqual([{ label: "Parte", href: "pdf-0" }]);
  });

  it("PDF sem sumário vira lista vazia", () => {
    expect(converterSumario(null).itens).toEqual([]);
  });
});

describe("itemAtual", () => {
  const paginas = new Map([
    ["a", 1],
    ["b", 5],
    ["b1", 5],
    ["c", 9],
  ]);

  it("escolhe o item de maior página que não passa da atual", () => {
    expect(itemAtual(paginas, 7)).toBe("b1");
    expect(itemAtual(paginas, 9)).toBe("c");
    expect(itemAtual(paginas, 100)).toBe("c");
  });

  it("antes do primeiro item não há item atual", () => {
    expect(itemAtual(new Map([["a", 3]]), 2)).toBeUndefined();
  });
});

describe("achatar", () => {
  it("lista os itens em ordem de leitura", () => {
    const itens = [{ label: "A", href: "a", subitems: [{ label: "A1", href: "a1" }] }, { label: "B", href: "b" }];
    expect(achatar(itens).map((i) => i.href)).toEqual(["a", "a1", "b"]);
  });
});
