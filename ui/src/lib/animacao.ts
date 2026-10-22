// Durações e curva das animações, num só lugar. Valem para os dois leitores (EPUB e PDF) e
// para a biblioteca. Com movimento reduzido (sistema ou preferência), tudo vira 0.
//  - CSS: use var(--duracao-curta|media|longa) e var(--curva) (definidas por aplicarAnimacao);
//  - transições do Svelte (usam Web Animations, que o CSS de movimento reduzido não alcança):
//    use duracao("media") e `curva`.
import { cubicOut } from "svelte/easing";
import { movimentoReduzido } from "./ambiente.svelte";

export const DURACOES = { curta: 120, media: 200, longa: 320 } as const;
export type Duracao = keyof typeof DURACOES;

/** Desaceleração suave no fim: o elemento "chega" sem tranco. Equivale a `curva`. */
export const CURVA_CSS = "cubic-bezier(0.2, 0, 0, 1)";
export const curva = cubicOut;

export function duracao(nome: Duracao): number {
  return movimentoReduzido() ? 0 : DURACOES[nome];
}

/** Define as variáveis CSS de animação (chamado em App.svelte quando o movimento muda). */
export function aplicarAnimacao(reduzido: boolean, raiz = document.documentElement): void {
  for (const [nome, ms] of Object.entries(DURACOES)) {
    raiz.style.setProperty(`--duracao-${nome}`, `${reduzido ? 0 : ms}ms`);
  }
  raiz.style.setProperty("--curva", CURVA_CSS);
}
