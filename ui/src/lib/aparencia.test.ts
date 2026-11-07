import { describe, expect, it } from "vitest";
import { abaValida } from "./aparencia.svelte";

describe("aba do painel Aparência", () => {
  it("lembra a última; na biblioteca, sem a Leitura, abre na Interface", () => {
    expect(abaValida("voz", ["leitura", "voz", "interface"])).toBe("voz");
    expect(abaValida("leitura", ["voz", "interface"])).toBe("interface");
    expect(abaValida("voz", ["voz", "interface"])).toBe("voz");
  });
});
