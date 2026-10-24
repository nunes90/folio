import { describe, expect, it } from "vitest";
import { aplicarTema, contraste, resolverTema, TEMAS, type TemaEfetivo } from "./temas";

const nomes = Object.keys(TEMAS) as TemaEfetivo[];

describe("contraste (WCAG 2)", () => {
  it("calcula os extremos e um valor conhecido", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contraste("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

describe.each(nomes)("tema %s", (nome) => {
  const c = TEMAS[nome];

  it("texto principal tem contraste AAA (7:1)", () => {
    expect(contraste(c.texto, c.fundo)).toBeGreaterThanOrEqual(7);
    expect(contraste(c.texto, c.controle)).toBeGreaterThanOrEqual(7);
  });

  it("texto secundário e links têm pelo menos AA (4,5:1)", () => {
    expect(contraste(c.suave, c.fundo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.link, c.fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it("indicador de foco se destaca do fundo (3:1, WCAG 1.4.11)", () => {
    expect(contraste(c.foco, c.fundo)).toBeGreaterThanOrEqual(3);
    expect(contraste(c.foco, c.controle)).toBeGreaterThanOrEqual(3);
  });
});

describe.each(nomes)("superfícies do tema %s (M7: refinamento visual)", (nome) => {
  const c = TEMAS[nome];
  const superficies = { app: c.app, painel: c.painel, card: c.card, hover: c.hover };

  it.each(Object.entries(superficies))("texto AAA (7:1) e suave AA (4,5:1) sobre %s", (_, fundo) => {
    expect(contraste(c.texto, fundo)).toBeGreaterThanOrEqual(7);
    expect(contraste(c.suave, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it("borda de controles e foco se destacam das superfícies (3:1, WCAG 1.4.11)", () => {
    for (const fundo of [c.app, c.painel, c.card]) {
      expect(contraste(c.borda, fundo)).toBeGreaterThanOrEqual(3);
      expect(contraste(c.foco, fundo)).toBeGreaterThanOrEqual(3);
    }
  });

  it("destaque como texto e texto sobre o destaque têm pelo menos AA (4,5:1)", () => {
    for (const fundo of [c.app, c.painel, c.card, c.destaqueSuave]) {
      expect(contraste(c.destaque, fundo)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contraste(c.sobreDestaque, c.destaque)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.texto, c.destaqueSuave)).toBeGreaterThanOrEqual(7);
  });
});

describe("aplicarTema", () => {
  it("publica as cores como variáveis CSS (nomes em kebab-case)", () => {
    const raiz = document.createElement("div");
    aplicarTema("escuro", raiz);
    expect(raiz.style.getPropertyValue("--fundo")).toBe(TEMAS.escuro.fundo);
    expect(raiz.style.getPropertyValue("--painel")).toBe(TEMAS.escuro.painel);
    expect(raiz.style.getPropertyValue("--sobre-destaque")).toBe(TEMAS.escuro.sobreDestaque);
    expect(raiz.style.getPropertyValue("--destaque-suave")).toBe(TEMAS.escuro.destaqueSuave);
    expect(raiz.style.getPropertyValue("--sombra")).toBe(TEMAS.escuro.sombra);
    expect(raiz.dataset.tema).toBe("escuro");
  });

  it("alto contraste não usa sombras: o contorno faz esse papel", () => {
    expect(TEMAS["alto-contraste"].sombra).toBe("none");
  });
});

describe("resolverTema", () => {
  const sistema = { escuro: false, contraste: false };

  it("escolha explícita vence o sistema", () => {
    expect(resolverTema("claro", { escuro: true, contraste: true })).toBe("claro");
  });

  it("sistema: claro, escuro ou alto contraste", () => {
    expect(resolverTema("sistema", sistema)).toBe("claro");
    expect(resolverTema("sistema", { ...sistema, escuro: true })).toBe("escuro");
    expect(resolverTema("sistema", { escuro: true, contraste: true })).toBe("alto-contraste");
  });
});
