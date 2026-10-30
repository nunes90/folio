// O caminho principal num EPUB: abrir, virar, F1, modo foco, destacar, lado a lado e voltar.
import { Key, ate, botao, destacar, esperarLivro, moldura, paleta, texto } from "./ajuda.js";

// A fração lida: a porcentagem não muda em poucas páginas de um livro longo; a barra, sim.
const fracao = () =>
  browser.execute(() => document.querySelector(".progresso-leitura span")?.style.transform ?? "");

describe("EPUB", () => {
  it("abre o livro passado ao app", async () => {
    await esperarLivro("Dom Casmurro");
  });

  it("vira a página com as setas e pelo botão", async () => {
    await ate(async () => (await fracao()) !== "", "sem barra de progresso");
    let antes = await fracao();
    for (let i = 0; i < 3; i++) await browser.keys(Key.ArrowRight);
    await ate(async () => (await fracao()) !== antes, "a seta não virou a página");
    // O foliate ignora o que chega nos 100 ms seguintes a uma virada (#locked).
    await browser.pause(400);
    antes = await fracao();
    await botao("Próxima", "//footer").click();
    await ate(async () => (await fracao()) !== antes, "o botão não virou a página");
  });

  it("F1 mostra os atalhos agrupados; Esc fecha", async () => {
    await browser.keys(Key.F1);
    const dialogo = await $('dialog[aria-labelledby="titulo-atalhos"]');
    await dialogo.waitForDisplayed();
    const grupos = await browser.execute(() =>
      [...document.querySelectorAll('dialog[aria-labelledby="titulo-atalhos"] caption')].map((c) => c.textContent),
    );
    expect(grupos).toEqual(["Navegação", "Leitura", "Marcar", "Comparar", "Geral"]);
    await browser.keys(Key.Escape);
    await dialogo.waitForDisplayed({ reverse: true });
  });

  it("Ctrl+Shift+F entra no modo foco; Esc sai", async () => {
    await browser.keys([Key.Ctrl, Key.Shift, "f"]);
    await ate(() => moldura("foco"), "não entrou no modo foco");
    await browser.keys(Key.Escape);
    await ate(async () => !(await moldura("foco")), "não saiu do modo foco");
  });

  it("Ctrl+D destaca a frase atual, e a aba Destaques a mostra", async () => {
    await destacar("Verde");
    await paleta("mostrar os destaques");
    const aba = await $("#aba-destaques");
    await aba.waitForDisplayed();
    expect(await texto("#aba-destaques")).toContain("1");
  });

  it("pela paleta, abre o mesmo ponto ao lado; F6 alterna; no lado, Ctrl+D destaca sem o mouse; Ctrl+Shift+L fecha", async () => {
    await browser.keys(Key.Escape);
    await paleta("abrir este ponto ao lado");
    await ate(() => moldura("com-lado"), "o lado não abriu");
    const noLado = () =>
      browser.execute(() => !!document.activeElement?.closest(".area-lado"));
    await ate(noLado, "o foco não foi ao lado");
    await browser.keys(Key.F6);
    await ate(async () => !(await noLado()), "o F6 não voltou ao principal");
    await browser.keys(Key.F6);
    await ate(noLado, "o F6 não foi de novo ao lado");
    // Modo frase no lado: Ctrl+D abre a barra na frase, Alt+↓ passa à seguinte.
    await browser.keys([Key.Ctrl, "d"]);
    const barra = await $(".barra-destaque");
    await barra.waitForDisplayed();
    await browser.keys([Key.Alt, Key.ArrowDown]);
    await barra.waitForDisplayed();
    await botao("Rosa", '//*[contains(@class,"barra-destaque")]').click();
    await barra.waitForDisplayed({ reverse: true });
    await paleta("mostrar os destaques");
    await ate(async () => (await texto("#aba-destaques")).includes("2"), "o destaque do lado não entrou na lista");
    await browser.keys(Key.Escape);
    await browser.keys([Key.Ctrl, Key.Shift, "l"]);
    await ate(async () => !(await moldura("com-lado")), "o lado não fechou");
  });

  it("volta à biblioteca, e o livro está lá", async () => {
    await botao("Voltar à biblioteca", "//header").click();
    await ate(
      async () => (await texto('ul[aria-label="Livros"] .titulo')) === "Dom Casmurro",
      "o livro não apareceu na biblioteca",
    );
  });
});
