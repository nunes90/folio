import { describe, expect, it } from "vitest";
import {
  AUSENCIA_MINIMA,
  deveMostrar,
  haQuanto,
  textoDaContinuacao,
  ultimasFrases,
} from "./continuacao";

describe("deveMostrar", () => {
  it("só com progresso, e se a última leitura foi há uma hora ou mais (ou não se sabe)", () => {
    const agora = 1_000_000;
    expect(deveMostrar(false, undefined, agora)).toBe(false);
    expect(deveMostrar(true, undefined, agora)).toBe(true);
    expect(deveMostrar(true, agora - 60, agora)).toBe(false);
    expect(deveMostrar(true, agora - AUSENCIA_MINIMA, agora)).toBe(true);
  });
});

describe("haQuanto", () => {
  const agora = 10_000_000;
  it("em português, na unidade que cabe", () => {
    expect(haQuanto(agora - 3 * 3600, agora)).toBe("há 3 horas");
    expect(haQuanto(agora - 86400, agora)).toBe("ontem");
    expect(haQuanto(agora - 2 * 86400, agora)).toBe("anteontem");
    expect(haQuanto(agora - 4 * 86400, agora)).toBe("há 4 dias");
    expect(haQuanto(agora - 15 * 86400, agora)).toBe("há 2 semanas");
    expect(haQuanto(agora - 10, agora)).toBe("há instantes");
  });
});

describe("ultimasFrases", () => {
  it("as últimas frases, com as quebras de linha como espaço", () => {
    const texto = "Ia a entrar na sala.\nOuvi o meu nome! Escondi-me atrás\nda porta. E esperei";
    expect(ultimasFrases(texto, 2, "pt")).toEqual(["Escondi-me atrás da porta.", "E esperei"]);
    expect(ultimasFrases(texto, 10, "pt")).toHaveLength(4);
    expect(ultimasFrases("   ", 3)).toEqual([]);
  });
});

describe("textoDaContinuacao", () => {
  it("o cartão numa frase, para o leitor de tela", () => {
    expect(
      textoDaContinuacao({ onde: "em “Capítulo 3”", quando: "há 2 dias", trecho: ["Uma.", "Duas."] }),
    ).toBe("Da última vez (há 2 dias), você estava em “Capítulo 3”. Onde você parou: Uma. Duas.");
    expect(textoDaContinuacao({ onde: "na página 42", trecho: [] })).toBe(
      "Da última vez, você estava na página 42.",
    );
  });
});
