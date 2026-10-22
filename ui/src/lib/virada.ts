// Animação ao virar a página, igual para EPUB e PDF (aplicada pela MolduraLeitor na área do
// livro). Estilo Apple: mola de lib/animacao.ts, só transform e opacity. Curta e discreta:
// virar a página se repete centenas de vezes numa leitura e não deve chamar atenção.
//
// A página antiga não pode ser capturada (no EPUB ela vive num iframe e a View Transitions
// API derruba o WebKitGTK), então a animação é sempre da página NOVA entrando.
import { CURVA_CSS, duracao } from "./animacao";

export type EstiloVirada = "deslizar" | "virar" | "esmaecer" | "nenhuma";

/** Lado de onde a página nova vem: "direita" ao avançar (em livros da esquerda para a direita). */
export type Sentido = "direita" | "esquerda";

/** Quadros (keyframes) de cada estilo; `null` = sem animação. */
export function quadrosDaVirada(estilo: EstiloVirada, sentido: Sentido): Keyframe[] | null {
  const lado = sentido === "direita" ? 1 : -1;
  switch (estilo) {
    case "deslizar":
      // Deslocamento mínimo: só o bastante para indicar a direção.
      return [
        { transform: `translateX(${lado * 3}%)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ];
    case "virar":
      // A folha gira a partir da lombada: avançando, a lombada fica à esquerda.
      return [
        {
          transformOrigin: sentido === "direita" ? "left center" : "right center",
          transform: `perspective(1600px) rotateY(${lado * -60}deg)`,
          opacity: 0.3,
        },
        {
          transformOrigin: sentido === "direita" ? "left center" : "right center",
          transform: "perspective(1600px) rotateY(0deg)",
          opacity: 1,
        },
      ];
    case "esmaecer":
      return [{ opacity: 0 }, { opacity: 1 }];
    case "nenhuma":
      return null;
  }
}

let atual: Animation | undefined;

/** Interrompe a virada em andamento (antes de navegar de novo: o leitor mede a área sem transform). */
export function cancelarVirada(): void {
  atual?.cancel();
  atual = undefined;
}

/** Anima a página nova entrando em `elemento`. Sem movimento (duração 0), não faz nada. */
export function animarVirada(elemento: HTMLElement, estilo: EstiloVirada, sentido: Sentido): void {
  const ms = duracao("curta");
  const quadros = quadrosDaVirada(estilo, sentido);
  if (!ms || !quadros) return;
  cancelarVirada();
  atual = elemento.animate(quadros, { duration: ms, easing: CURVA_CSS });
}
