// "Continue daqui" (M22): ao fechar o cartão de "onde você parou", o ponto pisca de leve no
// livro, com o amarelo dos destaques, e some. Só opacidade (estilo Apple, lib/animacao.ts);
// com movimento reduzido, aparece e some sem transição.
import { duracao } from "./animacao";
import { hexDaCor, type EstiloMarcaTexto } from "./destaques";

/** Quanto o ponto fica à vista (ms). */
export const DURACAO_PISCAR = 1600;

/** Uma caixa em coordenadas de `alvo` (ver `piscar`). */
export interface Caixa {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Desenha as caixas sobre `alvo` (que precisa ser o bloco de posição delas: o documento do
 * capítulo, a página do PDF), faz piscar e remove. Decorativo (`aria-hidden`), sem pegar o
 * ponteiro.
 */
export function piscar(alvo: Element, caixas: Caixa[], estilo: EstiloMarcaTexto): void {
  if (!caixas.length) return;
  const doc = alvo.ownerDocument;
  const camada = doc.createElement("div");
  camada.setAttribute("aria-hidden", "true");
  Object.assign(camada.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: "1",
  });
  for (const c of caixas) {
    const marca = doc.createElement("div");
    Object.assign(marca.style, {
      position: "absolute",
      left: `${c.left}px`,
      top: `${c.top}px`,
      width: `${c.width}px`,
      height: `${c.height}px`,
      background: hexDaCor("amarelo"),
      mixBlendMode: estilo.mistura,
      borderRadius: "2px",
    });
    camada.append(marca);
  }
  alvo.append(camada);
  const opacidade = estilo.opacidade;
  if (duracao("media") === 0 || typeof camada.animate !== "function") {
    camada.style.opacity = String(opacidade);
    setTimeout(() => camada.remove(), DURACAO_PISCAR);
    return;
  }
  camada
    .animate(
      [
        { opacity: 0 },
        { opacity: opacidade, offset: 0.2 },
        { opacity: opacidade, offset: 0.6 },
        { opacity: 0 },
      ],
      { duration: DURACAO_PISCAR, easing: "ease-in-out" },
    )
    .finished.finally(() => camada.remove());
}
