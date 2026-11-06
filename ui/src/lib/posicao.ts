// Slider de posição no livro, igual nos dois formatos: o que ele diz sobre um ponto (o
// aria-valuetext e o balão ao arrastar) e a seção nesse ponto. Funções puras.
import { achatar, itemAtual } from "./sumario";
import type { ItemIndice } from "./foliate";

const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

/**
 * O rótulo do índice no ponto `ponto` (fração do livro no EPUB, página no PDF): o item de maior
 * posição que não passa dele; empate, o último (o mais específico, como no `itemAtual`).
 */
export function rotuloNoPonto(
  itens: ItemIndice[],
  posicoes: Map<string, number>,
  ponto: number,
): string | undefined {
  const href = itemAtual(posicoes, ponto);
  return (
    achatar(itens)
      .find((i) => i.href === href)
      ?.label.trim() || undefined
  );
}

/**
 * Quanto do texto de `doc` vem antes de cada alvo (0 a 1), numa passada só pelo texto: o índice
 * de muitos EPUBs aponta para âncoras dentro de poucos arquivos grandes (o Dom Casmurro: 153
 * entradas em 4), e só o início da seção diria o capítulo errado. Alvo fora do corpo: 0.
 */
export function fracoesDasAncoras(doc: Document, alvos: Node[]): number[] {
  const corpo = doc.body;
  const total = corpo?.textContent?.length ?? 0;
  const res = alvos.map(() => 0);
  if (!corpo || !total) return res;
  const SEGUE = Node.DOCUMENT_POSITION_FOLLOWING;
  const ordem = alvos
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => corpo.contains(n))
    .sort((a, b) =>
      a.n === b.n ? 0 : a.n.compareDocumentPosition(b.n) & SEGUE ? -1 : 1,
    );
  const andar = doc.createTreeWalker(corpo, NodeFilter.SHOW_TEXT);
  let antes = 0;
  let k = 0;
  for (let t = andar.nextNode(); t && k < ordem.length; t = andar.nextNode()) {
    // O texto está no alvo ou depois dele: o alvo começa aqui.
    while (
      k < ordem.length &&
      (ordem[k].n === t || ordem[k].n.compareDocumentPosition(t) & SEGUE)
    ) {
      res[ordem[k++].i] = antes / total;
    }
    antes += t.nodeValue?.length ?? 0;
  }
  for (; k < ordem.length; k++) res[ordem[k].i] = 1;
  return res;
}

/** "12% · Capítulo 3" (EPUB; sem seção, só a porcentagem). */
export function textoDaFracao(f: number, secao?: string): string {
  const p = porcento.format(Math.min(1, Math.max(0, f)));
  return secao ? `${p} · ${secao}` : p;
}

/** "Página 42 de 300 · Capítulo 3" (PDF). */
export function textoDaPagina(
  pagina: number,
  total: number,
  secao?: string,
): string {
  const p = `Página ${pagina} de ${total}`;
  return secao ? `${p} · ${secao}` : p;
}

/** O passo grande do slider (PageUp/PageDown): um décimo, ao menos um passo. */
export function passoGrande(min: number, max: number, passo: number): number {
  return Math.max(passo, Math.round((max - min) / 10 / passo) * passo);
}

/**
 * O valor depois de uma tecla no slider, ou `null` se a tecla não é dele. ↑/→ avançam (→ volta
 * num livro da direita para a esquerda), PageUp/PageDown dão o passo grande, Home/End vão às pontas.
 */
export function valorPelaTecla(
  tecla: string,
  valor: number,
  limites: {
    min: number;
    max: number;
    passo: number;
    grande: number;
    rtl?: boolean;
  },
): number | null {
  const { min, max, passo, grande, rtl } = limites;
  const frente = rtl ? "ArrowLeft" : "ArrowRight";
  const tras = rtl ? "ArrowRight" : "ArrowLeft";
  const deltas: Record<string, number> = {
    ArrowUp: passo,
    [frente]: passo,
    ArrowDown: -passo,
    [tras]: -passo,
    PageUp: grande,
    PageDown: -grande,
  };
  if (tecla === "Home") return min;
  if (tecla === "End") return max;
  const d = deltas[tecla];
  if (d === undefined) return null;
  return Math.min(max, Math.max(min, valor + d));
}

/**
 * Vai à fração `f` do livro (EPUB). O paginador do foliate-js ignora, sem erro, um `goTo` pedido
 * nos 100 ms seguintes a uma virada (`#locked`): se o livro não mudou de lugar, tenta de novo
 * depois. `relocacoes` conta as mudanças de lugar (o evento "relocate").
 */
export async function irParaFracao(
  view: { goToFraction(f: number): Promise<void> } | undefined,
  f: number,
  relocacoes: () => number,
  tentativas = 3,
): Promise<void> {
  for (let i = 0; view && i < tentativas; i++) {
    const antes = relocacoes();
    await view.goToFraction(f);
    if (relocacoes() !== antes) return;
    await new Promise((r) => setTimeout(r, 150));
    if (relocacoes() !== antes) return;
  }
}
