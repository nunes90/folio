// A página (o "papel") do livro, igual nos dois formatos: os mesmos nomes, as mesmas amostras e
// as mesmas cores. Por baixo, cada formato faz do seu jeito:
//  - EPUB (HTML): o texto e o fundo mudam de verdade (cssDaPagina).
//  - PDF (desenho no canvas do pdf.js): não dá para trocar as cores do texto, então cada página
//    é um efeito sobre a página já desenhada:
//     - creme e sépia: uma camada da cor do papel em `mix-blend-mode: multiply` (o branco vira
//       o papel e o preto continua preto);
//     - noite: a conta de `invert(0.9) hue-rotate(180deg)` aplicada nos pixels do canvas, uma vez
//       por página desenhada (inverterCanvas). Inverte o claro e o escuro e devolve os tons às
//       cores originais. Um `filter` CSS daria o mesmo resultado, mas o WebKitGTK o recalcula a
//       cada quadro das animações (virada a ~30 qps), e o `ctx.filter` não tem efeito nele.
// A interface (lib/temas.ts) é outra coisa: só a interface em alto contraste vale para a página
// do EPUB (necessidade, não gosto).
import { TEMAS, type TemaEfetivo } from "./temas";

/** A escolha nas preferências: "automatica" segue a interface. */
export type Pagina = "automatica" | PaginaEfetiva;
export type PaginaEfetiva = "original" | "creme" | "sepia" | "noite";

export interface EstiloPagina {
  nome: string;
  descricao: string;
  /** Cor do papel (no PDF, a que o branco assume). */
  papel: string;
  /** Cor do texto (no PDF, a que o preto assume). */
  tinta: string;
  /** Links no EPUB. */
  link: string;
  /** `color-scheme` do capítulo do EPUB (barras de rolagem, controles nativos). */
  esquema: "light" | "dark";
  /** Cor da camada multiply no PDF (creme, sépia). */
  camada?: string;
  /** Inversão aplicada nos pixels do PDF (noite), igual a este `filter` CSS. */
  filtro?: string;
}

/** Intensidade da inversão na noite: 1 daria preto puro, cansativo em tela grande. */
const INVERSAO = 0.9;

/** Uma cor `#rrggbb` depois de `invert(p)` (por canal: c·(1−p) + (255−c)·p). */
export function inverter(hex: string, p: number): string {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (
    "#" +
    canais
      .map((c) => Math.round(c * (1 - p) + (255 - c) * p))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

// Matriz de `hue-rotate(180deg)` (especificação de Filter Effects, com cos = −1 e sen = 0).
// As linhas somam 1: cinzas não mudam.
const GIRO = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856],
] as const;

/** Aplica `invert(p) hue-rotate(180deg)` em pixels RGBA, no lugar (o alfa não muda). */
export function inverterPixels(px: Uint8ClampedArray, p = INVERSAO): void {
  // Tabela do invert por valor de canal: evita a conta em cada pixel. Arredondada como em
  // `inverter`: cinzas saem iguais nos três canais (e iguais à amostra do painel).
  const inv = new Uint8Array(256);
  for (let c = 0; c < 256; c++) inv[c] = Math.round(c * (1 - p) + (255 - c) * p);
  const [[a, b, c], [d, e, f], [g, h, k]] = GIRO;
  for (let i = 0; i < px.length; i += 4) {
    const r = inv[px[i]!]!;
    const gr = inv[px[i + 1]!]!;
    const bl = inv[px[i + 2]!]!;
    // Uint8ClampedArray arredonda e limita a 0–255 sozinho.
    px[i] = a * r + b * gr + c * bl;
    px[i + 1] = d * r + e * gr + f * bl;
    px[i + 2] = g * r + h * gr + k * bl;
  }
}

/**
 * Inverte a página já desenhada pelo pdf.js (uma vez por desenho) e marca o canvas com
 * `data-invertida`: na noite, o CSS esconde canvas sem a marca. Assim nunca aparece um
 * canvas claro (o desenho parcial que o pdf.js mostra em páginas lentas, ou o canvas antigo
 * durante o redesenho ao entrar na noite); no lugar, a cor do papel.
 */
export function inverterCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) return;
  const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
  inverterPixels(imagem.data);
  ctx.putImageData(imagem, 0, 0);
  canvas.dataset.invertida = "";
}

export const PAGINAS: Record<PaginaEfetiva, EstiloPagina> = {
  original: {
    nome: "Original",
    descricao: "como o livro foi feito",
    papel: "#ffffff",
    tinta: "#1a1a1a",
    link: "#0b57d0",
    esquema: "light",
  },
  creme: {
    nome: "Creme",
    descricao: "papel claro e quente",
    papel: "#faf3e3",
    tinta: "#1a1a1a",
    link: "#0b57d0",
    esquema: "light",
    camada: "#faf3e3",
  },
  sepia: {
    nome: "Sépia",
    descricao: "papel amarelado",
    papel: "#f0e1c2",
    tinta: "#2e2416",
    link: "#7a3a00",
    esquema: "light",
    camada: "#f0e1c2",
  },
  noite: {
    nome: "Noite",
    descricao: "claro e escuro invertidos (no PDF, figuras também)",
    papel: inverter("#ffffff", INVERSAO),
    tinta: inverter("#000000", INVERSAO),
    link: "#8ab4f8",
    esquema: "dark",
    filtro: `invert(${INVERSAO}) hue-rotate(180deg)`,
  },
};

/** "Automática" vira a página que combina com a interface: clara → original; escura → noite. */
export function resolverPagina(pagina: Pagina, interface_: TemaEfetivo): PaginaEfetiva {
  if (pagina !== "automatica") return pagina;
  return interface_ === "claro" ? "original" : "noite";
}

/**
 * CSS da página injetado em cada capítulo do EPUB (o iframe não herda as variáveis da
 * interface). Com a interface em alto contraste, o livro também fica em branco sobre preto,
 * qualquer que seja a página: o livro pode pintar texto de cinza ou pôr fundos coloridos, e
 * em alto contraste tudo herda as cores. Imagens continuam como estão.
 */
export function cssDaPagina(pagina: PaginaEfetiva, interface_: TemaEfetivo): string {
  if (interface_ === "alto-contraste") {
    const c = TEMAS["alto-contraste"];
    return [
      `html { color-scheme: dark; }`,
      `html, body { color: ${c.texto} !important; background: ${c.fundo} !important; }`,
      `a:link, a:visited { color: ${c.link} !important; }`,
      `body * { color: inherit !important; background-color: transparent !important; ` +
        `border-color: ${c.borda} !important; }`,
      `a:link *, a:visited * { color: ${c.link} !important; }`,
    ].join("\n");
  }
  const p = PAGINAS[pagina];
  return [
    `html { color-scheme: ${p.esquema}; }`,
    `html, body { color: ${p.tinta} !important; background: ${p.papel} !important; }`,
    `a:link, a:visited { color: ${p.link} !important; }`,
  ].join("\n");
}
