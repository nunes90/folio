// O que o sistema pede, via media queries; reativo (muda se o usuário alterar o sistema com o
// app aberto). Combinado com as preferências, decide o tema e o movimento efetivos.
import { preferencias } from "./preferencias.svelte";
import { resolverTema, type TemaEfetivo } from "./temas";

function consulta(media: string) {
  return window.matchMedia?.(media);
}

const escuro = consulta("(prefers-color-scheme: dark)");
const contraste = consulta("(prefers-contrast: more)");
const movimento = consulta("(prefers-reduced-motion: reduce)");
// Janela estreita (ex.: metade de uma tela de 1366 px num compositor tiling): os painéis do
// leitor passam a cobrir o livro em vez de espremê-lo. Em `rem` do navegador (16 px).
const estreita = consulta("(max-width: 56rem)");

export const sistema = $state({
  escuro: escuro?.matches ?? false,
  contraste: contraste?.matches ?? false,
  reduzMovimento: movimento?.matches ?? false,
  estreita: estreita?.matches ?? false,
});

escuro?.addEventListener("change", (e) => (sistema.escuro = e.matches));
contraste?.addEventListener("change", (e) => (sistema.contraste = e.matches));
movimento?.addEventListener("change", (e) => (sistema.reduzMovimento = e.matches));
estreita?.addEventListener("change", (e) => (sistema.estreita = e.matches));

export function temaEfetivo(): TemaEfetivo {
  return resolverTema(preferencias.tema, sistema);
}

export function movimentoReduzido(): boolean {
  return preferencias.movimento === "reduzido" || sistema.reduzMovimento;
}
