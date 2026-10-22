// Transição entre telas (biblioteca ↔ leitor): a capa do livro "vira" a área do livro e volta,
// como no app Livros da Apple.
//
// Feita à mão (técnica FLIP), sem a View Transitions API: o WebKitGTK 2.54 anuncia a API, mas
// o processo da webview aborta (SIGABRT) ao capturar a tela, mesmo numa transição mínima.
//
// Para ficar fluida, segue o que a Apple faz:
//  - só transform e opacity (a placa de vídeo anima sem depender da thread principal);
//  - a curva é a mola de lib/animacao.ts (rápida no começo, assenta suave);
//  - nada pesado durante o movimento: os leitores esperam `aguardarTransicao()` antes de
//    carregar o livro.
// O destino é a área do livro na MolduraLeitor, então o efeito é o mesmo para EPUB e PDF.
import { tick } from "svelte";
import { CURVA_CSS, duracao } from "./animacao";

/** Atributo da capa de cada livro na biblioteca (valor: id do livro). */
export const ATRIBUTO_CAPA = "data-capa-livro";
/** Atributo da área do livro na moldura dos leitores. */
export const ATRIBUTO_AREA = "data-area-livro";
/** Atributo da raiz de cada tela (biblioteca ou leitor), que aparece com esmaecimento. */
export const ATRIBUTO_TELA = "data-tela";

const capaDo = (id: string) =>
  document.querySelector<HTMLElement>(`[${ATRIBUTO_CAPA}="${CSS.escape(id)}"]`);
const area = () => document.querySelector<HTMLElement>(`[${ATRIBUTO_AREA}]`);
const tela = () => document.querySelector<HTMLElement>(`[${ATRIBUTO_TELA}]`);

let emCurso: Promise<void> = Promise.resolve();

/** Resolve quando a transição em andamento termina (ou na hora, se não houver nenhuma). */
export function aguardarTransicao(): Promise<void> {
  return emCurso;
}

/**
 * Troca a tela com a animação da capa. `abrir`: da capa (biblioteca) para a área do livro;
 * `fechar`: o caminho inverso. Sem movimento (duração 0) ou sem os elementos, só troca.
 */
export async function transicionar(
  idLivro: string,
  sentido: "abrir" | "fechar",
  atualizar: () => void,
): Promise<void> {
  let terminar!: () => void;
  emCurso = new Promise((resolver) => (terminar = resolver));
  try {
    await animarTroca(idLivro, sentido, atualizar);
  } finally {
    terminar();
  }
}

async function animarTroca(idLivro: string, sentido: "abrir" | "fechar", atualizar: () => void) {
  const ms = duracao("longa");
  // Medidas e cópia antes da troca: depois, a origem não está mais na tela.
  const retanguloArea = sentido === "fechar" ? area()?.getBoundingClientRect() : undefined;
  const capaAntes = sentido === "abrir" ? capaDo(idLivro) : undefined;
  const retanguloCapaAntes = capaAntes?.getBoundingClientRect();
  const copiaAntes = capaAntes?.cloneNode(true);

  atualizar();
  await tick();
  if (!ms) return;

  const capaDepois = sentido === "fechar" ? capaDo(idLivro) : undefined;
  const capa = retanguloCapaAntes ?? capaDepois?.getBoundingClientRect();
  const alvo = retanguloArea ?? area()?.getBoundingClientRect();
  const copia = copiaAntes ?? capaDepois?.cloneNode(true);
  if (!capa || !alvo || !(copia instanceof HTMLElement)) return;

  // O fantasma fica sempre no lugar da capa; o transform o leva até a área do livro.
  const fantasma = criarFantasma(copia, capa);
  document.body.append(fantasma);
  const naCapa = "translate(0px, 0px) scale(1)";
  const naArea = transformParaArea(capa, alvo);
  const [de, para] = sentido === "abrir" ? [naCapa, naArea] : [naArea, naCapa];

  // A capa real (ao fechar) fica escondida até o fantasma pousar sobre ela.
  if (capaDepois) capaDepois.style.visibility = "hidden";
  const movimento = fantasma.animate([{ transform: de }, { transform: para }], {
    duration: ms,
    easing: CURVA_CSS,
    fill: "forwards",
  });
  // Ao abrir, a capa se dissolve na segunda metade, revelando o livro; ao fechar, aparece logo.
  fantasma.animate(
    sentido === "abrir" ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
    sentido === "abrir"
      ? { duration: ms / 2, delay: ms / 2, easing: "ease-out", fill: "forwards" }
      : { duration: ms / 3, easing: "ease-out", fill: "forwards" },
  );
  tela()?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms * 0.6, easing: CURVA_CSS });

  try {
    await movimento.finished;
  } catch {
    // Animação cancelada (ex.: a janela foi fechada): basta limpar.
  } finally {
    fantasma.remove();
    if (capaDepois) capaDepois.style.visibility = "";
  }
}

/**
 * Transform que leva a capa (origem no canto superior esquerdo) a ocupar a altura da área do
 * livro, centralizada. A escala é uniforme: a capa cresce sem distorcer.
 */
export function transformParaArea(capa: DOMRect, alvo: DOMRect): string {
  const escala = alvo.height / capa.height;
  const x = alvo.left + (alvo.width - capa.width * escala) / 2 - capa.left;
  const y = alvo.top - capa.top;
  return `translate(${x}px, ${y}px) scale(${escala})`;
}

function criarFantasma(copia: HTMLElement, lugar: DOMRect): HTMLElement {
  // Decorativo: fora da árvore de acessibilidade e sem receber cliques.
  copia.setAttribute("aria-hidden", "true");
  copia.removeAttribute(ATRIBUTO_CAPA);
  Object.assign(copia.style, {
    position: "fixed",
    left: `${lugar.left}px`,
    top: `${lugar.top}px`,
    width: `${lugar.width}px`,
    height: `${lugar.height}px`,
    margin: "0",
    zIndex: "1000",
    pointerEvents: "none",
    transformOrigin: "0 0",
    transform: "none",
    transition: "none",
    willChange: "transform, opacity",
    boxSizing: "border-box",
  });
  return copia;
}
