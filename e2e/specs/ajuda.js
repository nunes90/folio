// O que os testes têm em comum. Os elementos são procurados de novo a cada tentativa: a tela
// troca (biblioteca, leitor) e uma referência guardada fica velha.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Key } from "webdriverio";

export { Key };

/**
 * Um botão pelo nome, visível ou escondido só da tela (.rotulo), dentro de `dentro`. O próprio
 * botão: o seletor aria/ às vezes devolve o <span class="rotulo">, que não dá para clicar quando
 * as barras estão só com ícones, e acha também os itens da paleta fechada.
 */
export const botao = (nome, dentro = "//body") =>
  $(`${dentro}//button[normalize-space(.)="${nome}" or @aria-label="${nome}"]`);

/** O texto de um elemento, lido na página ("" se não houver). O getText do WebKitWebDriver não enxerga títulos cortados com text-overflow. */
export const texto = (seletor) =>
  browser.execute((s) => document.querySelector(s)?.textContent?.trim() ?? "", seletor);

/** Espera `f()` dar verdadeiro. */
export const ate = (f, msg, timeout = 20000) => browser.waitUntil(f, { timeout, timeoutMsg: msg });

/** O título do cabeçalho do leitor virar `titulo`. */
export const esperarLivro = (titulo) =>
  ate(async () => (await texto("header h1")) === titulo, `o livro ${titulo} não abriu`);

/** A moldura com ou sem uma classe (foco, com-lado). */
export const moldura = (classe) =>
  browser.execute((c) => !!document.querySelector(".moldura")?.classList.contains(c), classe);

/** Usa a paleta: Ctrl+K, o termo e Enter no primeiro comando. */
export async function paleta(termo) {
  await browser.keys([Key.Ctrl, "k"]);
  const campo = await $('dialog [role="combobox"]');
  await campo.waitForDisplayed();
  await campo.setValue(termo);
  await browser.pause(100);
  await browser.keys(Key.Enter);
  await campo.waitForDisplayed({ reverse: true });
}

/** A barra de destaque aberta (Ctrl+D): escolhe a cor. */
export async function destacar(cor = "Amarelo") {
  await browser.keys([Key.Ctrl, "d"]);
  const barra = await $(".barra-destaque");
  await barra.waitForDisplayed();
  await botao(cor, '//*[contains(@class,"barra-destaque")]').click();
  await barra.waitForDisplayed({ reverse: true });
}

/**
 * Faz a última leitura ter sido há duas horas (mexendo no banco da sessão de teste): ao reabrir
 * o livro, o cartão "Onde você parou" aparece.
 */
export function envelhecerUltimaLeitura() {
  const banco = path.join(process.env.FOLIO_DADOS_TESTE, "io.github.nunes90.folio", "biblioteca.sqlite3");
  execFileSync("python3", [
    "-c",
    "import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); " +
      "c.execute('update sessoes set inicio = inicio - 7200, fim = fim - 7200'); c.commit()",
    banco,
  ]);
}

/** O cartão "Onde você parou": o texto dele, ou "" se não está na tela. */
export const cartaoOndeParou = () =>
  browser.execute(() => document.querySelector(".area-continuacao")?.textContent?.replace(/\s+/g, " ").trim() ?? "");

/** O diálogo de confirmação aberto: o título e o texto ("" e "" se não há). */
export const confirmacao = () =>
  browser.execute(() => {
    const d = document.querySelector("dialog[open]");
    const limpo = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return { titulo: limpo(d?.querySelector("h2")), texto: limpo(d) };
  });

/** Clica num botão do diálogo aberto, pelo nome. */
export const noDialogo = (nome) =>
  browser.execute(
    (n) => [...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.trim() === n)?.click(),
    nome,
  );
