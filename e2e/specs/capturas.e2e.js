// Capturas das telas principais em várias larguras, para comparar antes e depois de uma mudança
// visual (M28). Não confere nada: só salva as imagens em FOLIO_CAPTURAS.
// Nesta pasta: FOLIO_CAPTURAS=/tmp/antes ./virtual.sh npm test
// (FOLIO_TAMANHOS="360x740 1000x750" escolhe as larguras.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { botao, esperarLivro } from "./ajuda.js";

const pasta = process.env.FOLIO_CAPTURAS;
const raiz = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const TAMANHOS = (process.env.FOLIO_TAMANHOS ?? "360x740 600x800 800x700 1000x750 1400x900 2560x1440")
  .split(/\s+/)
  .map((t) => t.split("x").map(Number));

const foto = (nome, l, a) => browser.saveScreenshot(path.join(pasta, `${l}-${nome}.png`));
const abrirPelaPaleta = async (termo) => {
  await browser.keys(["Control", "k"]);
  await browser.pause(400);
  await browser.keys(termo);
  await browser.pause(300);
  await browser.keys("Enter");
};
const naBiblioteca = async () => {
  const voltar = await $("header").$("button*=Voltar");
  if (await voltar.isExisting()) await voltar.click();
  await browser.pause(1200);
};

describe("capturas", () => {
  it("telas principais em cada tamanho", async () => {
    fs.mkdirSync(pasta, { recursive: true });
    await esperarLivro("Dom Casmurro");
    await browser.executeAsync((caminhos, feito) => {
      window.__TAURI_INTERNALS__.invoke("importar_livros", { caminhos }).then(feito, feito);
    }, ["ingles.epub", "espanhol.epub", "texto.pdf"].map((f) => path.join(raiz, "tests/fixtures", f)));
    for (const [l, a] of TAMANHOS) {
      await browser.setWindowSize(l, a);
      await browser.pause(600);
      await naBiblioteca();
      await foto("1-biblioteca", l, a);
      await abrirPelaPaleta("abrir dom casm");
      await esperarLivro("Dom Casmurro");
      await browser.pause(1500);
      // O cartão "Onde você parou" e os avisos ficam de fora.
      await browser.keys("Escape");
      await browser.pause(400);
      await foto("2-leitor-epub", l, a);
      await botao("Aparência", "//header").click();
      await browser.pause(800);
      await foto("3-aparencia", l, a);
      await browser.keys("Escape");
      await browser.pause(400);
      await naBiblioteca();
      await abrirPelaPaleta("abrir documento");
      await esperarLivro("Documento de Teste");
      await browser.pause(1500);
      await browser.keys("Escape");
      await foto("4-leitor-pdf", l, a);
    }
  });
});
