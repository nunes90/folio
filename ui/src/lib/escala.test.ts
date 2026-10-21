import { describe, expect, it } from "vitest";
import { escala, iniciarEscala } from "./escala.svelte";

// O font-size do livro (escala × tamanho escolhido) é testado em preferencias.test.ts.
describe("escala de texto", () => {
  it("fica em 1 fora do Tauri", async () => {
    await iniciarEscala();
    expect(escala.fator).toBe(1);
  });
});
