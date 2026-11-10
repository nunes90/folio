// A busca no texto do EPUB (M32). O foliate-js acha as ocorrências (search.js: sem diferenciar
// maiúsculas nem acentos) e as contorna no texto; aqui fica o que não depende dele: a lista em
// ordem de leitura, por onde começar, a ocorrência vizinha e o texto do resultado.

/** Uma ocorrência: onde está (CFI) e o texto em volta. */
export interface Ocorrencia {
  cfi: string;
  trecho: string;
}

/** O que o `view.search` do foliate-js entrega a cada passo. */
export type PassoDaBusca =
  | "done"
  | { progress: number }
  | { label: string; subitems: { cfi: string; excerpt: Trecho }[] }
  | { cfi: string; excerpt: Trecho };

interface Trecho {
  pre?: string;
  match?: string;
  post?: string;
}

const textoDoTrecho = (t: Trecho | undefined) =>
  `${t?.pre ?? ""}${t?.match ?? ""}${t?.post ?? ""}`.replace(/\s+/g, " ").trim();

/** As ocorrências de um passo da busca (nenhuma, nos passos de andamento e no fim). */
export function ocorrenciasDoPasso(passo: PassoDaBusca): Ocorrencia[] {
  if (passo === "done" || "progress" in passo) return [];
  const itens = "subitems" in passo ? passo.subitems : [passo];
  return itens.map((i) => ({ cfi: i.cfi, trecho: textoDoTrecho(i.excerpt) }));
}

/**
 * Por onde a busca começa: a primeira ocorrência a partir de onde se está lendo (`comparar` é o
 * `compare` dos CFIs: negativo se o primeiro vem antes). Depois da última, volta ao começo.
 */
export function primeiraDesde(
  ocorrencias: Ocorrencia[],
  aqui: string | undefined,
  comparar: (a: string, b: string) => number,
): number {
  if (!aqui) return 0;
  const i = ocorrencias.findIndex((o) => {
    try {
      return comparar(o.cfi, aqui) >= 0;
    } catch {
      return false;
    }
  });
  return Math.max(i, 0);
}

/** A ocorrência seguinte ou a anterior, dando a volta nas pontas. */
export function vizinha(atual: number, total: number, anterior: boolean): number {
  if (total === 0) return -1;
  return (atual + (anterior ? -1 : 1) + total) % total;
}

/** Dois termos pedem a mesma busca? (Espaços nas pontas e maiúsculas não contam.) */
export function mesmoTermo(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** O resultado, como no PDF: "3 de 12", "Nada encontrado", "Buscando…". */
export function textoDaBusca(estado: { buscando: boolean; atual: number; total: number }): string {
  if (estado.buscando) return "Buscando…";
  if (estado.total === 0) return "Nada encontrado";
  return `${estado.atual + 1} de ${estado.total}`;
}
