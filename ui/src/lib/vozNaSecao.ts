// O primeiro bloco a falar do capítulo seguinte, sem ir até ele: a voz natural prepara o começo
// dele enquanto o fim do capítulo atual toca (ver `prepararVoz`).
// @ts-expect-error: o foliate-js não tem tipos
import { TTS } from "../vendor/foliate-js/tts.js";
// @ts-expect-error: o foliate-js não tem tipos
import { textWalker } from "../vendor/foliate-js/text-walker.js";
import type { SecaoDoLivro } from "./foliate";
import { blocoParaFala } from "./voz";

/** Blocos vazios seguidos que se aceita pular (capa, imagem) antes de desistir. */
const BLOCOS_A_PULAR = 20;

/** O índice da próxima seção linear depois de `atual` (como o `nextSection` do foliate-js). */
export function secaoSeguinte(secoes: readonly SecaoDoLivro[], atual: number): number | null {
  for (let i = atual + 1; i < secoes.length; i++) {
    if (secoes[i]?.linear !== "no") return i;
  }
  return null;
}

/**
 * O primeiro bloco de `doc` com algo a falar, como o `start()`/`next()` do tts.js o daria ao
 * chegar nele (o mesmo SSML e o Range, para o tipo de trecho), ou `null`.
 */
export function primeiroBlocoFalavel(doc: Document): { ssml: string; range: Range } | null {
  const tts = new TTS(doc, textWalker, () => {}, "sentence");
  let ssml: string | undefined = tts.start();
  for (let i = 0; ssml !== undefined && i < BLOCOS_A_PULAR; i++, ssml = tts.next()) {
    if (blocoParaFala(ssml)) return { ssml, range: tts.block };
  }
  return null;
}

/** O primeiro bloco a falar da seção linear depois de `atual`, carregada à parte. */
export async function primeiroBlocoDaSecaoSeguinte(
  secoes: readonly SecaoDoLivro[],
  atual: number,
): Promise<{ ssml: string; range: Range } | null> {
  const i = secaoSeguinte(secoes, atual);
  const documento = i === null ? undefined : await secoes[i]?.createDocument?.();
  return documento ? primeiroBlocoFalavel(documento) : null;
}
