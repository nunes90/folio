import { describe, expect, it } from "vitest";
import { aparar } from "./frases";
import {
  OPACIDADE_FORA,
  blocoNaTela,
  blocosDoDocumento,
  cruza,
  emVolta,
  esmaecer,
  veuNaPagina,
  uniao,
  vizinho,
} from "./umaIdeia";

function doc(html: string): Document {
  const d = document.implementation.createHTMLDocument("t");
  d.body.innerHTML = html;
  return d;
}

/** Um intervalo do início do texto `de` ao fim do texto `ate` (pelo conteúdo dos elementos). */
function trecho(d: Document, de: string, ate = de): Range {
  const achar = (t: string) =>
    [...d.body.querySelectorAll("*")].find((e) => e.textContent === t && !e.children.length)!;
  const r = d.createRange();
  r.setStart(achar(de).firstChild!, 0);
  const fim = achar(ate).firstChild as Text;
  r.setEnd(fim, fim.length);
  return r;
}

const ids = (els: Element[]) => els.map((e) => e.id).sort();

describe("aparar", () => {
  it("tira os espaços das pontas", () => {
    const d = doc("<p>  \n Olá, <em>mundo</em>.\n  </p>");
    const r = d.createRange();
    r.selectNodeContents(d.querySelector("p")!);
    expect(aparar(r).toString()).toBe("Olá, mundo.");
  });
});

describe("blocosDoDocumento", () => {
  it("o trecho de cada bloco e o elemento que o abre", () => {
    const d = doc('<h1 id="t">Título</h1><p id="a">Um.</p><ul><li id="i">Item</li></ul>');
    const blocos = blocosDoDocumento(d);
    expect(blocos.map((b) => b.trecho.toString())).toEqual(["Título", "Um.", "Item"]);
    expect(blocos.map((b) => b.elemento.id)).toEqual(["t", "a", "i"]);
  });
});

describe("emVolta", () => {
  it("os irmãos do bloco e os de cada ancestral até o body", () => {
    const d = doc(
      '<h1 id="t">T</h1><div id="d"><p id="a">A</p><p id="b">B</p></div><img id="img"><p id="c">C</p>',
    );
    const [, a] = blocosDoDocumento(d);
    expect(a!.elemento.id).toBe("a");
    expect(ids(emVolta(a!))).toEqual(["b", "c", "img", "t"]);
  });

  it("dentro do elemento do bloco, os filhos que são outros blocos", () => {
    const d = doc('<div id="d">Introdução <em id="e">curta</em><p id="p">Outro.</p></div>');
    const [intro] = blocosDoDocumento(d);
    expect(intro!.trecho.toString()).toBe("Introdução curta");
    expect(ids(emVolta(intro!))).toEqual(["p"]);
  });
});

describe("esmaecer", () => {
  it("marca o que está em volta, troca a marca ao mudar de bloco e limpa com null", () => {
    const d = doc('<p id="a">A</p><p id="b">B</p><p id="c">C</p>');
    const [a, b] = blocosDoDocumento(d);
    const marcados = () => ids([...d.querySelectorAll("[data-folio-fora]")]);

    esmaecer(d, a!, "280ms ease");
    expect(marcados()).toEqual(["b", "c"]);
    const css = d.getElementById("folio-uma-ideia")!.textContent!;
    expect(css).toContain(`opacity: ${OPACIDADE_FORA}`);
    expect(css).toContain("transition: opacity 280ms ease");

    esmaecer(d, b!, "0ms");
    expect(marcados()).toEqual(["a", "c"]);

    esmaecer(d, null, "0ms");
    expect(marcados()).toEqual([]);
  });

  it("sem bloco e sem ter esmaecido antes, não mexe no documento", () => {
    const d = doc("<p>A</p>");
    esmaecer(d, null, "0ms");
    expect(d.getElementById("folio-uma-ideia")).toBeNull();
  });
});

describe("cruza e blocoNaTela", () => {
  const d = doc('<p id="a">A</p><p id="b">B</p><p id="c">C</p><p id="e">E</p>');
  const blocos = blocosDoDocumento(d).map((b) => b.trecho);

  it("cruza: alguma parte dentro do outro intervalo", () => {
    expect(cruza(blocos[1]!, trecho(d, "B", "C"))).toBe(true);
    expect(cruza(blocos[0]!, trecho(d, "B", "C"))).toBe(false);
    expect(cruza(blocos[3]!, trecho(d, "B", "C"))).toBe(false);
  });

  it("o primeiro bloco na tela; chegando de trás, o último", () => {
    const visivel = trecho(d, "B", "C");
    expect(blocoNaTela(blocos, visivel)).toBe(1);
    expect(blocoNaTela(blocos, visivel, "tras")).toBe(2);
  });

  it("nenhum bloco na tela: -1", () => {
    expect(blocoNaTela(blocos.slice(0, 2), trecho(d, "C", "E"))).toBe(-1);
  });
});

describe("vizinho", () => {
  const blocos = ["a", "b", "c"];

  it("o bloco seguinte ou o anterior", () => {
    expect(vizinho(blocos, 1, "frente")).toBe(2);
    expect(vizinho(blocos, 1, "tras")).toBe(0);
  });

  it("nas pontas (ou sem bloco atual): null", () => {
    expect(vizinho(blocos, 2, "frente")).toBeNull();
    expect(vizinho(blocos, 0, "tras")).toBeNull();
    expect(vizinho(blocos, -1, "frente")).toBeNull();
    expect(vizinho([], 0, "frente")).toBeNull();
  });
});

describe("veuNaPagina", () => {
  const pagina = { left: 100, top: 50, width: 200, height: 400 };

  it("em frações da página, com folga", () => {
    const r = veuNaPagina({ left: 120, top: 90, width: 100, height: 40 }, pagina, 4);
    expect(r.x).toBeCloseTo(16 / 200);
    expect(r.y).toBeCloseTo(36 / 400);
    expect(r.l).toBeCloseTo(108 / 200);
    expect(r.a).toBeCloseTo(48 / 400);
  });

  it("não passa da página", () => {
    const r = veuNaPagina({ left: 98, top: 48, width: 210, height: 10 }, pagina, 4);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.l).toBe(1);
  });
});

describe("uniao", () => {
  it("a menor caixa que contém todas", () => {
    expect(
      uniao([
        { left: 10, top: 20, width: 5, height: 5 },
        { left: 30, top: 5, width: 10, height: 2 },
      ]),
    ).toEqual({ left: 10, top: 5, width: 30, height: 20 });
  });
});
