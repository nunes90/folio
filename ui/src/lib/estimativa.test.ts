import { describe, expect, it, vi } from "vitest";
import {
  comandoQuantoFalta,
  duracaoAproximada,
  estimar,
  textoCompleto,
  textoDoRodape,
} from "./estimativa";

/** Um ritmo de 1% do livro a cada 2 minutos. */
const RITMO = 0.01 / 120;

describe("duracaoAproximada", () => {
  it("minutos arredondados; acima de uma hora, de 10 em 10 minutos", () => {
    expect(duracaoAproximada(20)).toBe("menos de 1 min");
    expect(duracaoAproximada(60)).toBe("~1 min");
    expect(duracaoAproximada(12 * 60 + 20)).toBe("~12 min");
    expect(duracaoAproximada(59 * 60 + 50)).toBe("~1 h");
    expect(duracaoAproximada(80 * 60)).toBe("~1 h 20 min");
    expect(duracaoAproximada(4 * 3600 + 58 * 60)).toBe("~5 h");
  });
});

describe("estimar", () => {
  it("até o fim do capítulo e do livro, no ritmo", () => {
    const e = estimar(0.5, RITMO, 0.52)!;
    expect(e.capitulo).toBeCloseTo(240);
    expect(e.livro).toBeCloseTo(6000);
  });

  it("sem ritmo, sem estimativa; sem fim de capítulo, só o livro", () => {
    expect(estimar(0.5, null)).toBeNull();
    expect(estimar(0.5, 0)).toBeNull();
    expect(estimar(0.5, RITMO)?.capitulo).toBeNull();
    expect(estimar(0.5, RITMO, 0.4)?.capitulo).toBeNull();
  });

  it("no fim do livro, nada falta", () => {
    expect(estimar(1, RITMO)?.livro).toBe(0);
  });
});

describe("textos", () => {
  const e = estimar(0.5, RITMO, 0.52)!;

  it("rodapé: o capítulo se se sabe; senão, o livro (ou o documento)", () => {
    expect(textoDoRodape(e, "epub")).toBe("~4 min no capítulo");
    expect(textoDoRodape({ ...e, capitulo: null }, "pdf")).toBe("~1 h 40 min no documento");
  });

  it("frase completa", () => {
    expect(textoCompleto(e, "epub")).toBe(
      "No seu ritmo neste livro: ~4 min até o fim do capítulo e ~1 h 40 min até o fim do livro.",
    );
    expect(textoCompleto({ ...e, capitulo: null }, "pdf")).toBe(
      "No seu ritmo neste documento: ~1 h 40 min até o fim do documento.",
    );
  });

  it("“Quanto falta?” anuncia a estimativa, ou por que não há", () => {
    const anunciar = vi.fn();
    comandoQuantoFalta(e, "epub", anunciar).executar();
    expect(anunciar).toHaveBeenLastCalledWith(textoCompleto(e, "epub"));
    const sem = comandoQuantoFalta(null, "epub", anunciar);
    expect(sem.dica).toBeUndefined();
    sem.executar();
    expect(anunciar).toHaveBeenLastCalledWith(expect.stringContaining("Ainda não há leitura bastante"));
  });
});
