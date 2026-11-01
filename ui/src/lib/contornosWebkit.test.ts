import { describe, expect, it } from "vitest";
import { permitirForAwaitEmStreams, tirarEspacoAposUltimaQuebra } from "./contornosWebkit";

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

describe("permitirForAwaitEmStreams", () => {
  it("lê os pedaços do fluxo e libera o leitor", async () => {
    class Fluxo {
      pedacos = [1, 2];
      liberado = false;
      getReader() {
        return {
          read: async () => {
            const value = this.pedacos.shift();
            return { done: value === undefined, value };
          },
          releaseLock: () => {
            this.liberado = true;
          },
        };
      }
    }
    permitirForAwaitEmStreams(Fluxo.prototype);
    const fluxo = new Fluxo();
    const lidos: unknown[] = [];
    for await (const v of fluxo as unknown as AsyncIterable<unknown>) lidos.push(v);
    expect(lidos).toEqual([1, 2]);
    expect(fluxo.liberado).toBe(true);
  });

  it("não troca o que o navegador já tem", () => {
    const proprio = async function* () {};
    const prototipo = { [Symbol.asyncIterator]: proprio };
    permitirForAwaitEmStreams(prototipo);
    expect(prototipo[Symbol.asyncIterator]).toBe(proprio);
  });
});
