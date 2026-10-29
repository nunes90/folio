import { describe, expect, it } from "vitest";
import { ATALHOS, GRUPOS, porGrupo, type Contexto } from "./atalhos";

const CONTEXTOS: Contexto[] = ["biblioteca", "epub", "pdf"];
const teclas = (c: Contexto) => ATALHOS[c].map((a) => a.teclas.map((t) => t.join("+")).join(" ou "));

describe("porGrupo (F1 agrupado)", () => {
  it("cada atalho aparece uma vez, nos grupos na ordem fixa, sem grupo vazio", () => {
    for (const c of CONTEXTOS) {
      const grupos = porGrupo(c);
      expect(grupos.flatMap((g) => g.atalhos)).toHaveLength(ATALHOS[c].length);
      expect(grupos.every((g) => g.atalhos.length > 0)).toBe(true);
      const ordem = grupos.map((g) => GRUPOS.indexOf(g.grupo));
      expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    }
  });

  it("o geral (F1, Ctrl+K, Esc) fica por último em todos os contextos", () => {
    for (const c of CONTEXTOS) expect(porGrupo(c).at(-1)?.grupo).toBe("Geral");
  });

  it("os dois formatos têm os mesmos atalhos de marcar e de comparar", () => {
    const de = (c: Contexto, g: string) =>
      porGrupo(c)
        .find((x) => x.grupo === g)
        ?.atalhos.map((a) => a.teclas.map((t) => t.join("+")).join(" ou "));
    for (const g of ["Marcar", "Comparar"]) expect(de("pdf", g)).toEqual(de("epub", g));
    expect(teclas("pdf")).toContain("Ctrl+D");
  });
});
