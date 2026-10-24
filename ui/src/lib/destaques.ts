// Destaques no leitor (M16): cores do marca-texto, posição na ordem de leitura e textos para
// o leitor de tela. Funções puras; o desenho é do overlayer do foliate-js.
import type { CorDestaque, Destaque } from "./biblioteca";
import type { PaginaEfetiva } from "./pagina";

/** As cores, na ordem da barra. O nome sempre acompanha a cor (nunca só a cor). */
export const CORES_DESTAQUE: { valor: CorDestaque; nome: string; hex: string }[] = [
  { valor: "amarelo", nome: "Amarelo", hex: "#f5c800" },
  { valor: "verde", nome: "Verde", hex: "#4cc25e" },
  { valor: "azul", nome: "Azul", hex: "#4da3f0" },
  { valor: "rosa", nome: "Rosa", hex: "#f06aa8" },
];

export function nomeDaCor(cor: CorDestaque): string {
  return CORES_DESTAQUE.find((c) => c.valor === cor)?.nome ?? cor;
}

export function hexDaCor(cor: CorDestaque): string {
  return CORES_DESTAQUE.find((c) => c.valor === cor)?.hex ?? CORES_DESTAQUE[0]!.hex;
}

export interface EstiloMarcaTexto {
  opacidade: number;
  mistura: "multiply" | "screen";
}

/**
 * Como o marca-texto se mistura com a página. Em papel claro, `multiply` (como tinta de
 * marca-texto: o preto do texto continua preto); na noite (e no alto contraste, que também é
 * escuro), `screen`, que clareia o fundo em vez de escurecê-lo até sumir.
 */
export function estiloDoMarcaTexto(escura: boolean): EstiloMarcaTexto {
  return escura ? { opacidade: 0.3, mistura: "screen" } : { opacidade: 0.4, mistura: "multiply" };
}

/** Variáveis lidas pelo `Overlayer.highlight` do foliate-js (no elemento <foliate-view>). */
export function aplicarMarcaTexto(elemento: HTMLElement, escura: boolean): void {
  const { opacidade, mistura } = estiloDoMarcaTexto(escura);
  elemento.style.setProperty("--overlayer-highlight-opacity", String(opacidade));
  elemento.style.setProperty("--overlayer-highlight-blend-mode", mistura);
}

const canais = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const paraHex = (c: number[]) =>
  "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");

/** A cor que aparece onde o marca-texto cobre `fundo` (para conferir o contraste). */
export function misturar(fundo: string, cor: string, estilo: EstiloMarcaTexto): string {
  const f = canais(fundo);
  const c = canais(cor);
  const { opacidade: a, mistura } = estilo;
  return paraHex(
    f.map((fv, i) => {
      const cv = c[i]!;
      const misturado = mistura === "multiply" ? fv * cv : 1 - (1 - fv) * (1 - cv);
      return fv * (1 - a) + misturado * a;
    }),
  );
}

/** Páginas em que o marca-texto é o escuro (`screen`). */
export function paginaEscura(pagina: PaginaEfetiva): boolean {
  return pagina === "noite";
}

/**
 * Posição (0 a 1) no livro de um ponto que está a `dentro` (0 a 1) do texto da seção `indice`.
 * `fracoes` são os inícios das seções no livro (`view.getSectionFractions()`).
 */
export function posicaoNoLivro(fracoes: number[], indice: number, dentro: number): number {
  const inicio = fracoes[indice] ?? 0;
  const fim = fracoes[indice + 1] ?? 1;
  const d = Math.min(1, Math.max(0, Number.isFinite(dentro) ? dentro : 0));
  return Math.min(1, Math.max(0, inicio + (fim - inicio) * d));
}

/** Quanto do texto do capítulo vem antes do início de `range` (0 a 1). */
export function fracaoNoDocumento(range: Range): number {
  const doc = range.startContainer.ownerDocument;
  const corpo = doc?.body;
  if (!doc || !corpo) return 0;
  const antes = doc.createRange();
  antes.setStart(corpo, 0);
  antes.setEnd(range.startContainer, range.startOffset);
  const total = corpo.textContent?.length ?? 0;
  return total ? antes.toString().length / total : 0;
}

/** Trecho encurtado para listas e comandos: espaços juntados, até `max` caracteres. */
export function resumo(trecho: string, max = 80): string {
  const t = trecho.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Nome acessível de um destaque: a cor (em palavras), o trecho e, se houver, a nota. */
export function descreverDestaque(d: Destaque): string {
  const nota = d.nota ? `. Nota: ${resumo(d.nota, 120)}` : "";
  return `Destaque ${nomeDaCor(d.cor).toLowerCase()}: ${resumo(d.trecho, 120)}${nota}`;
}
