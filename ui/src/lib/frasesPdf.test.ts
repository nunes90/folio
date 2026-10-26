import { describe, expect, it } from "vitest";
import { agruparEmLinhas, frasesDaCamada, quebrasDeBloco, textoDoTrecho } from "./frasesPdf";

describe("agruparEmLinhas", () => {
  it("pedaços com o meio na mesma faixa formam uma linha", () => {
    const caixas = [
      { top: 100, height: 12 },
      { top: 101, height: 11 }, // mesma linha, um pouco desalinhado
      { top: 120, height: 12 },
      { top: 121, height: 12 },
    ];
    expect(agruparEmLinhas(caixas)).toEqual([[0, 1], [2, 3]]);
  });
});

describe("quebrasDeBloco", () => {
  it("espaço maior que meia linha começa um bloco", () => {
    const linhas = [
      { top: 100, height: 12 },
      { top: 115, height: 12 }, // espaço de 3: mesmo parágrafo
      { top: 140, height: 12 }, // espaço de 13: parágrafo novo
      { top: 155, height: 12 },
    ];
    expect(quebrasDeBloco(linhas)).toEqual([0, 2]);
  });

  it("mudança de tamanho da letra (título ↔ texto) começa um bloco", () => {
    const linhas = [
      { top: 100, height: 24 }, // título
      { top: 126, height: 12 }, // texto logo abaixo
      { top: 140, height: 12 },
    ];
    expect(quebrasDeBloco(linhas)).toEqual([0, 1]);
  });

  it("sem linhas, sem blocos", () => {
    expect(quebrasDeBloco([])).toEqual([]);
  });
});

describe("frasesDaCamada", () => {
  it("divide em frases o texto dos pedaços (sem caixas, como no jsdom: um bloco só)", () => {
    const camada = document.createElement("div");
    camada.innerHTML =
      "<span>Uma noite destas, vindo da cidade. </span><span>Encontrei no trem</span><br><span>um rapaz.</span>";
    document.body.append(camada);
    const frases = frasesDaCamada(camada, "pt").map((r) => r.toString());
    expect(frases).toEqual(["Uma noite destas, vindo da cidade.", "Encontrei no tremum rapaz."]);
    camada.remove();
  });
});

describe("textoDoTrecho", () => {
  it("o fim de linha (<br> do pdf.js) vira espaço, sem espaços repetidos", () => {
    const camada = document.createElement("div");
    camada.innerHTML = "<span>Encontrei no trem</span><br><span>um rapaz. </span><br><span>Fim</span>";
    const r = document.createRange();
    r.selectNodeContents(camada);
    expect(textoDoTrecho(r)).toBe("Encontrei no trem um rapaz. Fim");
  });
});
