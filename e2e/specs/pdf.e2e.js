// O caminho principal num PDF: abrir, virar, destacar e a página ao lado.
import { Key, ate, botao, destacar, esperarLivro, moldura, paleta } from "./ajuda.js";

const paginaEm = (onde) =>
  browser.execute((o) => document.querySelector(`${o} input[type=number]`)?.value ?? "", onde);

describe("PDF", () => {
  it("abre o documento, com o título e o total de páginas", async () => {
    await esperarLivro("Documento de Teste");
    await ate(async () => (await paginaEm("footer")) === "1", "sem a página 1 no rodapé");
    await ate(
      () => browser.execute(() => document.querySelector("footer input[type=number]")?.max === "3"),
      "o rodapé não diz o total de 3 páginas",
    );
  });

  it("a camada de texto tem o texto do documento", async () => {
    await ate(
      () => browser.execute(() => !!document.querySelector(".textLayer span")?.textContent),
      "a camada de texto não apareceu",
    );
  });

  it("vira a página com a seta", async () => {
    await browser.keys(Key.ArrowRight);
    await ate(async () => (await paginaEm("footer")) === "2", "a seta não virou a página");
  });

  it("Ctrl+D destaca a frase atual, desenhada na página", async () => {
    await destacar("Azul");
    await ate(
      () => browser.execute(() => document.querySelectorAll(".camada-destaques > div").length > 0),
      "o destaque não foi desenhado",
    );
  });

  it("“ao lado 3” abre a página 3 ao lado; a página do principal não muda", async () => {
    await paleta("ao lado 3");
    await ate(() => moldura("com-lado"), "o lado não abriu");
    await ate(async () => (await paginaEm(".rodape-lado")) === "3", "o lado não está na página 3");
    expect(await paginaEm(".rodape-principal")).toBe("2");
  });

  it("no lado, Ctrl+D destaca sem o mouse: Alt+↓ passa de frase; a barra não oferece Ouvir", async () => {
    await ate(
      () => browser.execute(() => !!document.querySelector(".area-lado .textLayer span")),
      "a camada de texto do lado não apareceu",
    );
    await browser.keys([Key.Ctrl, "d"]);
    const barra = await $(".barra-destaque");
    await barra.waitForDisplayed();
    const selecao = () => browser.execute(() => window.getSelection()?.toString() ?? "");
    await ate(async () => (await selecao()).startsWith("Terceira"), "a seleção não está na frase do lado");
    await browser.keys([Key.Alt, Key.ArrowDown]);
    await ate(async () => (await selecao()).startsWith("Ultima"), "o Alt+↓ não passou de frase");
    expect(await botao("Ouvir", '//*[contains(@class,"barra-destaque")]').isExisting()).toBe(false);
    await botao("Verde", '//*[contains(@class,"barra-destaque")]').click();
    await barra.waitForDisplayed({ reverse: true });
    await ate(
      () => browser.execute(() => document.querySelectorAll(".area-lado .camada-destaques > div").length > 0),
      "o destaque não foi desenhado no lado",
    );
  });

  it("com o lado aberto, o rodapé cabe: nada invade a outra metade nem sai da janela", async () => {
    const caixas = await browser.execute(() => {
      const caixa = (s) => document.querySelector(s).getBoundingClientRect();
      const dentro = (s, de) =>
        [...document.querySelectorAll(`${s} button, ${s} output, ${s} input`)].every((el) => {
          const r = el.getBoundingClientRect();
          return r.left >= de.left - 1 && r.right <= de.right + 1;
        });
      const principal = caixa(".rodape-principal");
      const lado = caixa(".rodape-lado");
      return {
        principalDentro: dentro(".rodape-principal", principal),
        ladoDentro: dentro(".rodape-lado", lado),
        naJanela: lado.right <= innerWidth + 1,
        altura: caixa("footer").height,
      };
    });
    expect(caixas).toMatchObject({ principalDentro: true, ladoDentro: true, naJanela: true });
    // Duas linhas, no máximo: mais que isso rouba a altura do livro.
    expect(caixas.altura).toBeLessThan(100);
  });
});
