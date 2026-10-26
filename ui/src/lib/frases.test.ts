import { beforeEach, describe, expect, it } from "vitest";
import { blocosDe, frasesDe, frasesDoDocumento, indiceDaFraseEm, unir } from "./frases";

function doc(html: string): Document {
  const d = document.implementation.createHTMLDocument("t");
  d.body.innerHTML = html;
  return d;
}

const textos = (rs: Range[]) => rs.map((r) => r.toString());

describe("blocosDe", () => {
  it("um bloco por parágrafo, título e item; sem os vazios", () => {
    const d = doc("<h1>Título</h1><p>Um.</p><p>  </p><ul><li>Item</li></ul><p>Dois.</p>");
    expect(textos(blocosDe(d)).map((t) => t.trim())).toEqual(["Título", "Um.", "Item", "Dois."]);
  });

  it("texto solto, sem tag de bloco, vira um bloco só", () => {
    expect(textos(blocosDe(doc("só texto <em>aqui</em>")))).toEqual(["só texto aqui"]);
  });
});

describe("frasesDe", () => {
  it("divide o bloco em frases, sem os espaços das pontas", () => {
    const d = doc("<p>Ia a entrar na sala. Ouvi o meu nome! Escondi-me?  </p>");
    const [bloco] = blocosDe(d);
    expect(textos(frasesDe(bloco!, "pt"))).toEqual([
      "Ia a entrar na sala.",
      "Ouvi o meu nome!",
      "Escondi-me?",
    ]);
  });

  it("quebra de linha no meio do parágrafo (XHTML) não corta a frase", () => {
    const d = doc("<p>Fiquei tão alegre com esta ideia, que ainda\nme treme a pena na mão. Fim.</p>");
    expect(textos(frasesDe(blocosDe(d)[0]!, "pt"))).toEqual([
      "Fiquei tão alegre com esta ideia, que ainda\nme treme a pena na mão.",
      "Fim.",
    ]);
  });

  it("frases que atravessam elementos (ênfase, links) continuam inteiras", () => {
    const d = doc("<p>Era <em>tão</em> cedo. Mas <a href='#'>fui</a> mesmo assim.</p>");
    expect(textos(frasesDe(blocosDe(d)[0]!, "pt"))).toEqual(["Era tão cedo.", "Mas fui mesmo assim."]);
  });
});

describe("frasesDoDocumento", () => {
  let d: Document;
  beforeEach(() => {
    d = doc("<h2>II</h2><p>Primeira. Segunda.</p><p>Terceira.</p>");
  });

  it("todas as frases, bloco a bloco, na ordem do texto", () => {
    expect(textos(frasesDoDocumento(d, "pt"))).toEqual(["II", "Primeira.", "Segunda.", "Terceira."]);
  });

  it("indiceDaFraseEm: a primeira frase que termina depois do ponto", () => {
    const frases = frasesDoDocumento(d, "pt");
    const p = d.body.querySelectorAll("p")[0]!.firstChild!;
    const ponto = d.createRange();
    ponto.setStart(p, 12); // dentro de "Segunda."
    expect(indiceDaFraseEm(frases, ponto)).toBe(2);
    ponto.setStart(d.body, 0);
    expect(indiceDaFraseEm(frases, ponto)).toBe(0);
  });

  it("capítulo longo: tempo linear (o quadrático levava segundos)", () => {
    const longo = doc(Array.from({ length: 2000 }, (_, i) => `<p>Frase ${i}. Outra ${i}.</p>`).join(""));
    const t0 = performance.now();
    const frases = frasesDoDocumento(longo, "pt");
    const ms = performance.now() - t0;
    expect(frases).toHaveLength(4000);
    expect(frases.at(-1)!.toString()).toBe("Outra 1999.");
    expect(ms).toBeLessThan(1500);
  });

  it("unir junta frases seguidas num intervalo só", () => {
    const frases = frasesDoDocumento(d, "pt");
    expect(unir(frases, 1, 3).toString()).toBe("Primeira. Segunda.Terceira.");
  });
});
