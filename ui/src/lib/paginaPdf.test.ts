import { describe, expect, it, vi } from "vitest";
import {
  inverter,
  inverterCanvas,
  inverterPixels,
  PAGINAS_PDF,
  type PaginaPdf,
} from "./paginaPdf";
import { contraste } from "./temas";

const presets = Object.keys(PAGINAS_PDF) as PaginaPdf[];

describe("presets da página do PDF", () => {
  it("são original, creme, sépia e noite, nessa ordem", () => {
    expect(presets).toEqual(["original", "creme", "sepia", "noite"]);
  });

  it.each(presets)("%s: texto com contraste AAA (7:1) sobre o papel", (preset) => {
    const { papel, tinta } = PAGINAS_PDF[preset];
    expect(contraste(tinta, papel)).toBeGreaterThanOrEqual(7);
  });

  it("creme e sépia usam uma camada multiply (o preto continua preto); noite, um filtro", () => {
    expect(PAGINAS_PDF.creme.camada).toBe(PAGINAS_PDF.creme.papel);
    expect(PAGINAS_PDF.sepia.camada).toBe(PAGINAS_PDF.sepia.papel);
    expect(PAGINAS_PDF.noite.filtro).toBe("invert(0.9) hue-rotate(180deg)");
    expect(PAGINAS_PDF.original.camada).toBeUndefined();
    expect(PAGINAS_PDF.original.filtro).toBeUndefined();
  });

  it("inverterPixels: branco e preto viram o papel e a tinta da noite; cores mantêm o tom", () => {
    // RGBA: branco, preto e um vermelho.
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 200, 30, 30, 255]);
    inverterPixels(px);
    const hex = (i: number) =>
      "#" + [...px.slice(i, i + 3)].map((c) => c.toString(16).padStart(2, "0")).join("");
    expect(hex(0)).toBe(PAGINAS_PDF.noite.papel);
    expect(hex(4)).toBe(PAGINAS_PDF.noite.tinta);
    // O vermelho continua avermelhado (mais claro): o tom não vira ciano.
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
    expect(canvas.hasAttribute("data-invertida")).toBe(false);
    inverterCanvas(canvas);
    expect(ctx.putImageData).toHaveBeenCalledWith(imagem, 0, 0);
    expect(canvas.hasAttribute("data-invertida")).toBe(true);
  });

  it("as cores da noite são as que o filtro produz (a amostra do painel bate com a página)", () => {
    expect(inverter("#ffffff", 0.9)).toBe(PAGINAS_PDF.noite.papel);
    expect(inverter("#000000", 0.9)).toBe(PAGINAS_PDF.noite.tinta);
  });
});
