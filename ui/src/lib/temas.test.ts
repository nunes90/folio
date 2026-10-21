import { describe, expect, it } from "vitest";
import { contraste, cssDoTema, resolverTema, TEMAS, type TemaEfetivo } from "./temas";

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

describe("resolverTema", () => {
  const sistema = { escuro: false, contraste: false };

  it("escolha explícita vence o sistema", () => {
    expect(resolverTema("sepia", { escuro: true, contraste: true })).toBe("sepia");
  });

  it("sistema: claro, escuro ou alto contraste", () => {
    expect(resolverTema("sistema", sistema)).toBe("claro");
    expect(resolverTema("sistema", { ...sistema, escuro: true })).toBe("escuro");
    expect(resolverTema("sistema", { escuro: true, contraste: true })).toBe("alto-contraste");
  });
});

describe("cssDoTema (livro)", () => {
  it("aplica fundo, texto e links do tema", () => {
    const css = cssDoTema("escuro");
    expect(css).toContain(`color: ${TEMAS.escuro.texto} !important`);
    expect(css).toContain(`background: ${TEMAS.escuro.fundo} !important`);
    expect(css).toContain(`color: ${TEMAS.escuro.link} !important`);
  });

  it("alto contraste também neutraliza cores e fundos do próprio livro", () => {
    expect(cssDoTema("alto-contraste")).toContain("background-color: transparent !important");
    expect(cssDoTema("claro")).not.toContain("background-color: transparent");
  });
});
