import { afterEach, describe, expect, it, vi } from "vitest";
import { preferencias } from "./preferencias.svelte";
import { animarVirada, cancelarVirada, quadrosDaVirada } from "./virada";

afterEach(() => {
  preferencias.movimento = "sistema";
  vi.restoreAllMocks();
});

describe("quadrosDaVirada", () => {
  it("deslizar: a página nova vem, de leve, do lado do avanço", () => {
    expect(quadrosDaVirada("deslizar", "direita")![0]).toMatchObject({ transform: "translateX(3%)" });
    expect(quadrosDaVirada("deslizar", "esquerda")![0]).toMatchObject({ transform: "translateX(-3%)" });
  });

  it("virar: gira a partir da lombada (esquerda ao avançar, direita ao voltar)", () => {
    const avancar = quadrosDaVirada("virar", "direita")!;
    expect(avancar[0]).toMatchObject({ transformOrigin: "left center" });
    expect(avancar[0]!.transform).toContain("rotateY(-60deg)");
    expect(quadrosDaVirada("virar", "esquerda")![0]).toMatchObject({ transformOrigin: "right center" });
  });

  it("todos os estilos animam só transform e opacity (e a origem do transform)", () => {
    for (const estilo of ["deslizar", "virar", "esmaecer"] as const) {
      for (const quadro of quadrosDaVirada(estilo, "direita")!) {
        expect(Object.keys(quadro).every((k) => ["transform", "opacity", "transformOrigin"].includes(k))).toBe(true);
      }
    }
  });

  it("nenhuma: sem animação", () => {
    expect(quadrosDaVirada("nenhuma", "direita")).toBeNull();
  });
});

describe("animarVirada", () => {
  it("anima o elemento com o estilo escolhido", () => {
    const el = document.createElement("div");
    const animar = vi.spyOn(el, "animate");
    animarVirada(el, "esmaecer", "direita");
    expect(animar).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.anything());
  });

  it("é curta: a virada se repete centenas de vezes e não deve chamar atenção", () => {
    const el = document.createElement("div");
    const animar = vi.spyOn(el, "animate");
    animarVirada(el, "deslizar", "direita");
    expect(animar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 160 }));
  });

  it("com movimento reduzido, não anima", () => {
    preferencias.movimento = "reduzido";
    const el = document.createElement("div");
    const animar = vi.spyOn(el, "animate");
    animarVirada(el, "deslizar", "direita");
    expect(animar).not.toHaveBeenCalled();
  });

  it("uma virada nova cancela a anterior", () => {
    const el = document.createElement("div");
    const cancelar = vi.fn();
    vi.spyOn(el, "animate").mockReturnValue({ cancel: cancelar } as unknown as Animation);
    animarVirada(el, "deslizar", "direita");
    animarVirada(el, "deslizar", "direita");
    expect(cancelar).toHaveBeenCalledOnce();
    cancelarVirada();
    expect(cancelar).toHaveBeenCalledTimes(2);
  });
});
