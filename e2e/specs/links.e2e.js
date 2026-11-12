// Links de uma página de PDF (M35c): o que sai do documento só abre no navegador com
// confirmação; o que fica dentro dele vai ao destino, com Alt+← de volta (M35a).
import { Key, ate, confirmacao, esperarLivro, noDialogo, texto } from "./ajuda.js";

const pagina = () => browser.execute(() => document.querySelector("footer input[type=number]")?.value ?? "");

/** Os links da página 1, na ordem do arquivo: web, correio, página 2. */
const links = () =>
  browser.execute(() =>
    [...document.querySelectorAll('.page[data-page-number="1"] .annotationLayer a')].map((a) => a.getAttribute("href")),
  );

const clicarNoLink = (i) =>
  browser.execute((i) => {
    document.querySelectorAll('.page[data-page-number="1"] .annotationLayer a')[i].click();
  }, i);

describe("Links do PDF", () => {
  it("um link para a web pede confirmação; Cancelar não abre nada nem sai do documento", async () => {
    await esperarLivro("Documento com links");
    await ate(async () => (await links()).length === 3, "os links da página não foram desenhados");
    await clicarNoLink(0);
    await ate(async () => (await confirmacao()).titulo !== "", "a confirmação não apareceu");
    const c = await confirmacao();
    expect(c.titulo).toBe("Abrir example.org no navegador?");
    expect(c.texto).toContain("https://example.org/folio");
    await noDialogo("Cancelar");
    await ate(async () => (await confirmacao()).titulo === "", "a confirmação não fechou");
    expect(await browser.execute(() => location.href)).toBe("tauri://localhost");
    expect(await pagina()).toBe("1");
  });

  it("um mailto não abre, e um aviso diz por quê", async () => {
    await clicarNoLink(1);
    await ate(
      async () => (await texto(".avisos")).includes("só endereços da web"),
      "o aviso do link recusado não apareceu",
    );
    expect(await browser.execute(() => location.href)).toBe("tauri://localhost");
  });

  it("um link para outra página vai até ela, com o aviso de voltar; Alt+← volta", async () => {
    await clicarNoLink(2);
    await ate(async () => (await pagina()) === "2", "o link interno não levou à página 2");
    await ate(
      async () => (await texto(".avisos")).includes("Você seguiu um link do documento."),
      "o aviso de voltar não apareceu",
    );
    await browser.keys([Key.Alt, Key.ArrowLeft]);
    await ate(async () => (await pagina()) === "1", "Alt+← não voltou à página 1");
  });

  it("a janela não sai do app, nem se a página mandar", async () => {
    // A segunda barreira, no Rust: qualquer navegação para fora é barrada (antes do M35c, um link
    // de PDF levava a janela inteira para o site, sem caminho de volta).
    await browser.execute(() => {
      location.href = "https://example.org/";
    });
    await browser.pause(1500);
    expect(await browser.execute(() => location.href)).toBe("tauri://localhost");
    expect(await pagina()).toBe("1");
  });
});
