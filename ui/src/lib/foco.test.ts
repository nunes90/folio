import { afterEach, describe, expect, it } from "vitest";
import { recuperarFoco } from "./foco";

describe("recuperarFoco", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("leva o foco do body à área do livro", () => {
    document.body.innerHTML = `<div class="conteudo" tabindex="-1"></div>`;
    recuperarFoco();
    expect(document.activeElement).toBe(document.querySelector(".conteudo"));
  });

  it("leva o foco do body ao livro atual da biblioteca", () => {
    document.body.innerHTML = `<button class="livro" tabindex="-1">A</button><button class="livro" tabindex="0">B</button>`;
    recuperarFoco();
    expect(document.activeElement?.textContent).toBe("B");
  });

  it("não mexe no foco que está em outro lugar", () => {
    document.body.innerHTML = `<button id="b">x</button><div class="conteudo" tabindex="-1"></div>`;
    document.querySelector<HTMLElement>("#b")!.focus();
    recuperarFoco();
    expect(document.activeElement?.id).toBe("b");
  });
});
