import { describe, expect, it, vi } from "vitest";
import {
  fracoesDasAncoras,
  irParaFracao,
  passoGrande,
  rotuloNoPonto,
  textoDaFracao,
  textoDaPagina,
  valorPelaTecla,
} from "./posicao";

describe("posição no livro", () => {
  it("rótulo do índice no ponto: o de maior posição até ali; empate, o último", () => {
    const itens = [
      { label: "Capa", href: "a" },
      {
        label: " Parte I ",
        href: "b",
        subitems: [
          { label: "Capítulo 1", href: "c" },
          { label: "Capítulo 2", href: "d" },
        ],
      },
      { label: "Sem lugar", href: "x" },
    ];
    const posicoes = new Map([
      ["a", 0],
      ["b", 2],
      ["c", 2],
      ["d", 5],
    ]);
    expect(rotuloNoPonto(itens, posicoes, 1)).toBe("Capa");
    expect(rotuloNoPonto(itens, posicoes, 3)).toBe("Capítulo 1");
    expect(rotuloNoPonto(itens, posicoes, 9)).toBe("Capítulo 2");
    expect(rotuloNoPonto([], posicoes, 9)).toBeUndefined();
  });

  it("onde cada âncora cai no texto do documento", () => {
    const doc = new DOMParser().parseFromString(
      `<html><body><h2 id="a">Um</h2><p>abcdef</p><h2 id="b">Dois</h2><p>ghij<a id="c"></a></p></body></html>`,
      "text/html",
    );
    // "Um" (2) + "abcdef" (6) + "Dois" (4) + "ghij" (4) = 16 letras.
    const [a, b, c] = ["a", "b", "c"].map((id) => doc.getElementById(id)!);
    const fora = new DOMParser().parseFromString("<p>x</p>", "text/html").body;
    expect(fracoesDasAncoras(doc, [b, a, c, fora])).toEqual([8 / 16, 0, 1, 0]);
  });

  it("textos", () => {
    expect(textoDaFracao(0.123, "Capítulo 3")).toBe("12% · Capítulo 3");
    expect(textoDaFracao(1.2)).toBe("100%");
    expect(textoDaPagina(42, 300, "Capítulo 3")).toBe(
      "Página 42 de 300 · Capítulo 3",
    );
    expect(textoDaPagina(1, 3)).toBe("Página 1 de 3");
  });

  it("teclas", () => {
    const l = {
      min: 0,
      max: 1000,
      passo: 10,
      grande: passoGrande(0, 1000, 10),
    };
    expect(l.grande).toBe(100);
    expect(valorPelaTecla("ArrowRight", 500, l)).toBe(510);
    expect(valorPelaTecla("ArrowDown", 5, l)).toBe(0);
    expect(valorPelaTecla("PageUp", 950, l)).toBe(1000);
    expect(valorPelaTecla("Home", 500, l)).toBe(0);
    expect(valorPelaTecla("End", 500, l)).toBe(1000);
    expect(valorPelaTecla("ArrowRight", 500, { ...l, rtl: true })).toBe(490);
    expect(valorPelaTecla("a", 500, l)).toBeNull();
    // PDF de 7 páginas: o passo grande é 1 página.
    expect(passoGrande(1, 7, 1)).toBe(1);
    expect(passoGrande(1, 301, 1)).toBe(30);
  });
});

describe("irParaFracao", () => {
  it("tenta de novo se o paginador ignorou o pedido (logo depois de uma virada)", async () => {
    vi.useFakeTimers();
    let lugar = 0;
    let ignorar = 1;
    const view = {
      goToFraction: vi.fn(async () => {
        if (ignorar-- > 0) return;
        lugar++;
      }),
    };
    const indo = irParaFracao(view, 0.5, () => lugar);
    await vi.advanceTimersByTimeAsync(200);
    await indo;
    expect(view.goToFraction).toHaveBeenCalledTimes(2);
    expect(lugar).toBe(1);
    vi.useRealTimers();
  });

  it("não insiste se o livro já está ali (nada muda): desiste depois de algumas tentativas", async () => {
    vi.useFakeTimers();
    const view = { goToFraction: vi.fn(async () => {}) };
    const indo = irParaFracao(view, 0.5, () => 0);
    await vi.advanceTimersByTimeAsync(1000);
    await indo;
    expect(view.goToFraction).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
