// Selecionar com o mouse abre a barra de destaque, também ao reabrir o livro depois de um tempo
// (com o cartão "Onde você parou", fechado por "Continuar lendo"). O Lucas viu a barra não aparecer
// na v1.1.0 (AppImage, WebKitGTK 2.50) depois de fechar o cartão; por isso o E2E roda também no
// Ubuntu 22.04, que tem o WebKitGTK do AppImage.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Key, ate, botao, esperarLivro, paleta } from "./ajuda.js";

/** Arrasta o mouse sobre o texto do livro, na altura `fracao` da área, e diz se a barra abriu. */
async function selecionarComOMouse(fracao) {
  const { x, y } = await browser.execute((f) => {
    const r = document.querySelector(".conteudo").getBoundingClientRect();
    return { x: Math.round(r.left + r.width * 0.25), y: Math.round(r.top + r.height * f) };
  }, fracao);
  await browser.action("pointer").move({ x, y }).down().move({ x: x + 200, y, duration: 300 }).up().perform();
  return (await $(".barra-destaque")).waitForDisplayed({ timeout: 3000 }).then(
    () => true,
    () => false,
  );
}

/** A seleção no capítulo à vista (para dizer, se a barra não abriu, se o texto chegou a marcar). */
const selecao = () =>
  browser.execute(() =>
    document
      .querySelector("foliate-view")
      ?.renderer.getContents()
      .map(({ doc }) => doc.getSelection()?.toString() ?? "")
      .join(""),
  );

describe("Seleção com o mouse", () => {
  it("abre a barra de destaque", async () => {
    await esperarLivro("Dom Casmurro");
    await paleta("5%");
    await browser.pause(1000);
    const abriu = await selecionarComOMouse(0.5);
    expect({ abriu, selecao: abriu ? "" : await selecao() }).toEqual({ abriu: true, selecao: "" });
    await browser.keys(Key.Escape);
  });

  it("abre a barra também depois de fechar o cartão “Onde você parou”", async () => {
    await botao("Voltar à biblioteca", "//header").click();
    await browser.pause(1500);
    // A última leitura de duas horas atrás: ao reabrir, o cartão aparece.
    const banco = path.join(process.env.FOLIO_DADOS_TESTE, "io.github.nunes90.folio", "biblioteca.sqlite3");
    execFileSync("python3", [
      "-c",
      "import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); " +
        "c.execute('update sessoes set inicio = inicio - 7200, fim = fim - 7200'); c.commit()",
      banco,
    ]);
    await paleta("abrir dom casm");
    await esperarLivro("Dom Casmurro");
    const continuar = await botao("Continuar lendo", '//*[contains(@class,"area-continuacao")]');
    await continuar.waitForDisplayed();
    await continuar.click();
    await ate(
      () => browser.execute(() => !document.querySelector(".area-continuacao")),
      "o cartão não fechou",
    );
    // Depois do ponto piscar (1,6 s).
    await browser.pause(2000);
    const abriu = await selecionarComOMouse(0.5);
    expect({ abriu, selecao: abriu ? "" : await selecao() }).toEqual({ abriu: true, selecao: "" });
  });
});
