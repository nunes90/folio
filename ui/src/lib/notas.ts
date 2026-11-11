// Notas de rodapé do EPUB num balão, sem sair da página (M35b). As regras para reconhecer uma
// chamada de nota e o texto dela vêm do footnotes.js do foliate-js (MIT); o balão é nosso (o do
// foliate abre uma segunda <foliate-view> inteira para cada nota).
//
// Os nós são do iframe do livro, outra janela: nada de `instanceof` (ver CLAUDE.md).

const OPS = "http://www.idpf.org/2007/ops";

const tipos = (el: Element | null) => new Set(el?.getAttributeNS(OPS, "type")?.split(/\s+/) ?? []);
const papeis = (el: Element | null) => new Set(el?.getAttribute("role")?.split(/\s+/) ?? []);

/** Um elemento em sobrescrito (`<sup>` ou `vertical-align` alto). */
function sobrescrito(el: Element | null): boolean {
  if (!el) return false;
  if (el.localName === "sup") return true;
  const alinhamento = el.ownerDocument.defaultView?.getComputedStyle(el).verticalAlign ?? "";
  return ["super", "top", "text-top"].includes(alinhamento) || /^\d/.test(alinhamento);
}

/**
 * O link chama uma nota? "sim": o livro diz (`epub:type="noteref"`, `role="doc-noteref"` e
 * parecidos); "talvez": parece (o número em sobrescrito); "nao": um link comum.
 */
export function chamadaDeNota(a: Element): "sim" | "talvez" | "nao" {
  const t = tipos(a);
  const p = papeis(a);
  if (["noteref", "biblioref", "glossref"].some((x) => t.has(x))) return "sim";
  if (["doc-noteref", "doc-biblioref", "doc-glossref"].some((x) => p.has(x))) return "sim";
  if (t.has("backlink") || p.has("doc-backlink")) return "nao";
  const filho = a.children.length === 1 ? a.children[0]! : null;
  return sobrescrito(a) || sobrescrito(filho) || sobrescrito(a.parentElement) ? "talvez" : "nao";
}

export type TipoDeNota = "rodape" | "fim" | "nota" | "referencia" | "definicao";

/** O que o alvo do link é, pelo que o livro declara (`null`: não declara). */
export function tipoDaNota(el: Element): TipoDeNota | null {
  const t = tipos(el);
  const p = papeis(el);
  if (p.has("doc-biblioentry") || t.has("biblioentry")) return "referencia";
  if (p.has("definition") || t.has("glossdef")) return "definicao";
  if (p.has("doc-endnote") || t.has("endnote") || t.has("rearnote")) return "fim";
  if (p.has("doc-footnote") || t.has("footnote")) return "rodape";
  if (p.has("note") || t.has("note")) return "nota";
  return null;
}

export const TITULOS: Record<TipoDeNota, string> = {
  rodape: "Nota de rodapé",
  fim: "Nota de fim",
  nota: "Nota",
  referencia: "Referência",
  definicao: "Definição",
};

const INLINE = new Set(["a", "span", "sup", "sub", "em", "strong", "i", "b", "small", "big"]);
const BLOCOS = "p, li, dd, dt, blockquote, div, h1, h2, h3, h4, h5, h6, pre";

/**
 * O elemento da nota a partir do alvo do link. O alvo costuma ser um elemento de texto (o número
 * da nota, `<a id="n1">`): sobe até o bloco que o contém. Se esse bloco for o próprio body, a
 * nota é o bloco logo depois do alvo.
 */
export function elementoDaNota(alvo: Element): Element | null {
  let el: Element = alvo;
  while (INLINE.has(el.localName) && el.parentElement) el = el.parentElement;
  if (el === alvo.ownerDocument.body) {
    const irmao = alvo.nextElementSibling;
    return irmao && !INLINE.has(irmao.localName) ? irmao : null;
  }
  return el;
}

/**
 * Os parágrafos da nota, em texto, sem os links de volta ao texto (o "↩", ou o número que leva
 * de volta à chamada `idDaChamada`). Vazio se não houver texto.
 */
export function paragrafosDaNota(nota: Element, idDaChamada?: string | null): string[] {
  const copia = nota.cloneNode(true) as Element;
  for (const a of [...copia.querySelectorAll("a")]) {
    const href = a.getAttribute("href") ?? "";
    const volta =
      tipos(a).has("backlink") ||
      papeis(a).has("doc-backlink") ||
      (!!idDaChamada && href.endsWith(`#${idDaChamada}`));
    if (volta) a.remove();
  }
  const blocos = [...copia.querySelectorAll(BLOCOS)].filter((b) => !b.querySelector(BLOCOS));
  const textos = (blocos.length ? blocos : [copia]).map((b) =>
    (b.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
  return textos.filter(Boolean);
}

/** Uma nota que só "parece" nota (sem marcação do livro) só vira balão se for curta. */
export const LIMITE_TALVEZ = 1500;

export interface Nota {
  titulo: string;
  paragrafos: string[];
}

/**
 * A nota que o link chama, achada no documento da seção de destino (`alvo`, o elemento que o
 * `#fragmento` aponta). `null`: não dá para mostrar num balão (sem texto, ou longa demais para
 * algo que só parecia nota): o link segue como um link comum.
 */
export function notaDoLink(
  chamada: Element,
  chance: "sim" | "talvez",
  alvo: Element,
): Nota | null {
  const nota =
    alvo.localName === "aside" || alvo.localName === "li" ? alvo : elementoDaNota(alvo);
  if (!nota) return null;
  const paragrafos = paragrafosDaNota(nota, chamada.getAttribute("id"));
  const tamanho = paragrafos.reduce((n, p) => n + p.length, 0);
  if (!tamanho || (chance === "talvez" && tamanho > LIMITE_TALVEZ)) return null;
  const tipo = tipoDaNota(alvo) ?? tipoDaNota(nota) ?? "nota";
  return { titulo: TITULOS[tipo], paragrafos };
}
