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

  it("o slider leva a qualquer ponto: clique na trilha e teclado", async () => {
    const slider = await $("footer input[type=range]");
    const porcento = () => browser.execute(() => parseInt(document.querySelector("footer .porcento")?.textContent ?? ""));
    expect(await slider.getAttribute("aria-label")).toBe("Posição no livro");
    // Clique no meio da trilha logo depois de virar a página (o foliate-js ignora navegação nos 100 ms
    // seguintes a uma virada; o slider tenta de novo): vai para perto de 50%, e diz o capítulo.
    await browser.keys(Key.ArrowRight);
    await slider.click();
    await ate(async () => Math.abs((await porcento()) - 50) <= 3, "o clique na trilha não levou ao meio do livro");
    expect(await slider.getAttribute("aria-valuetext")).toMatch(/^\d+% · ./);
    await browser.keys(Key.End);
    await ate(async () => (await porcento()) >= 98, "End não levou ao fim do livro");
    // Volta ao começo do texto (para os testes seguintes): Home e 2%.
    await browser.keys(Key.Home);
    await browser.keys(Key.ArrowRight);
    await browser.keys(Key.ArrowRight);
    await ate(async () => (await porcento()) <= 3, "Home e → não voltaram ao começo");
    await browser.pause(600);
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

  it("os painéis não têm rolagem horizontal", async () => {
    const sobra = (painel) =>
      browser.execute((p) => {
        const c = document.querySelector(`#${p} .conteudo`);
        return c ? c.scrollWidth - c.clientWidth : -1;
      }, painel);
    // A 1000 px, o índice começa fechado (M28c): abre-o (e fica aberto, como antes, para os seguintes).
    const indice = await botao("Índice", "//header");
    if ((await indice.getAttribute("aria-expanded")) !== "true") await indice.click();
    await ate(async () => (await sobra("indice")) === 0, "o índice transborda");
    await botao("Aparência", "//header").click();
    await ate(async () => (await sobra("aparencia")) === 0, "a Aparência transborda");
    await browser.keys(Key.Escape);
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
