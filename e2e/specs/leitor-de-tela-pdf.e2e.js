// A mesma verificação de leitor-de-tela.e2e.js, no leitor de PDF.
import { Key, ate, botao, destacar, moldura, paleta, semQueda } from "./ajuda.js";

describe("Leitor de tela no PDF", () => {
  it("leitor", async () => {
    await $(".textLayer span").waitForExist({ timeout: 20000 });
    semQueda();
  });

  it("painel Aparência", async () => {
    await botao("Aparência", "//header").click();
    await $("fieldset").waitForDisplayed();
    semQueda();
    await browser.keys(Key.Escape);
  });

  it("barra de destaque e aba Destaques", async () => {
    // O painel que fechou ainda muda o zoom da página, e mudar o zoom fecha a barra.
    await browser.pause(800);
    await browser.keys([Key.Ctrl, "d"]);
    await $(".barra-destaque").waitForDisplayed();
    semQueda();
    await browser.keys(Key.Escape);
    await $(".barra-destaque").waitForDisplayed({ reverse: true });
    await browser.pause(400);
    await destacar("Verde");
    await paleta("mostrar os destaques");
    await $("#aba-destaques").waitForDisplayed();
    semQueda();
    await browser.keys(Key.Escape);
  });

  it("lado a lado", async () => {
    await paleta("ao lado 2");
    await ate(() => moldura("com-lado"), "o lado não abriu");
    semQueda();
  });
});
