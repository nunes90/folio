import { describe, expect, it } from "vitest";
import { FONTES, MONO, familiaCss, fontFace } from "./fontes";

describe("fontes do app", () => {
  it("cada fonte tem os arquivos latin e, quando existe, latin-ext, só em WOFF2", () => {
    const resumo = (f: { arquivos: { faixa: string; peso: number; italico: boolean }[] }) =>
      f.arquivos.map((a) => `${a.faixa} ${a.peso}${a.italico ? "i" : ""}`);
    const quatro = ["400", "400i", "700", "700i"];
    const comExt = [...quatro.map((q) => `latin ${q}`), ...quatro.map((q) => `latin-ext ${q}`)];
    expect(resumo(FONTES.literata)).toEqual(comExt);
    expect(resumo(FONTES.atkinson)).toEqual(comExt);
    expect(resumo(MONO)).toEqual(comExt);
    // A Lexend não tem itálico; a OpenDyslexic não tem latin-ext.
    expect(resumo(FONTES.lexend)).toEqual(["latin 400", "latin 700", "latin-ext 400", "latin-ext 700"]);
    expect(resumo(FONTES.opendyslexic)).toEqual(quatro.map((q) => `latin ${q}`));
    for (const f of [...Object.values(FONTES), MONO])
      for (const a of f.arquivos) expect(a.url).toMatch(/\.woff2(\?|$)/);
  });

  it("o @font-face de cada arquivo leva a faixa do subconjunto e uma URL absoluta", () => {
    const css = fontFace("literata", "tauri://localhost/index.html");
    const faces = css.split("\n");
    expect(faces).toHaveLength(8);
    expect(faces[0]).toContain('font-family: "Literata"; font-weight: 400; font-style: normal;');
    expect(faces[0]).toContain("unicode-range: U+0000-00FF,");
    expect(faces[0]).toMatch(/src: url\("tauri:\/\/localhost\/[^"]+literata-latin-400-normal[^"]*\.woff2"\) format\("woff2"\)/);
    // latin-ext: "ł" (U+0142) e "ě" (U+011B) estão na faixa.
    expect(faces[4]).toContain("unicode-range: U+0100-02BA,");
    expect(faces[4]).toContain("literata-latin-ext-400-normal");
  });

  it("as fontes entram no documento principal ao carregar o módulo", () => {
    const estilo = document.getElementById("folio-fontes");
    expect(estilo?.textContent).toContain('font-family: "OpenDyslexic"');
    expect(estilo?.textContent).toContain('font-family: "Atkinson Hyperlegible Mono"');
  });

  it("font-family com a reserva genérica", () => {
    expect(familiaCss("lexend")).toBe('"Lexend", sans-serif');
    expect(familiaCss(MONO)).toBe('"Atkinson Hyperlegible Mono", monospace');
  });
});
