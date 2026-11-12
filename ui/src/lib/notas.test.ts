import { describe, expect, it } from "vitest";
import { chamadaDeNota, elementoDaNota, notaDoLink, paragrafosDaNota, tipoDaNota } from "./notas";

/** Um documento XHTML de outra janela, como o do livro (os nós não são desta janela). */
function livro(corpo: string): Document {
  const quadro = document.createElement("iframe");
  document.body.append(quadro);
  const doc = quadro.contentDocument!;
  doc.body.innerHTML = corpo;
  return doc;
}

describe("chamadaDeNota", () => {
  it("o livro declara: sim", () => {
    const d = livro(`
      <a id="a" href="#n1">1</a>
      <a id="b" href="#n1" role="doc-noteref">1</a>`);
    d.getElementById("a")!.setAttributeNS("http://www.idpf.org/2007/ops", "epub:type", "noteref");
    expect(chamadaDeNota(d.getElementById("a")!)).toBe("sim");
    expect(chamadaDeNota(d.getElementById("b")!)).toBe("sim");
  });

  it("um número em sobrescrito: talvez; um link comum, ou de volta: não", () => {
    const d = livro(`
      <a id="sup" href="#n1"><sup>1</sup></a>
      <sup><a id="dentro" href="#n2">2</a></sup>
      <a id="estilo" href="#n3" style="vertical-align: super">3</a>
      <a id="comum" href="cap2.xhtml">o capítulo seguinte</a>
      <a id="volta" href="#r1" role="doc-backlink"><sup>↩</sup></a>`);
    const de = (id: string) => chamadaDeNota(d.getElementById(id)!);
    expect([de("sup"), de("dentro"), de("estilo")]).toEqual(["talvez", "talvez", "talvez"]);
    expect([de("comum"), de("volta")]).toEqual(["nao", "nao"]);
  });
});

describe("tipoDaNota", () => {
  it("pelo papel ou pelo epub:type", () => {
    const d = livro(`<aside id="a" role="doc-footnote"></aside><li id="b" role="doc-endnote"></li><p id="c"></p>`);
    expect(tipoDaNota(d.getElementById("a")!)).toBe("rodape");
    expect(tipoDaNota(d.getElementById("b")!)).toBe("fim");
    expect(tipoDaNota(d.getElementById("c")!)).toBe(null);
  });
});

describe("elementoDaNota", () => {
  it("do número da nota sobe até o parágrafo", () => {
    const d = livro(`<p id="p"><a id="n1">1</a> O texto da nota.</p>`);
    expect(elementoDaNota(d.getElementById("n1")!)?.id).toBe("p");
  });

  it("um alvo solto no body: a nota é o bloco seguinte", () => {
    const d = livro(`<a id="n1"></a><p id="p">O texto da nota.</p>`);
    expect(elementoDaNota(d.getElementById("n1")!)?.id).toBe("p");
  });
});

describe("paragrafosDaNota", () => {
  it("tira os links de volta e junta os espaços, um texto por parágrafo", () => {
    const d = livro(`
      <aside id="n">
        <p><a href="cap1.xhtml#r1">1</a> Primeiro
           parágrafo da nota.</p>
        <p>Segundo. <a href="#r1" role="doc-backlink">↩</a></p>
      </aside>`);
    expect(paragrafosDaNota(d.getElementById("n")!, "r1")).toEqual(["Primeiro parágrafo da nota.", "Segundo."]);
  });

  it("sem parágrafos dentro, o texto todo", () => {
    const d = livro(`<li id="n">Uma nota curta.</li>`);
    expect(paragrafosDaNota(d.getElementById("n")!)).toEqual(["Uma nota curta."]);
  });
});

describe("notaDoLink", () => {
  it("a nota com o título do tipo", () => {
    const d = livro(`
      <p><a id="r1" href="#n1"><sup>1</sup></a></p>
      <aside id="n1" role="doc-footnote"><p><a href="#r1">1</a> A nota.</p></aside>`);
    expect(notaDoLink(d.getElementById("r1")!, "sim", d.getElementById("n1")!)).toEqual({
      titulo: "Nota de rodapé",
      paragrafos: ["A nota."],
    });
  });

  it("o que só parecia nota e é longo demais segue como link", () => {
    const longo = "palavra ".repeat(400);
    const d = livro(`<a id="r" href="#x"><sup>1</sup></a><p id="x">${longo}</p>`);
    expect(notaDoLink(d.getElementById("r")!, "talvez", d.getElementById("x")!)).toBe(null);
    expect(notaDoLink(d.getElementById("r")!, "sim", d.getElementById("x")!)?.titulo).toBe("Nota");
  });

  it("sem texto, não há balão", () => {
    const d = livro(`<a id="r" href="#x"><sup>1</sup></a><p id="x"><a href="#r">1</a></p>`);
    expect(notaDoLink(d.getElementById("r")!, "sim", d.getElementById("x")!)).toBe(null);
  });
});
