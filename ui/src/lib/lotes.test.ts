import { describe, expect, it } from "vitest";
import { LOTE, lotesAte, maisUmLote } from "./lotes";

describe("lotes", () => {
  it("o primeiro lote cobre os primeiros livros; mais adiante, lotes inteiros", () => {
    expect(lotesAte(0)).toBe(LOTE);
    expect(lotesAte(LOTE - 1)).toBe(LOTE);
    expect(lotesAte(LOTE)).toBe(2 * LOTE);
    expect(lotesAte(4999)).toBe(5040);
    expect(lotesAte(-1)).toBe(LOTE);
  });

  it("mais um lote, sem passar do total", () => {
    expect(maisUmLote(120, 5000)).toBe(240);
    expect(maisUmLote(4920, 5000)).toBe(5000);
    expect(maisUmLote(120, 50)).toBe(50);
  });
});
