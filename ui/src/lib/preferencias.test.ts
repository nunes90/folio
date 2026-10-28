import { describe, expect, it } from "vitest";
import { cssDoLivro, larguraDaColuna, PADRAO, type Preferencias } from "./preferencias.svelte";

const base = "tauri://localhost/";
const css = (mudancas: Partial<Preferencias> = {}, escala = 1) =>
  cssDoLivro({ ...PADRAO, ...mudancas }, escala, "claro", base);

describe("cssDoLivro", () => {
  it("multiplica o tamanho escolhido pela escala do sistema", () => {
    expect(css({ tamanho: 1.25 }, 1.3636)).toContain("html { font-size: 170.45% !important; }");
  });

  it("inclui as cores do tema", () => {
    expect(cssDoLivro({ ...PADRAO, pagina: "sepia" }, 1, "claro", base)).toContain(
      "background: #f0e1c2 !important",
    );
    // Automática segue a interface: escura → página noite.
    expect(cssDoLivro(PADRAO, 1, "escuro", base)).toContain("background: #191919 !important");
  });

  it("no padrão, não troca a fonte nem o alinhamento do livro", () => {
    const resultado = css();
    expect(resultado).not.toContain("body *:not(");
    expect(resultado).not.toMatch(/p, li, blockquote, dd \{[^}]*text-align/);
    expect(resultado).not.toMatch(/body, p, li, blockquote, dd \{[^}]*letter-spacing/);
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
    expect(resultado.match(/@font-face \{ font-family: "Lexend"/g)).toHaveLength(2);
    expect(resultado).not.toMatch(/"Lexend"; font-weight: \d+; font-style: italic/);
  });

  it("código sempre em monoespaçada (mesmo com a fonte original), sem os espaçamentos do texto", () => {
    const resultado = css({ espacoLetras: 0.1, hifenizacao: true });
    expect(resultado).toMatch(/@font-face \{ font-family: "Atkinson Hyperlegible Mono"; font-weight: 400;/);
    const regra = resultado.match(/pre, code, kbd, samp, tt \{[^}]*\}/)?.[0] ?? "";
    expect(regra).toContain('font-family: "Atkinson Hyperlegible Mono", monospace !important');
    expect(regra).toContain("letter-spacing: normal !important");
    expect(regra).toContain("word-spacing: normal !important");
    expect(regra).toContain("hyphens: none !important");
    // Linhas longas quebram dentro da coluna em vez de vazar.
    expect(resultado).toMatch(/pre \{[^}]*white-space: pre-wrap !important/);
  });

  it("títulos: entrelinha menor que a do texto, sem hifenizar, sem ficar sozinhos no fim da coluna", () => {
    const regra = (entrelinha: number) =>
      css({ entrelinha }).match(/h1, h2, h3, h4, h5, h6 \{[^}]*\}/)?.[0] ?? "";
    expect(regra(1.5)).toContain("line-height: 1.2 !important");
    expect(regra(2.5)).toContain("line-height: 2 !important");
    expect(regra(1)).toContain("line-height: 1.15 !important");
    expect(regra(1.5)).toContain("hyphens: none !important");
    expect(regra(1.5)).toContain("text-wrap: balance");
    expect(regra(1.5)).toContain("break-after: avoid");
  });

  it("margens dos títulos só como padrão (sem !important: as do livro vencem)", () => {
    const regra = css().match(/h1, h2, h3, h4, h5, h6 \{ margin[^}]*\}/)?.[0] ?? "";
    expect(regra).toContain("margin-block-start: 1.6em");
    expect(regra).not.toContain("!important");
  });
});

describe("larguraDaColuna", () => {
  it("caracteres por linha em px, crescendo com a letra e com a escala do sistema", () => {
    expect(larguraDaColuna({ ...PADRAO, caracteresPorLinha: 90 }, 1)).toBe(720);
    expect(larguraDaColuna({ ...PADRAO, caracteresPorLinha: 90, tamanho: 1.5 }, 1)).toBe(1080);
    expect(larguraDaColuna({ ...PADRAO, caracteresPorLinha: 60 }, 1.25)).toBe(600);
  });
});
