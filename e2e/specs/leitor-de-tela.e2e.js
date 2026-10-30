// O WebKitGTK não pode cair quando um leitor de tela lê a interface (e2e/atspi/rodar.sh). Cada tela
// é percorrida inteira, como o Orca faz ao passar por ela.
import { Key, ate, botao, destacar, esperarLivro, moldura, paleta, semQueda } from "./ajuda.js";

const dialogo = (seletor) => $(seletor).waitForDisplayed();

describe("Leitor de tela no EPUB e na biblioteca", () => {
  it("leitor, com o índice aberto", async () => {
    await esperarLivro("Dom Casmurro");
    await $("#indice ol li").waitForExist();
    semQueda();
  });

  it("painel Aparência", async () => {
    await botao("Aparência", "//header").click();
    await $("fieldset").waitForDisplayed();
    semQueda();
    await browser.keys(Key.Escape);
  });

  it("menu Mais opções", async () => {
    await botao("Mais opções", "//header").click();
    await dialogo("#menu-leitor");
    semQueda();
    await browser.keys(Key.Escape);
  });

  it("atalhos (F1)", async () => {
    await browser.keys(Key.F1);
    await dialogo('dialog[aria-labelledby="titulo-atalhos"]');
    semQueda();
    await browser.keys(Key.Escape);
  });

  it("paleta", async () => {
    await browser.keys([Key.Ctrl, "k"]);
    await dialogo('dialog [role="combobox"]');
    semQueda();
    await browser.keys(Key.Escape);
  });

  it("barra de destaque", async () => {
    // A capa não tem frases: vira até o texto (o foliate ignora o que chega logo depois de virar).
    for (let i = 0; i < 3; i++) {
      await browser.keys(Key.ArrowRight);
      await browser.pause(400);
    }
    await browser.keys([Key.Ctrl, "d"]);
    await dialogo(".barra-destaque");
    semQueda();
    await browser.keys(Key.Escape);
    await $(".barra-destaque").waitForDisplayed({ reverse: true });
  });

  it("aba Destaques, com um destaque", async () => {
    await destacar("Verde");
    await paleta("mostrar os destaques");
    await dialogo("#aba-destaques");
    semQueda();
    await browser.keys(Key.Escape);
  });

  it("lado a lado", async () => {
    await paleta("abrir este ponto ao lado");
    await ate(() => moldura("com-lado"), "o lado não abriu");
    semQueda();
    await browser.keys([Key.Ctrl, Key.Shift, "l"]);
    await ate(async () => !(await moldura("com-lado")), "o lado não fechou");
  });

  it("o texto de todas as seções do livro", async () => {
    const secoes = await browser.execute(() => document.querySelector("foliate-view").book.sections.length);
    for (let i = 0; i < secoes; i++) {
      await browser.execute((n) => document.querySelector("foliate-view").goTo(n), i);
      await browser.pause(500);
      semQueda();
    }
  });

  it("biblioteca, com o menu do livro", async () => {
    await botao("Voltar à biblioteca", "//header").click();
    await $("nav[aria-label='Estantes']").waitForDisplayed();
    semQueda();
    await browser.keys([Key.Shift, Key.F10]);
    await dialogo('[role="menu"]');
    semQueda();
    await browser.keys(Key.Escape);
  });
});
