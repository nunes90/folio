// Um livro não roda código nem sai para a rede (M31). O foliate-js mostra cada capítulo num iframe
// com `sandbox="allow-same-origin allow-scripts"` (o WebKit exige, para os eventos): a única
// barreira entre um <script> dentro de um EPUB e os comandos do app (`parent.__TAURI_INTERNALS__`)
// é a CSP do tauri.conf.json. Se este teste falhar, alguém a afrouxou.
//
// O hostil.epub (tests/fixtures/gerar.py) tenta de todos os jeitos comuns e aponta para o
// servidor que este teste sobe: nenhum pedido pode chegar.
import http from "node:http";
import { ate, confirmacao, noDialogo, texto } from "./ajuda.js";

const PORTA = 47811;
const pedidos = [];
let servidor;

/** O documento do capítulo: os atributos que um script teria marcado, e o que há em volta. */
const estado = () =>
  browser.execute(() => {
    const doc = document.querySelector("foliate-view")?.renderer?.getContents?.()?.[0]?.doc;
    return {
      aberto: !!doc,
      scripts: doc?.querySelectorAll("script").length ?? 0,
      marcas: doc ? [...doc.documentElement.attributes].map((a) => a.name).filter((n) => n.startsWith("data-")) : [],
      invadido: document.documentElement.getAttribute("data-invadido"),
      endereco: location.href,
    };
  });

const clicarNoLivro = (id) =>
  browser.execute((id) => {
    const doc = document.querySelector("foliate-view").renderer.getContents()[0].doc;
    doc.getElementById(id).click();
  }, id);

describe("Um EPUB hostil", () => {
  before(async () => {
    servidor = http.createServer((pedido, resposta) => {
      pedidos.push(pedido.url);
      resposta.end("ok");
    });
    await new Promise((feito, falhou) => servidor.once("error", falhou).listen(PORTA, "127.0.0.1", feito));
  });

  after(() => servidor?.close());

  it("o servidor do teste recebe pedidos (controle)", async () => {
    await fetch(`http://127.0.0.1:${PORTA}/controle`);
    expect(pedidos).toEqual(["/controle"]);
    pedidos.length = 0;
  });

  it("nenhum script do livro roda", async () => {
    await ate(async () => (await estado()).aberto, "o livro não abriu");
    expect(await texto("header h1")).toBe("Hostil");
    // Tempo para o que fosse rodar ou carregar.
    await browser.pause(1500);
    const e = await estado();
    // Os scripts estão no documento (o teste não passa só porque foram tirados do livro)...
    expect(e.scripts).toBe(2);
    // ...e nenhum rodou: nem o embutido, nem o do arquivo, nem o onerror.
    expect(e.marcas).toEqual([]);
    expect(e.invadido).toBe(null);
  });

  it("o link javascript: não roda e o link externo não abre sem confirmação", async () => {
    await clicarNoLivro("js");
    await clicarNoLivro("fora");
    await browser.pause(1000);
    const e = await estado();
    expect(e.marcas).toEqual([]);
    expect(e.endereco).toBe("tauri://localhost");
    expect((await browser.getWindowHandles()).length).toBe(1);
    // O link externo só pede confirmação (M35c); sem ela, nada abre.
    expect((await confirmacao()).titulo).toBe("Abrir 127.0.0.1 no navegador?");
    await noDialogo("Cancelar");
  });

  it("nada sai para a rede", async () => {
    // Imagem, CSS, fonte, iframe, objeto, áudio, fetch e o link: nenhum pedido.
    expect(pedidos).toEqual([]);
  });
});
