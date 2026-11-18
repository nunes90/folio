// Marcadores de página (M42a), nos dois formatos: Ctrl+B marca e mostra a fitinha, a aba
// Marcadores leva de volta, o marcador fica depois de fechar o livro, e Ctrl+B de novo tira
// (com Desfazer).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Key, ate, botao, esperarLivro, paleta } from "./ajuda.js";

const raiz = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const fita = () => browser.execute(() => !!document.querySelector(".fita"));
const abaMarcadores = () =>
  browser.execute(() => document.querySelector("#aba-marcadores")?.getAttribute("aria-label") ?? "");
const paginaPdf = () => browser.execute(() => document.querySelector("footer input[type=number]")?.value ?? "");
const porcento = () => browser.execute(() => parseInt(document.querySelector("footer .porcento")?.textContent ?? ""));

describe("marcadores", () => {
  it("EPUB: Ctrl+B marca a página e a fitinha aparece; em outra página, some", async () => {
    await esperarLivro("Dom Casmurro");
    await browser.keys(Key.Escape);
    for (let i = 0; i < 4; i++) {
      await browser.keys(Key.ArrowRight);
      // O foliate ignora o que chega nos 100 ms seguintes a uma virada (#locked).
      await browser.pause(250);
    }
    await browser.pause(400);
    expect(await fita()).toBe(false);
    await browser.keys([Key.Ctrl, "b"]);
    await ate(fita, "a fitinha não apareceu");
    // A 1000 px, o índice começa fechado: abre-o e fecha de novo (Esc devolve o foco ao livro).
    await botao("Índice", "//header").click();
    await ate(async () => (await abaMarcadores()) === "Marcadores (1)", "a aba não contou o marcador");
    await browser.keys(Key.Escape);
    await browser.pause(400);
    await browser.keys(Key.ArrowRight);
    await ate(async () => !(await fita()), "a fitinha ficou na página seguinte");
  });

  it("EPUB: a aba Marcadores leva de volta à página marcada", async () => {
    // Para longe: o fim do livro, pelo slider.
    await (await $("footer input[type=range]")).click();
    await browser.keys(Key.End);
    await ate(async () => (await porcento()) >= 98, "End não levou ao fim do livro");
    await ate(async () => !(await fita()), "a fitinha ficou no fim do livro");
    await botao("Índice", "//header").click();
    // Pelo seletor, a cada tentativa: a lista é refeita quando a página muda.
    await browser.execute(() => document.querySelector("#aba-marcadores")?.click());
    await ate(
      () => browser.execute(() => !!document.querySelector("#painel-aba-marcadores li button.ir")),
      "a lista de marcadores não apareceu",
    );
    await browser.execute(() => document.querySelector("#painel-aba-marcadores li button.ir")?.click());
    await ate(fita, "o marcador não levou à página marcada");
  });

  it("EPUB: Ctrl+B na página marcada tira o marcador, com Desfazer", async () => {
    await browser.keys([Key.Ctrl, "b"]);
    await ate(async () => !(await fita()), "a fitinha não sumiu");
    const desfazer = await botao("Desfazer");
    await desfazer.waitForDisplayed();
    await desfazer.click();
    await ate(fita, "o Desfazer não pôs o marcador de volta");
  });

  it("PDF: Ctrl+B marca a página 2, e o marcador fica depois de fechar e abrir o livro", async () => {
    await browser.executeAsync((caminhos, feito) => {
      window.__TAURI_INTERNALS__.invoke("importar_livros", { caminhos }).then(feito, feito);
    }, [path.join(raiz, "tests/fixtures/texto.pdf")]);
    await botao("Voltar à biblioteca", "//header").click();
    await browser.pause(1000);
    await paleta("abrir documento");
    await esperarLivro("Documento de Teste");
    await browser.keys(Key.Escape);
    await paleta("página 2");
    await ate(async () => (await paginaPdf()) === "2", "não foi à página 2");
    await browser.keys([Key.Ctrl, "b"]);
    await ate(fita, "a fitinha não apareceu no PDF");
    await paleta("página 1");
    await ate(async () => !(await fita()), "a fitinha ficou na página 1");
    await botao("Voltar à biblioteca", "//header").click();
    await browser.pause(1000);
    await paleta("abrir documento");
    await esperarLivro("Documento de Teste");
    await browser.keys(Key.Escape);
    await paleta("Ir ao marcador: página 2");
    await ate(async () => (await paginaPdf()) === "2", "o comando da paleta não levou à página 2");
    await ate(fita, "o marcador não ficou depois de reabrir");
  });
});
