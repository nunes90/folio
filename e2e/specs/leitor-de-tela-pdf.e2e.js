// A mesma verificação de leitor-de-tela.e2e.js, no leitor de PDF.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Key, ate, botao, destacar, moldura, paleta, semQueda } from "./ajuda.js";

const fixture = (nome) => path.resolve(fileURLToPath(new URL("../../tests/fixtures/", import.meta.url)), nome);

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

  it("biblioteca com mais livros, depois de ler o PDF até o fim", async () => {
    // A queda achada com o Orca: o card de um livro, ao voltar do leitor (ícones com aria-hidden).
    await browser.execute(
      (c) => window.__TAURI_INTERNALS__.invoke("importar_livros", { caminhos: c }),
      [fixture("minimo.epub"), fixture("dom-casmurro.epub")],
    );
    await paleta("fechar o lado");
    await browser.keys(Key.End);
    await browser.pause(800);
    await botao("Voltar à biblioteca", "//header").click();
    await $("nav[aria-label='Estantes']").waitForDisplayed();
    await browser.pause(1500);
    semQueda();
  });
});
