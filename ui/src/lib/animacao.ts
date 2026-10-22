// Durações e curva das animações, num só lugar. Valem para os dois leitores (EPUB e PDF) e
// para a biblioteca. Com movimento reduzido (sistema ou preferência), tudo vira 0.
//  - CSS: use var(--duracao-curta|media|longa) e var(--curva) (definidas por aplicarAnimacao);
//  - transições do Svelte e Web Animations (que o CSS de movimento reduzido não alcança):
//    use duracao("media"), `curva` (função) ou CURVA_CSS (texto).
//
// Inspiração: as animações da Apple. A curva é uma mola com amortecimento crítico (como a
// mola "smooth" do SwiftUI): começa rápida e assenta suave, sem quicar. Por ser concentrada
// no começo, a animação parece ágil mesmo durando um pouco mais que uma curva comum.
import { movimentoReduzido } from "./ambiente.svelte";

export const DURACOES = { curta: 160, media: 280, longa: 450 } as const;
export type Duracao = keyof typeof DURACOES;

/** "Resposta" da mola em segundos: quanto menor, mais rápida (SwiftUI usa 0,5 na smooth). */
const RESPOSTA_MOLA = 0.35;
/** Tempo (s) sobre o qual a curva é traçada; a mola já assentou (~99,7%) ao fim dele. */
const TEMPO_MOLA = 0.45;

/** Posição de uma mola criticamente amortecida, solta do 0 rumo ao 1, no instante `s`. */
function posicaoMola(s: number): number {
  const w = (2 * Math.PI) / RESPOSTA_MOLA;
  return 1 - Math.exp(-w * s) * (1 + w * s);
}

/** A mola como curva de animação: t de 0 a 1 (fração da duração) → progresso de 0 a 1. */
export function curva(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Normalizada para chegar exatamente a 1 no fim.
  return posicaoMola(t * TEMPO_MOLA) / posicaoMola(TEMPO_MOLA);
}

/** A mesma mola como texto CSS `linear(...)` (amostrada em pontos, que o navegador interpola). */
export function curvaLinearCss(pontos = 32): string {
  const valores = Array.from({ length: pontos + 1 }, (_, i) =>
    Number(curva(i / pontos).toFixed(4)),
  );
  return `linear(${valores.join(", ")})`;
}

/** Aproximação da mola em cubic-bezier, para WebViews sem `linear()`. */
const CURVA_RESERVA = "cubic-bezier(0.2, 0.9, 0.25, 1)";

/** Curva em CSS: a mola, se o navegador entende `linear()`; senão, a aproximação. */
export const CURVA_CSS =
  typeof CSS !== "undefined" && CSS.supports?.("transition-timing-function", "linear(0, 1)")
    ? curvaLinearCss()
    : CURVA_RESERVA;

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
