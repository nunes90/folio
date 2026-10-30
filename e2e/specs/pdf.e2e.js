// O caminho principal num PDF: abrir, virar, destacar e a página ao lado.
import { Key, ate, destacar, esperarLivro, moldura, paleta } from "./ajuda.js";

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
});
