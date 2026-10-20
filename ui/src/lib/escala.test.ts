import { describe, expect, it } from "vitest";
import { cssDoLivro, escala, iniciarEscala } from "./escala.svelte";

describe("escala de texto", () => {
  it("gera o font-size do livro a partir do fator", () => {
    expect(cssDoLivro(1)).toBe("html { font-size: 100% !important; }");
    expect(cssDoLivro(1.5)).toBe("html { font-size: 150% !important; }");
  });

  it("fica em 1 fora do Tauri", async () => {
    await iniciarEscala();
    expect(escala.fator).toBe(1);
  });
});
