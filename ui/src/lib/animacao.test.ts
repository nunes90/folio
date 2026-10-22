import { describe, expect, it } from "vitest";
import { aplicarAnimacao, CURVA_CSS, DURACOES } from "./animacao";

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
