import { describe, expect, it } from "vitest";
import { cssDoLivro, PADRAO, type Preferencias } from "./preferencias.svelte";

const base = "tauri://localhost/";
const css = (mudancas: Partial<Preferencias> = {}, escala = 1) =>
  cssDoLivro({ ...PADRAO, ...mudancas }, escala, "claro", base);

describe("cssDoLivro", () => {
  it("multiplica o tamanho escolhido pela escala do sistema", () => {
    expect(css({ tamanho: 1.25 }, 1.3636)).toContain("html { font-size: 170.45% !important; }");
  });

  it("inclui as cores do tema", () => {
    expect(cssDoLivro(PADRAO, 1, "sepia", base)).toContain("background: #f4ecd8 !important");
  });

  it("no padrão, não troca a fonte nem o alinhamento do livro", () => {
    const resultado = css();
    expect(resultado).not.toMatch(/font-family: "/);
    expect(resultado).not.toContain("text-align");
    expect(resultado).not.toContain("letter-spacing");
    expect(resultado).toContain("line-height: 1.5 !important");
    expect(resultado).toContain("hyphens: manual !important");
  });

  it("aplica espaçamentos, alinhamento e hifenização", () => {
    const resultado = css({
      espacoLetras: 0.05,
      espacoPalavras: 0.2,
      alinhamento: "inicio",
      hifenizacao: true,
    });
    expect(resultado).toContain("letter-spacing: 0.05em !important");
    expect(resultado).toContain("word-spacing: 0.2em !important");
    expect(resultado).toContain("text-align: start !important");
    expect(resultado).toContain("hyphens: auto !important");
  });

  it("justificado vira justify", () => {
    expect(css({ alinhamento: "justificado" })).toContain("text-align: justify !important");
  });

  it("fonte do app: @font-face com URL absoluta e família com reserva, sem afetar código", () => {
    const resultado = css({ fonte: "opendyslexic" });
    expect(resultado).toMatch(/@font-face \{ font-family: "OpenDyslexic"; font-weight: 400;/);
    expect(resultado).toMatch(/src: url\("tauri:\/\/localhost\/[^"]+\.woff2"\)/);
    expect(resultado).toContain(`font-family: "OpenDyslexic", sans-serif !important`);
    expect(resultado).toContain(":not(code, pre, kbd, samp, code *, pre *)");
  });

  it("Lexend só declara os arquivos que existem (sem itálico)", () => {
    const resultado = css({ fonte: "lexend" });
    expect(resultado.match(/@font-face/g)).toHaveLength(2);
    expect(resultado).not.toContain("font-style: italic");
  });
});
