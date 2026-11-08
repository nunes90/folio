// O texto em blocos (parágrafos, títulos, itens) e frases (M17): a base de "destacar a frase
// atual", "ouvir a partir daqui" e, depois, "uma ideia por vez". As regras são as do tts.js do
// foliate-js (as mesmas tags de bloco; frases pelo Intl.Segmenter), para que a frase aqui seja
// a mesma que a leitura em voz alta destaca.
import type { MudancaDeTrecho } from "./controleDestaques.svelte";

/** Elementos que começam um bloco (os mesmos do tts.js do foliate-js). */
const TAGS_DE_BLOCO = new Set([
  "article", "aside", "audio", "blockquote", "caption", "details", "dialog", "div", "dl", "dt",
  "dd", "figure", "footer", "form", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hgroup", "hr", "li", "main", "math", "nav", "ol", "p", "pre", "section", "tr",
]);

const vazio = (r: Range) => !r.toString().trim();

/** Os blocos do documento, na ordem: cada um vai do início de um elemento de bloco ao próximo. */
export function blocosDe(doc: Document): Range[] {
  const blocos: Range[] = [];
  const corpo = doc.body;
  if (!corpo) return blocos;
  let ultimo: Range | null = null;
  const walker = doc.createTreeWalker(corpo, NodeFilter.SHOW_ELEMENT);
  for (let no = walker.nextNode(); no; no = walker.nextNode()) {
    if (!TAGS_DE_BLOCO.has((no as Element).tagName.toLowerCase())) continue;
    if (ultimo) {
      ultimo.setEndBefore(no);
      if (!vazio(ultimo)) blocos.push(ultimo);
    }
    ultimo = doc.createRange();
    ultimo.setStart(no, 0);
  }
  if (!ultimo) {
    ultimo = doc.createRange();
    ultimo.setStart(corpo.firstChild ?? corpo, 0);
  }
  ultimo.setEndAfter(corpo.lastChild ?? corpo);
  if (!vazio(ultimo)) blocos.push(ultimo);
  return blocos;
}

/**
 * Os nós de texto do intervalo, com o trecho de cada um que fica dentro dele. Percorre só do
 * início ao fim do intervalo: percorrer o ancestral comum inteiro (quase sempre o body) para
 * cada bloco deixava um capítulo longo quadrático (5 mil frases: ~4 s).
 */
function textosDe(range: Range): { no: Text; inicio: number; fim: number }[] {
  const doc = range.startContainer.ownerDocument ?? (range.startContainer as Document);
  const lista: { no: Text; inicio: number; fim: number }[] = [];
  const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const comeco = range.startContainer;
  let no: Node | null;
  if (comeco.nodeType === Node.TEXT_NODE) no = comeco;
  else {
    // O primeiro texto a partir do filho em que o intervalo começa.
    const filho = comeco.childNodes[range.startOffset];
    walker.currentNode = filho ?? comeco;
    no = filho?.nodeType === Node.TEXT_NODE ? filho : walker.nextNode();
  }
  if (no) walker.currentNode = no;
  // comparePoint > 0: o nó começa depois do fim do intervalo.
  for (; no && range.comparePoint(no, 0) <= 0; no = walker.nextNode()) {
    const texto = no as Text;
    if (!range.intersectsNode(texto)) continue;
    const inicio = texto === range.startContainer ? range.startOffset : 0;
    const fim = texto === range.endContainer ? range.endOffset : texto.length;
    if (fim > inicio) lista.push({ no: texto, inicio, fim });
  }
  return lista;
}

/** O mesmo intervalo, do primeiro ao último caractere visível (sem os espaços das pontas). */
export function aparar(range: Range): Range {
  const pedacos = textosDe(range).filter((p) => p.no.data.slice(p.inicio, p.fim).trim());
  const primeiro = pedacos[0];
  const ultimo = pedacos.at(-1);
  if (!primeiro || !ultimo) return range.cloneRange();
  const r = primeiro.no.ownerDocument.createRange();
  const inicio = primeiro.no.data.slice(primeiro.inicio, primeiro.fim);
  r.setStart(primeiro.no, primeiro.inicio + inicio.length - inicio.trimStart().length);
  const fim = ultimo.no.data.slice(ultimo.inicio, ultimo.fim);
  r.setEnd(ultimo.no, ultimo.inicio + fim.trimEnd().length);
  return r;
}

/** As frases de um bloco, sem os espaços das pontas. `idioma` guia o Intl.Segmenter. */
export function frasesDe(bloco: Range, idioma?: string | null): Range[] {
  const pedacos = textosDe(bloco);
  if (!pedacos.length) return [];
  const doc = pedacos[0]!.no.ownerDocument;
  // Quebras de linha no meio do parágrafo (comuns no XHTML) aparecem como espaço na tela, mas o
  // Intl.Segmenter as trata como fim de frase: viram espaço aqui (mesmo tamanho, mesmas posições).
  const texto = pedacos
    .map((p) => p.no.data.slice(p.inicio, p.fim))
    .join("")
    .replace(/[\r\n\u2028\u2029]/g, " ");
  // Posição no texto juntado → (nó, deslocamento) no documento.
  const ponto = (pos: number, fimDeTrecho: boolean): [Text, number] => {
    let soma = 0;
    for (const p of pedacos) {
      const tamanho = p.fim - p.inicio;
      if (pos < soma + tamanho || (fimDeTrecho && pos === soma + tamanho)) {
        return [p.no, p.inicio + pos - soma];
      }
      soma += tamanho;
    }
    const ultimo = pedacos.at(-1)!;
    return [ultimo.no, ultimo.fim];
  };
  let segmentador: Intl.Segmenter;
  try {
    segmentador = new Intl.Segmenter(idioma ?? undefined, { granularity: "sentence" });
  } catch {
    segmentador = new Intl.Segmenter(undefined, { granularity: "sentence" });
  }
  const trechos: [number, number][] = [];
  for (const { index, segment } of segmentador.segment(texto)) {
    const inicio = index + (segment.length - segment.trimStart().length);
    const fim = index + segment.trimEnd().length;
    if (fim <= inicio) continue;
    const anterior = trechos.at(-1);
    if (anterior && continua(texto.slice(...anterior), texto.slice(inicio, fim))) {
      anterior[1] = fim;
    } else {
      trechos.push([inicio, fim]);
    }
  }
  return trechos.map(([inicio, fim]) => {
    const r = doc.createRange();
    r.setStart(...ponto(inicio, false));
    r.setEnd(...ponto(fim, true));
    return r;
  });
}

