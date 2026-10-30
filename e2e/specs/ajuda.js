// O que os testes têm em comum. Os elementos são procurados de novo a cada tentativa: a tela
// troca (biblioteca, leitor) e uma referência guardada fica velha.
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
