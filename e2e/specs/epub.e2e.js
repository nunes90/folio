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

  it("Ctrl+F busca no texto: conta, anda pelas ocorrências, realça e limpa", async () => {
    const resultado = () => texto('header form[role="search"] [role="status"]');
    // As ocorrências contornadas e a atual realçada, no desenho por cima do texto (o SVG do foliate-js).
    const desenhos = () =>
      browser.execute(() => {
        const doc = document.querySelector("foliate-view").renderer.getContents()[0].doc;
        const svg = doc.defaultView.frameElement.parentElement.querySelector("svg");
        // O contorno e o realce têm a cor de destaque da interface; os destaques do livro (feitos
        // nos testes anteriores) têm as cores deles.
        const cor = svg?.querySelector('g[fill="none"]')?.getAttribute("stroke") ?? window.__corDaBusca;
        window.__corDaBusca = cor;
        return {
          contornos: svg?.querySelectorAll('g[fill="none"]').length ?? 0,
          realces: cor ? (svg?.querySelectorAll(`g[fill="${cor}"]`).length ?? 0) : 0,
        };
      });
    await browser.keys([Key.Ctrl, "f"]);
    const campo = await $('header input[type="search"]');
    await ate(() => campo.isFocused(), "Ctrl+F não levou o foco à busca");
    // Sem acento e em minúsculas: acha "Capitú" do mesmo jeito.
    await campo.setValue("capitu");
    await browser.keys(Key.Enter);
    await ate(async () => /^\d+ de \d+$/.test(await resultado()), "a busca não terminou");
    const [, primeira, total] = (await resultado()).match(/^(\d+) de (\d+)$/).map(Number);
    expect(total).toBeGreaterThan(100);
    await ate(async () => (await desenhos()).contornos > 0, "as ocorrências não foram contornadas");
    await ate(async () => (await desenhos()).realces > 0, "a ocorrência atual não foi realçada");

    // Enter vai à seguinte; Shift+Enter volta. (O foliate-js ignora navegação logo depois de uma virada.)
    await browser.pause(400);
    await browser.keys(Key.Enter);
    await ate(async () => (await resultado()) === `${(primeira % total) + 1} de ${total}`, "Enter não foi à seguinte");
    await browser.pause(400);
    await browser.keys([Key.Shift, Key.Enter]);
    await ate(async () => (await resultado()) === `${primeira} de ${total}`, "Shift+Enter não voltou");

    // O que não existe; e o campo vazio tira tudo do texto.
    await campo.setValue("xyzzy");
    await browser.keys(Key.Enter);
    await ate(async () => (await resultado()) === "Nada encontrado", "devia dizer que não achou");
    await campo.setValue("capitu");
    await browser.keys(Key.Enter);
    await ate(async () => /^\d+ de \d+$/.test(await resultado()), "a segunda busca não terminou");
    await campo.clearValue();
    // clearValue nem sempre dispara o evento de entrada no WebKitWebDriver.
    await browser.execute((c) => c.dispatchEvent(new Event("input", { bubbles: true })), campo);
    await ate(async () => (await resultado()) === "", "o resultado devia sumir");
    await ate(async () => {
      const d = await desenhos();
      return d.contornos === 0 && d.realces === 0;
    }, "as ocorrências deviam sair do texto");
    await browser.execute(() => document.querySelector("foliate-view").renderer.focusView?.());
  });

  it("Ctrl+Shift+B: uma ideia por vez; ↓ e ↑ trocam de bloco; Esc sai", async () => {
    // O bloco em evidência é o que não está esmaecido (os outros ganham data-folio-fora).
    const estado = () =>
      browser.execute(() => {
        const v = document.querySelector("foliate-view");
        const doc = v.renderer.getContents()[0].doc;
        const emEvidencia = [...doc.querySelectorAll("p, h1, h2, h3, h4, li, pre")].filter(
          (el) => !el.closest("[data-folio-fora]"),
        );
        return {
          fluxo: v.renderer.getAttribute("flow"),
          esmaecidos: doc.querySelectorAll("[data-folio-fora]").length,
          blocos: emEvidencia.length,
          texto: emEvidencia[0]?.textContent?.trim().slice(0, 40) ?? "",
        };
      });
    await paleta("30%");
    await browser.pause(800);
    await browser.keys([Key.Ctrl, Key.Shift, "b"]);
    await ate(async () => (await estado()).esmaecidos > 0, "a uma ideia por vez não ligou");
    const primeiro = await estado();
    // O livro passa a rolar, e só um bloco fica em evidência.
    expect(primeiro.fluxo).toBe("scrolled");
    expect(primeiro.blocos).toBe(1);
    expect(primeiro.texto).not.toBe("");

    await browser.keys(Key.ArrowDown);
    await ate(async () => (await estado()).texto !== primeiro.texto, "↓ não passou ao bloco seguinte");
    expect((await estado()).blocos).toBe(1);
    await browser.keys(Key.ArrowUp);
    await ate(async () => (await estado()).texto === primeiro.texto, "↑ não voltou ao bloco anterior");

    await browser.keys(Key.Escape);
    await ate(async () => (await estado()).esmaecidos === 0, "Esc não desligou a uma ideia por vez");
    expect((await estado()).fluxo).toBe("paginated");
  });

  it("volta à biblioteca, e o livro está lá", async () => {
    await botao("Voltar à biblioteca", "//header").click();
    await ate(
      async () => (await texto('ul[aria-label="Livros"] .titulo')) === "Dom Casmurro",
      "o livro não apareceu na biblioteca",
    );
  });
});
