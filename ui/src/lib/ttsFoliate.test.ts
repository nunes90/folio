// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error: o foliate-js não tem tipos
import { TTS } from "../vendor/foliate-js/tts.js";
// @ts-expect-error: o foliate-js não tem tipos
import { textWalker } from "../vendor/foliate-js/text-walker.js";

describe("tts.js do foliate-js (alteração local)", () => {
  it("quebra de linha no meio do parágrafo não é fim de frase", () => {
    const doc = new DOMParser().parseFromString(
      `<html lang="pt"><body><p>Uma noite destas, vindo da cidade para o
Engenho Novo, encontrei no trem da Central um
rapaz aqui do bairro. Outra frase.</p></body></html>`,
      "text/html",
    );
    const tts = new TTS(doc, textWalker, () => {}, "sentence");
    const ssml: string = tts.start();
    const marcas = ssml.match(/<mark /g) ?? [];
    expect(marcas).toHaveLength(2);
  });

  it("peekNext mostra o bloco seguinte sem avançar", () => {
    const doc = new DOMParser().parseFromString(
      "<html lang=\"pt\"><body><p>Primeiro bloco.</p><p>Segundo bloco.</p></body></html>",
      "text/html",
    );
    const tts = new TTS(doc, textWalker, () => {}, "sentence");
    expect(tts.start()).toContain("Primeiro");
    const seguinte = tts.peekNext();
    expect(seguinte.ssml).toContain("Segundo");
    expect(seguinte.range.toString()).toBe("Segundo bloco.");
    expect(tts.peekNext().ssml).toBe(seguinte.ssml);
    expect(tts.next()).toBe(seguinte.ssml);
    expect(tts.peekNext()).toBeUndefined();
  });
});