/** Abreviações que o Intl.Segmenter toma por fim de frase ("D. Gloria", "Sr. José"). */
const ABREVIACOES = new Set([
  "Sr", "Sra", "Srta", "Srs", "Sras", "D", "Dr", "Dra", "Drs", "Prof", "Profa", "Pe", "Fr",
  "Exmo", "Exma", "Sto", "Sta", "Av", "Mr", "Mrs", "Ms", "Mt", "St", "Jr", "Sen", "Gen", "Cap",
]);

/**
 * Se `seguinte` continua a frase de `anterior`: o Intl.Segmenter corta depois de "?" e "!" mesmo
 * quando a frase segue em minúscula ("—Abaixo ou acima? perguntou-lhe tio Cosme"), deixa a aspa
 * de fecho no começo da seguinte ("Mamãe!" | "» Ella acudiu") e corta nas abreviações e
 * iniciais ("D." | "Gloria"). A mesma regra do motor da voz natural (`continua`, no core).
 */
export function continua(anterior: string, seguinte: string): boolean {
  const primeira = seguinte[0];
  if (!primeira || !anterior) return false;
  if ("»”)]’".includes(primeira)) return true;
  const letra = [...seguinte].find((c) => !"«“\"‘'( ".includes(c));
  if (letra && letra !== letra.toUpperCase() && letra === letra.toLowerCase()) return true;
  if (!anterior.endsWith(".")) return false;
  const palavra = (anterior.slice(0, -1).split(/\s/).at(-1) ?? "").replace(/^\P{L}+/u, "");
  const inicial = [...palavra].length === 1 && palavra !== palavra.toLowerCase();
  return inicial || ABREVIACOES.has(palavra);
}

/** Todas as frases do documento (capítulo), bloco a bloco. */
export function frasesDoDocumento(doc: Document, idioma?: string | null): Range[] {
  return blocosDe(doc).flatMap((b) => frasesDe(b, idioma));
}

/** A primeira frase que termina depois do início de `ponto` (a que está nele ou a seguinte). */
export function indiceDaFraseEm(frases: Range[], ponto: Range): number {
  // START_TO_END compara o fim da frase (este intervalo) com o início do ponto.
  const i = frases.findIndex((f) => f.compareBoundaryPoints(Range.START_TO_END, ponto) > 0);
  return i < 0 ? Math.max(0, frases.length - 1) : i;
}

/** Um intervalo do início da frase `de` ao fim da frase `ate` (inclusive). */
/**
 * As frases que o `trecho` alcança, cortadas nas pontas dele: o que o "Ouvir" da barra de destaque
 * lê (a seleção, a frase do modo frase ou o destaque, e nada além). Sem nenhuma frase (um trecho
 * fora dos blocos de texto), o próprio trecho.
 */
export function frasesDoTrecho(frases: Range[], trecho: Range): Range[] {
  const dentro = frases
    .filter(
      (f) =>
        f.compareBoundaryPoints(Range.START_TO_END, trecho) > 0 &&
        f.compareBoundaryPoints(Range.END_TO_START, trecho) < 0,
    )
    .map((f) => {
      const r = f.cloneRange();
      if (r.compareBoundaryPoints(Range.START_TO_START, trecho) < 0) {
        r.setStart(trecho.startContainer, trecho.startOffset);
      }
      if (r.compareBoundaryPoints(Range.END_TO_END, trecho) > 0) {
        r.setEnd(trecho.endContainer, trecho.endOffset);
      }
      return r;
    })
    .filter((r) => r.toString().trim());
  return dentro.length ? dentro : [trecho.cloneRange()];
}

export function unir(frases: Range[], de: number, ate: number): Range {
  const r = frases[de]!.cloneRange();
  r.setEnd(frases[ate]!.endContainer, frases[ate]!.endOffset);
  return r;
}

/**
 * O trecho depois de Alt+↑/↓ (outra frase) ou Alt+Shift+↑/↓ (maior ou menor), entre `total` frases.
 * `null` se não há para onde ir (quem chama decide: avisar, ou passar à página vizinha).
 */
export function trechoSeguinte(
  total: number,
  de: number,
  ate: number,
  mudanca: MudancaDeTrecho,
): [number, number] | null {
  if (mudanca === "proxima") return ate + 1 < total ? [ate + 1, ate + 1] : null;
  if (mudanca === "anterior") return de > 0 ? [de - 1, de - 1] : null;
  if (mudanca === "estender") return ate + 1 < total ? [de, ate + 1] : null;
  return ate > de ? [de, ate - 1] : null;
}
