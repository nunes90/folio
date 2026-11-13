// O caminho principal num PDF: abrir, virar, destacar e a página ao lado.
import {
  Key,
  ate,
  botao,
  cartaoOndeParou,
  destacar,
  envelhecerUltimaLeitura,
  esperarLivro,
  moldura,
  paleta,
} from "./ajuda.js";

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

  it("o texto da página, em parágrafos, para o leitor de tela", async () => {
    await ate(
      () =>
        browser.execute(() =>
          document.querySelector(".texto-acessivel")?.textContent?.includes("Primeira pagina do documento"),
        ),
      "o texto acessível da página 1 não apareceu",
    );
  });

  it("vira a página com a seta", async () => {
    await browser.keys(Key.ArrowRight);
    await ate(async () => (await paginaEm("footer")) === "2", "a seta não virou a página");
    await ate(
      () => browser.execute(() => document.querySelector(".texto-acessivel h2")?.textContent === "Página 2 de 3"),
      "o texto acessível não passou à página 2",
    );
  });

  it("o slider leva a qualquer página pelo teclado; as setas nele não viram a página duas vezes", async () => {
    const slider = await $("footer input[type=range]");
    await slider.click();
    await browser.keys(Key.End);
    await ate(async () => (await paginaEm("footer")) === "3", "End no slider não levou à página 3");
    expect(await slider.getAttribute("aria-valuetext")).toBe("Página 3 de 3");
    await browser.keys(Key.Home);
    await browser.keys(Key.ArrowRight);
    await ate(async () => (await paginaEm("footer")) === "2", "Home e → no slider não levaram à página 2");
    await browser.pause(600);
    expect(await paginaEm("footer")).toBe("2");
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

  it("Ctrl+Shift+B: uma ideia por vez; ↓ move o furo ao bloco seguinte; Esc sai", async () => {
    await browser.keys([Key.Ctrl, Key.Shift, "l"]);
    await ate(async () => !(await moldura("com-lado")), "o lado não fechou");
    await paleta("página 1");
    await browser.pause(600);
    // Um véu sobre a página, com um furo no bloco atual: o furo anda só por transform.
    const furo = () =>
      browser.execute(() => {
        const camada = document.querySelector('.page[data-page-number="1"] .camada-ideia:not(.sem-furo)');
        return camada ? (camada.firstElementChild?.style.transform ?? "") : null;
      });
    await browser.keys([Key.Ctrl, Key.Shift, "b"]);
    await ate(async () => !!(await furo()), "a uma ideia por vez não ligou");
    const primeiro = await furo();
    await browser.keys(Key.ArrowDown);
    await ate(async () => (await furo()) !== primeiro, "↓ não passou ao bloco seguinte");
    await browser.keys(Key.ArrowUp);
    await ate(async () => (await furo()) === primeiro, "↑ não voltou ao bloco anterior");
    await browser.keys(Key.Escape);
    await ate(
      () => browser.execute(() => !document.querySelector(".camada-ideia")),
      "Esc não desligou a uma ideia por vez",
    );
  });

  it("Alt+← volta à página de onde se saltou", async () => {
    await paleta("página 1");
    await ate(async () => (await paginaEm("footer")) === "1", "não foi à página 1");
    await paleta("última página");
    await ate(async () => (await paginaEm("footer")) === "3", "não foi à última página");
    await browser.keys([Key.Alt, Key.ArrowLeft]);
    await ate(async () => (await paginaEm("footer")) === "1", "Alt+← não voltou à página 1");
  });

  it("ao reabrir depois de um tempo, o cartão “Onde você parou” diz a página; Esc o fecha", async () => {
    await paleta("página 2");
    await ate(async () => (await paginaEm("footer")) === "2", "não foi à página 2");
    await botao("Voltar à biblioteca", "//header").click();
    await browser.pause(1500);
    envelhecerUltimaLeitura();
    await paleta("abrir documento");
    await esperarLivro("Documento de Teste");
    await ate(async () => (await cartaoOndeParou()) !== "", "o cartão não apareceu");
    const cartao = await cartaoOndeParou();
    expect(cartao).toContain("Onde você parou");
    expect(cartao).toContain("na página 2");
    // As últimas frases da página anterior.
    expect(cartao).toContain("Mais um paragrafo curto.");
    await browser.keys(Key.Escape);
    await ate(async () => (await cartaoOndeParou()) === "", "Esc não fechou o cartão");
    expect(await paginaEm("footer")).toBe("2");
  });

  it("reabrir o documento leva menos de 5 s (orçamento folgado: pega regressões grosseiras)", async () => {
    // Aqui, numa tela virtual, leva uns 300 ms. O limite não mede desempenho fino (para isso há o
    // FOLIO_MEDIR): só falha se abrir um PDF pequeno passar a demorar uma ordem de grandeza a mais.
    await botao("Voltar à biblioteca", "//header").click();
    await $("nav[aria-label='Estantes']").waitForDisplayed();
    await browser.pause(800);
    const ms = await browser.executeAsync((feito) => {
      const t0 = performance.now();
      const botoes = [...document.querySelectorAll('ul[aria-label="Livros"] button.livro')];
      botoes.find((b) => b.textContent.includes("Documento de Teste")).click();
      const conferir = () => {
        if (document.querySelector('.page[data-loaded="true"] canvas')) feito(Math.round(performance.now() - t0));
        else setTimeout(conferir, 10);
      };
      conferir();
    });
    console.log(`[medida] reabrir o PDF de teste: ${ms} ms`);
    expect(ms).toBeLessThan(5000);
  });
});
