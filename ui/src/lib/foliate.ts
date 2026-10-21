// Tipos mínimos do <foliate-view> (foliate-js não publica tipos). Só o que usamos.

export interface ItemIndice {
  label: string;
  href: string;
  subitems?: ItemIndice[];
}

/** Título pode vir como texto ou como mapa idioma → texto. */
type TextoLocalizado = string | Record<string, string>;

export interface Livro {
  metadata?: { title?: TextoLocalizado };
  toc?: ItemIndice[];
}

export interface DetalheRelocate {
  fraction: number;
  /** Posição atual como EPUB CFI; é o que guardamos para retomar a leitura. */
  cfi?: string;
  tocItem?: { href: string; label: string };
}

export interface Paginador extends HTMLElement {
  setStyles(css: string): void;
  /** Põe o foco do teclado no capítulo (iframe). */
  focusView(): void;
  next(): Promise<void>;
  prev(): Promise<void>;
}

export interface FoliateView extends HTMLElement {
  book: Livro;
  renderer: Paginador;
  open(arquivo: File | Blob): Promise<void>;
  init(opcoes: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
  close(): void;
  goTo(alvo: string | number): Promise<void>;
  goLeft(): Promise<void>;
  goRight(): Promise<void>;
  prev(): Promise<void>;
  next(): Promise<void>;
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
