import { describe, expect, it, vi } from "vitest";
import {
  cssDaPagina,
  inverter,
  inverterCanvas,
  inverterPixels,
  PAGINAS,
  resolverPagina,
  type PaginaEfetiva,
} from "./pagina";
import { contraste } from "./temas";

const paginas = Object.keys(PAGINAS) as PaginaEfetiva[];

describe("páginas (iguais no EPUB e no PDF)", () => {
  it("são original, creme, sépia e noite, nessa ordem", () => {
    expect(paginas).toEqual(["original", "creme", "sepia", "noite"]);
  });

  it.each(paginas)("%s: texto AAA (7:1) e links AA (4,5:1) sobre o papel", (pagina) => {
    const { papel, tinta, link } = PAGINAS[pagina];
    expect(contraste(tinta, papel)).toBeGreaterThanOrEqual(7);
    expect(contraste(link, papel)).toBeGreaterThanOrEqual(4.5);
  });

  it("no PDF: creme e sépia são uma camada multiply; noite, a inversão", () => {
    expect(PAGINAS.creme.camada).toBe(PAGINAS.creme.papel);
    expect(PAGINAS.sepia.camada).toBe(PAGINAS.sepia.papel);
    expect(PAGINAS.noite.filtro).toBe("invert(0.9) hue-rotate(180deg)");
    expect(PAGINAS.original.camada).toBeUndefined();
    expect(PAGINAS.original.filtro).toBeUndefined();
  });

  it("as cores da noite são as que a inversão produz (a amostra bate com a página do PDF)", () => {
    expect(inverter("#ffffff", 0.9)).toBe(PAGINAS.noite.papel);
    expect(inverter("#000000", 0.9)).toBe(PAGINAS.noite.tinta);
  });
});

describe("resolverPagina", () => {
  it("automática segue a interface: clara → original; escura ou alto contraste → noite", () => {
    expect(resolverPagina("automatica", "claro")).toBe("original");
    expect(resolverPagina("automatica", "escuro")).toBe("noite");
    expect(resolverPagina("automatica", "alto-contraste")).toBe("noite");
  });

  it("uma página escolhida vale qualquer que seja a interface", () => {
    expect(resolverPagina("sepia", "escuro")).toBe("sepia");
    expect(resolverPagina("original", "escuro")).toBe("original");
    expect(resolverPagina("noite", "claro")).toBe("noite");
  });
});

describe("cssDaPagina (EPUB)", () => {
  it("pinta fundo, texto e links com as cores da página", () => {
    const css = cssDaPagina("sepia", "claro");
    expect(css).toContain(`background: ${PAGINAS.sepia.papel} !important`);
    expect(css).toContain(`color: ${PAGINAS.sepia.tinta} !important`);
    expect(css).toContain(`color: ${PAGINAS.sepia.link} !important`);
    expect(cssDaPagina("noite", "claro")).toContain("color-scheme: dark");
  });

  it("interface em alto contraste força branco sobre preto no livro, qualquer que seja a página", () => {
    const css = cssDaPagina("sepia", "alto-contraste");
    expect(css).toContain("background: #000000 !important");
    expect(css).toContain("color: #ffffff !important");
    expect(css).toContain("background-color: transparent !important");
    expect(cssDaPagina("original", "claro")).not.toContain("background-color: transparent");
  });
});

describe("inversão dos pixels (noite no PDF)", () => {
  it("branco e preto viram o papel e a tinta da noite; cores mantêm o tom", () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 200, 30, 30, 255]);
    inverterPixels(px);
    const hex = (i: number) =>
      "#" + [...px.slice(i, i + 3)].map((c) => c.toString(16).padStart(2, "0")).join("");
    expect(hex(0)).toBe(PAGINAS.noite.papel);
    expect(hex(4)).toBe(PAGINAS.noite.tinta);
    const [r, g, b] = px.slice(8, 11);
    expect(r).toBeGreaterThan(g! + 60);
    expect(Math.abs(g! - b!)).toBeLessThanOrEqual(1);
    expect(px[11]).toBe(255);
  });

  it("inverterCanvas marca o canvas como invertido (o CSS só o mostra depois disso)", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const imagem = { data: new Uint8ClampedArray([255, 255, 255, 255]) };
    const ctx = { getImageData: vi.fn(() => imagem), putImageData: vi.fn() };
    vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    inverterCanvas(canvas);
    expect(ctx.putImageData).toHaveBeenCalledWith(imagem, 0, 0);
    expect(canvas.hasAttribute("data-invertida")).toBe(true);
  });
});
