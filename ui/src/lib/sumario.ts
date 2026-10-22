// Sumário de PDF no mesmo formato do índice do EPUB (ItemIndice), para os dois leitores usarem
// o mesmo componente Indice. Funções puras (sem pdf.js), testadas em sumario.test.ts.
import type { ItemIndice } from "./foliate";

/** Item do sumário como o pdf.js entrega (`getOutline()`); só o que usamos. */
export interface ItemSumarioPdf {
  title: string;
  /** Nome do destino (string) ou o destino explícito (array). */
  dest: string | unknown[] | null;
  items: ItemSumarioPdf[];
}

export interface Sumario {
  itens: ItemIndice[];
  /** Destino de cada item, pelo `href` gerado aqui. */
  destinos: Map<string, string | unknown[]>;
}

/** Converte o sumário do pdf.js. Itens sem destino (ex.: links externos) são descartados. */
export function converterSumario(itens: ItemSumarioPdf[] | null): Sumario {
  const destinos = new Map<string, string | unknown[]>();
  let n = 0;
  const converter = (lista: ItemSumarioPdf[]): ItemIndice[] =>
    lista.flatMap((item) => {
      if (item.dest == null) return converter(item.items ?? []);
      // Numera antes dos filhos: os ids seguem a ordem de leitura.
      const href = `pdf-${n++}`;
      destinos.set(href, item.dest);
      const subitems = converter(item.items ?? []);
      return [{ label: item.title, href, ...(subitems.length ? { subitems } : {}) }];
    });
  return { itens: converter(itens ?? []), destinos };
}

/**
 * Item em leitura na página dada: o de maior página que não passa da atual. Empate: o que vem
 * por último no sumário (normalmente a subseção mais específica). Páginas a partir de 1.
 */
export function itemAtual(paginas: Map<string, number>, pagina: number): string | undefined {
  let melhor: { href: string; pagina: number } | undefined;
  for (const [href, p] of paginas) {
    if (p <= pagina && (!melhor || p >= melhor.pagina)) melhor = { href, pagina: p };
  }
  return melhor?.href;
}

/** Itens em ordem de leitura (para achar o rótulo de um href e para o anúncio de seção). */
export function achatar(itens: ItemIndice[]): ItemIndice[] {
  return itens.flatMap((i) => [i, ...achatar(i.subitems ?? [])]);
}
