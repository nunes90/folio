import { describe, expect, it } from "vitest";
import { aplicarAnimacao, CURVA_CSS, curva, curvaLinearCss, DURACOES } from "./animacao";

describe("curva (mola criticamente amortecida)", () => {
  it("vai de 0 a 1 exatamente", () => {
    expect(curva(0)).toBe(0);
    expect(curva(1)).toBe(1);
  });

  it("nunca passa do destino nem volta (sem quique)", () => {
    let anterior = 0;
    for (let i = 1; i <= 100; i++) {
      const v = curva(i / 100);
      expect(v).toBeGreaterThanOrEqual(anterior);
      expect(v).toBeLessThanOrEqual(1);
      anterior = v;
    }
  });

  it("é concentrada no começo: na metade do tempo já percorreu a maior parte", () => {
    expect(curva(0.25)).toBeGreaterThan(0.5);
    expect(curva(0.5)).toBeGreaterThan(0.9);
  });

  it("vira texto linear() com começo 0 e fim 1", () => {
    const css = curvaLinearCss(4);
    expect(css).toMatch(/^linear\(0, [\d.]+, [\d.]+, [\d.]+, 1\)$/);
  });
});

describe("aplicarAnimacao", () => {
  it("define as durações e a curva como variáveis CSS", () => {
    const raiz = document.createElement("div");
    aplicarAnimacao(false, raiz);
    expect(raiz.style.getPropertyValue("--duracao-media")).toBe(`${DURACOES.media}ms`);
    expect(raiz.style.getPropertyValue("--curva")).toBe(CURVA_CSS);
  });

  it("com movimento reduzido, todas as durações viram 0", () => {
    const raiz = document.createElement("div");
    aplicarAnimacao(true, raiz);
    for (const nome of Object.keys(DURACOES)) {
      expect(raiz.style.getPropertyValue(`--duracao-${nome}`)).toBe("0ms");
    }
  });
});
