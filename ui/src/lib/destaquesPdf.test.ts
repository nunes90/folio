import { describe, expect, it } from "vitest";
import type { Destaque } from "./biblioteca";
import {
  acertou,
  desenharCamadaDestaques,
  lerLocalPdf,
  localPdf,
  naJanela,
  posicaoNoPdf,
  retangulosNaPagina,
} from "./destaquesPdf";

const pagina = { left: 100, top: 50, width: 400, height: 600 };

describe("local do PDF", () => {
  it("vai e volta, com 4 casas", () => {
    const local = localPdf(3, [
      { x: 0.1, y: 0.2, l: 0.512345, a: 0.02 },
      { x: 0.1, y: 0.23, l: 0.3, a: 0.02 },
    ]);
    expect(local).toBe("pdf:3:0.1,0.2,0.5123,0.02;0.1,0.23,0.3,0.02");
    expect(lerLocalPdf(local)).toEqual({
      pagina: 3,
      retangulos: [
        { x: 0.1, y: 0.2, l: 0.5123, a: 0.02 },
        { x: 0.1, y: 0.23, l: 0.3, a: 0.02 },
      ],
    });
  });

  it("rejeita o que não é local de PDF (ex.: um CFI)", () => {
    expect(lerLocalPdf("epubcfi(/6/4!/4/2,/1:0,/1:5)")).toBeNull();
    expect(lerLocalPdf("pdf:0:0,0,1,1")).toBeNull();
    expect(lerLocalPdf("pdf:2:0,0,1")).toBeNull();
    expect(lerLocalPdf("pdf:2:a,b,c,d")).toBeNull();
  });
});

describe("retangulosNaPagina", () => {
  it("converte para frações e junta os pedaços da mesma linha", () => {
    const rects = [
      { left: 140, top: 110, width: 60, height: 12 },
      { left: 200, top: 111, width: 100, height: 11 },
      { left: 140, top: 130, width: 80, height: 12 },
    ];
    const r = retangulosNaPagina(rects, pagina);
    expect(r).toHaveLength(2);
    expect(r[0]!.x).toBeCloseTo(0.1);
    expect(r[0]!.y).toBeCloseTo(0.1);
    expect(r[0]!.l).toBeCloseTo(0.4);
    expect(r[0]!.a).toBeCloseTo(12 / 600);
    expect(r[1]!.y).toBeCloseTo(80 / 600);
  });

  it("recorta na página e ignora os vazios e o retângulo da página toda", () => {
    const rects = [
      { left: 450, top: 100, width: 200, height: 10 }, // passa da direita
      { left: 150, top: 200, width: 0.5, height: 10 }, // fino demais
      { left: 100, top: 50, width: 400, height: 600 }, // "fim do conteúdo" do pdf.js
      { left: 150, top: 700, width: 50, height: 10 }, // outra página
    ];
    const r = retangulosNaPagina(rects, pagina);
    expect(r).toHaveLength(1);
    expect(r[0]!.x + r[0]!.l).toBeCloseTo(1);
  });

  it("página sem tamanho não dá nada", () => {
    expect(retangulosNaPagina([{ left: 0, top: 0, width: 10, height: 10 }], { ...pagina, width: 0 })).toEqual([]);
  });
});

describe("posição, acerto e volta para a janela", () => {
  it("posicaoNoPdf soma as páginas anteriores à fração da página", () => {
    expect(posicaoNoPdf(1, 4, 0)).toBe(0);
    expect(posicaoNoPdf(3, 4, 0.5)).toBeCloseTo(0.625);
    expect(posicaoNoPdf(4, 4, 7)).toBe(1);
    expect(posicaoNoPdf(1, 0, 0.5)).toBe(0);
  });

  it("acertou confere se o ponto está em algum retângulo", () => {
    const rs = [{ x: 0.1, y: 0.1, l: 0.4, a: 0.02 }];
    expect(acertou(rs, 0.2, 0.11)).toBe(true);
    expect(acertou(rs, 0.6, 0.11)).toBe(false);
    expect(acertou(rs, 0.2, 0.2)).toBe(false);
  });

  it("naJanela desfaz a conversão", () => {
    expect(naJanela({ x: 0.1, y: 0.1, l: 0.4, a: 0.02 }, pagina)).toEqual({
      left: 140,
      top: 110,
      width: 160,
      height: 12,
      bottom: 122,
    });
  });
});

describe("desenharCamadaDestaques", () => {
  const destaque = (id: number, local: string, cor: Destaque["cor"] = "verde"): Destaque => ({
    id,
    livroId: "l",
    local,
    trecho: "t",
    cor,
    motivo: null,
    nota: null,
    capitulo: null,
    posicao: 0,
    criadoEm: 0,
    atualizadoEm: 0,
  });
  const pagina = () => {
    const el = document.createElement("div");
    el.innerHTML = '<div class="canvasWrapper"></div><div class="textLayer"></div>';
    return el;
  };

  it("desenha os da página, em %, logo depois do desenho dela (abaixo da camada de texto)", () => {
    const el = pagina();
    desenharCamadaDestaques(el, 3, [
      destaque(1, localPdf(3, [{ x: 0.1, y: 0.2, l: 0.5, a: 0.05 }])),
      destaque(2, localPdf(4, [{ x: 0, y: 0, l: 1, a: 1 }])),
    ]);
    const camada = el.querySelector(".camada-destaques")!;
    expect(camada.previousElementSibling?.className).toBe("canvasWrapper");
    expect(camada.getAttribute("aria-hidden")).toBe("true");
    const marcas = [...camada.children] as HTMLElement[];
    expect(marcas).toHaveLength(1);
    expect(marcas[0]!.style.left).toBe("10%");
    expect(marcas[0]!.style.width).toBe("50%");
  });

  it("redesenhar troca a camada; sem destaques na página, não deixa camada", () => {
    const el = pagina();
    const d = destaque(1, localPdf(3, [{ x: 0, y: 0, l: 1, a: 0.1 }]));
    desenharCamadaDestaques(el, 3, [d]);
    desenharCamadaDestaques(el, 3, [d]);
    expect(el.querySelectorAll(".camada-destaques")).toHaveLength(1);
    desenharCamadaDestaques(el, 3, []);
    expect(el.querySelector(".camada-destaques")).toBeNull();
  });
});
