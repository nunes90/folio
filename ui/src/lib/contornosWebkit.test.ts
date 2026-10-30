import { describe, expect, it } from "vitest";
import { tirarEspacoAposUltimaQuebra } from "./contornosWebkit";

function doc(html: string): Document {
  const d = document.implementation.createHTMLDocument("t");
  d.body.innerHTML = html;
  return d;
}

describe("tirarEspacoAposUltimaQuebra", () => {
  it("tira o espaço entre o último <br> e o fim do bloco", () => {
    const d = doc("<p>verso um<br>\n  verso dois<br>\n</p>");
    tirarEspacoAposUltimaQuebra(d);
    expect(d.querySelector("p")!.innerHTML).toBe("verso um<br>\n  verso dois<br>");
  });

  it("não toca em quebras seguidas de texto ou de outro elemento", () => {
    const html = "<p>um<br>dois</p><p>três<br>\n<em>quatro</em>\n</p>";
    const d = doc(html);
    tirarEspacoAposUltimaQuebra(d);
    expect(d.body.innerHTML).toBe(html);
  });

  it("não toca no espaço de um bloco sem quebra", () => {
    const html = "<p>texto\n</p>";
    const d = doc(html);
    tirarEspacoAposUltimaQuebra(d);
    expect(d.body.innerHTML).toBe(html);
  });
});
