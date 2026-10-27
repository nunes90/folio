// Uma ideia por vez (M19): só o bloco atual (parágrafo, título, item) em evidência, o resto
// esmaecido. É só visual: o texto não muda e o leitor de tela continua lendo tudo. O livro
// passa a rolagem contínua enquanto o modo está ligado: ↑ e ↓ passam de bloco e o texto rola
// até o bloco novo ficar no meio da tela.
//  - EPUB: os elementos em volta do bloco ganham `data-folio-fora` e ficam com opacidade
//    menor (CSS posto no capítulo); a troca de bloco esmaece com transição de opacidade.
//  - PDF: um véu da cor do papel sobre a página, com um furo no bloco atual (LeitorPdf).
import { aparar, blocosDe } from "./frases";

/** Opacidade do que está fora do bloco atual. */
export const OPACIDADE_FORA = 0.35;

/** Um bloco do EPUB: o texto dele (sem os espaços das pontas) e o elemento que o abre. */
export interface Bloco {
  trecho: Range;
  elemento: Element;
}

/** Os blocos do capítulo, na ordem (os de `blocosDe`, a mesma divisão do modo frase). */
export function blocosDoDocumento(doc: Document): Bloco[] {
  return blocosDe(doc).map((r) => {
    const inicio = r.startContainer;
    const elemento = inicio instanceof Element ? inicio : (inicio.parentElement ?? doc.body);
    return { trecho: aparar(r), elemento };
  });
}

/**
 * O que esmaecer para que só o bloco fique em evidência: os irmãos de cada elemento no
 * caminho do bloco até o body (a opacidade de um ancestral alcançaria o próprio bloco) e, dentro
 * do elemento do bloco, os filhos que começam depois dele (blocos aninhados).
 */
export function emVolta({ trecho, elemento }: Bloco): Element[] {
  const fora: Element[] = [];
  for (const filho of elemento.children)
    if (trecho.comparePoint(filho, 0) > 0) fora.push(filho);
  const corpo = elemento.ownerDocument.body;
  for (let e: Element = elemento; e !== corpo && e.parentElement; e = e.parentElement)
    for (const irmao of e.parentElement.children) if (irmao !== e) fora.push(irmao);
  return fora;
}

const ATRIBUTO = "data-folio-fora";
const ID_ESTILO = "folio-uma-ideia";

/**
 * Esmaece o capítulo em volta de `bloco` (`null`: nada esmaecido). `transicao` é a duração e
 * a curva da troca, ex.: "280ms ease" ("0ms" com movimento reduzido).
 */
export function esmaecer(doc: Document, bloco: Bloco | null, transicao: string): void {
  let estilo = doc.getElementById(ID_ESTILO);
  if (!estilo && bloco) {
    estilo = doc.createElement("style");
    estilo.id = ID_ESTILO;
    (doc.head ?? doc.documentElement).append(estilo);
  }
  if (estilo)
    estilo.textContent =
      `body * { transition: opacity ${transicao}; }\n` +
      `[${ATRIBUTO}] { opacity: ${OPACIDADE_FORA} !important; }`;
  const novos = new Set(bloco ? emVolta(bloco) : []);
  for (const el of doc.querySelectorAll(`[${ATRIBUTO}]`))
    if (!novos.has(el)) el.removeAttribute(ATRIBUTO);
  for (const el of novos) el.setAttribute(ATRIBUTO, "");
}

/** O intervalo `a` tem alguma parte dentro de `b`? */
export function cruza(a: Range, b: Range): boolean {
  // START_TO_END: o fim de `a` comparado ao início de `b`; END_TO_START: o início de `a` ao fim de `b`.
  return (
    a.compareBoundaryPoints(Range.START_TO_END, b) > 0 &&
    a.compareBoundaryPoints(Range.END_TO_START, b) < 0
  );
}

export type Sentido = "frente" | "tras";

/**
 * O bloco a pôr em evidência no trecho visível: o primeiro que aparece nele (ou o último,
 * chegando de trás). -1 se nenhum aparece (ex.: uma página só com imagem).
 */
export function blocoNaTela(blocos: Range[], visivel: Range, sentido: Sentido = "frente"): number {
  const na = (r: Range) => cruza(r, visivel);
  if (sentido === "frente") return blocos.findIndex(na);
  for (let i = blocos.length - 1; i >= 0; i--) if (na(blocos[i]!)) return i;
  return -1;
}

/** O bloco vizinho de `atual` (`null` na ponta: passar ao capítulo ou à página vizinha). */
export function vizinho(blocos: unknown[], atual: number, sentido: Sentido): number | null {
  if (atual < 0 || atual >= blocos.length) return null;
  const i = sentido === "frente" ? atual + 1 : atual - 1;
  return i >= 0 && i < blocos.length ? i : null;
}

/** Uma caixa na tela (como a de `getBoundingClientRect`). */
interface Caixa {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * O véu de um bloco do PDF em frações da página (como os destaques: não depende do zoom), com
 * uma folga de `folga` pixels em volta (as caixas da camada de texto são justas nas letras),
 * sem passar da página.
 */
export function veuNaPagina(bloco: Caixa, pagina: Caixa, folga = 4) {
  const x0 = Math.max(0, bloco.left - folga - pagina.left);
  const y0 = Math.max(0, bloco.top - folga - pagina.top);
  const x1 = Math.min(pagina.width, bloco.left + bloco.width + folga - pagina.left);
  const y1 = Math.min(pagina.height, bloco.top + bloco.height + folga - pagina.top);
  return {
    x: x0 / pagina.width,
    y: y0 / pagina.height,
    l: Math.max(0, x1 - x0) / pagina.width,
    a: Math.max(0, y1 - y0) / pagina.height,
  };
}

const rolagens = new WeakMap<Element, number>();

/**
 * Rola `el` até `topo` em `ms` com a curva dada (a mesma animação do EPUB; o `smooth` do
 * navegador tem duração própria). Uma rolagem nova cancela a que estiver em curso.
 */
export function rolarSuave(el: Element, topo: number, ms: number, curva: (t: number) => number) {
  cancelAnimationFrame(rolagens.get(el) ?? 0);
  const de = el.scrollTop;
  const ate = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, topo));
  if (ms <= 0 || Math.abs(ate - de) < 1) {
    el.scrollTop = ate;
    return;
  }
  let inicio: number | undefined;
  const passo = (agora: number) => {
    inicio ??= agora;
    const t = Math.min(1, (agora - inicio) / ms);
    el.scrollTop = de + (ate - de) * curva(t);
    if (t < 1) rolagens.set(el, requestAnimationFrame(passo));
  };
  rolagens.set(el, requestAnimationFrame(passo));
}

/** A menor caixa que contém todas as dadas (uma ideia do PDF junta pedaços espalhados). */
export function uniao(caixas: Caixa[]): Caixa {
  const left = Math.min(...caixas.map((c) => c.left));
  const top = Math.min(...caixas.map((c) => c.top));
  const right = Math.max(...caixas.map((c) => c.left + c.width));
  const bottom = Math.max(...caixas.map((c) => c.top + c.height));
  return { left, top, width: right - left, height: bottom - top };
}
