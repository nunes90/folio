// Tipos mínimos do <foliate-view> (foliate-js não publica tipos). Só o que usamos.

export interface ItemIndice {
  label: string;
  href: string;
  subitems?: ItemIndice[];
}

/** Título pode vir como texto ou como mapa idioma → texto. */
type TextoLocalizado = string | Record<string, string>;

export interface Livro {
  metadata?: { title?: TextoLocalizado; language?: string | string[] };
  /** Direção de leitura ("rtl" em livros da direita para a esquerda). */
  dir?: string;
  toc?: ItemIndice[];
}

export interface DetalheRelocate {
  fraction: number;
  /** Posição atual como EPUB CFI; é o que guardamos para retomar a leitura. */
  cfi?: string;
  tocItem?: { href: string; label: string };
}

/** Leitura em voz alta do foliate-js (tts.js): SSML por bloco, com uma marca por frase. */
export interface TtsFoliate {
  start(): string | undefined;
  next(): string | undefined;
  from(range: Range): string | undefined;
  /** Destaca a frase da marca e vira a página até ela. */
  setMark(marca: string): void;
}

export interface Paginador extends HTMLElement {
  nextSection(): Promise<void>;
  getContents(): { doc: Document; index: number }[];
  setStyles(css: string): void;
  /** Põe o foco do teclado no capítulo (iframe). */
  focusView(): void;
  /** Vira até o trecho; com `selecionar`, também o seleciona (é assim que a voz marca a frase). */
  scrollToAnchor(trecho: Range, selecionar?: boolean): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
}

/** Anotação do foliate-js: `value` é o CFI do trecho (os destaques, M16). */
export interface Anotacao {
  value: string;
}

/** Desenho de um destaque (ex.: `Overlayer.highlight`): recebe os retângulos do trecho. */
export type Desenho = (retangulos: DOMRectList, opcoes: { color: string }) => SVGElement;

export interface FoliateView extends HTMLElement {
  book: Livro;
  renderer: Paginador;
  tts?: TtsFoliate;
  lastLocation?: { range?: Range } | null;
  initTTS(granularidade?: "word" | "sentence"): Promise<void>;
  open(arquivo: File | Blob): Promise<void>;
  init(opcoes: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
  close(): void;
  goTo(alvo: string | number): Promise<void>;
  /** CFI de um trecho (`range`) da seção `indice`. */
  getCFI(indice: number, range: Range): string;
  /** O CFI de volta para a seção e o trecho nela. */
  resolveCFI(cfi: string): { index: number; anchor(doc: Document): Range };
  /** Item do índice em que o trecho está. */
  getProgressOf(indice: number, range: Range): { tocItem?: { label: string; href: string } };
  /** Onde cada seção começa no livro (0 a 1). */
  getSectionFractions(): number[];
  /** Desenha (ou redesenha) a anotação, se a seção dela estiver carregada: dispara "draw-annotation". */
  addAnnotation(anotacao: Anotacao): Promise<unknown>;
  deleteAnnotation(anotacao: Anotacao): Promise<unknown>;
  goLeft(): Promise<void>;
  goRight(): Promise<void>;
  prev(): Promise<void>;
  next(): Promise<void>;
}

/** O marca-texto do foliate-js (`Overlayer.highlight`). */
export async function desenhoMarcaTexto(): Promise<Desenho> {
  // @ts-expect-error -- o foliate-js não publica tipos (o view.js é importado só pelo efeito).
  const { Overlayer } = await import("../vendor/foliate-js/overlayer.js");
  return Overlayer.highlight as Desenho;
}

/** Registra o elemento <foliate-view> (import com efeito colateral) e cria uma instância. */
export async function criarView(): Promise<FoliateView> {
  await import("../vendor/foliate-js/view.js");
  return document.createElement("foliate-view") as FoliateView;
}

export function textoLocalizado(texto: TextoLocalizado | undefined): string {
  if (!texto) return "";
  if (typeof texto === "string") return texto;
  return texto[navigator.language] ?? Object.values(texto)[0] ?? "";
}
