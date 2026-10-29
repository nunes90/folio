import { describe, expect, it } from "vitest";
import { medirRotulos, type EstadoRotulos } from "./densidade";

const COM: EstadoRotulos = { compacto: false, necessario: 0 };
const folga = 32;

describe("medirRotulos (rótulos quando cabem)", () => {
  it("com rótulos e o conteúdo cabendo, fica como está", () => {
    expect(medirRotulos(COM, 1000, 1000, folga)).toBe(COM);
    expect(medirRotulos(COM, 1000, 800, folga)).toBe(COM);
  });

  it("transbordou: só ícones, lembrando quanto os rótulos precisavam", () => {
    expect(medirRotulos(COM, 900, 1100, folga)).toEqual({ compacto: true, necessario: 1100 });
  });

  it("só ícones: os rótulos voltam só com a folga além do que precisavam (sem oscilar)", () => {
    const so = { compacto: true, necessario: 1100 };
    expect(medirRotulos(so, 1110, 700, folga)).toBe(so);
    expect(medirRotulos(so, 1131, 700, folga)).toBe(so);
    expect(medirRotulos(so, 1132, 700, folga)).toEqual(COM);
  });

  it("meio pixel de arredondamento não conta como transbordar", () => {
    expect(medirRotulos(COM, 1000, 1000.4, folga)).toBe(COM);
  });
});
