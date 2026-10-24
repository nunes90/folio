// Cor da página do PDF. O PDF chega como desenho (canvas do pdf.js), então não dá para trocar
// as cores do texto como no EPUB: cada preset é um efeito sobre a página já desenhada.
//  - creme e sépia: uma camada da cor do papel em `mix-blend-mode: multiply`. O branco vira
//    o papel e o preto continua preto (multiplicar por preto dá preto).
//  - noite: a conta de `invert(0.9) hue-rotate(180deg)` aplicada nos pixels do canvas, uma vez
//    por página desenhada (inverterCanvas). Inverte o claro e o escuro e devolve os tons às
//    cores originais (vermelho continua avermelhado); figuras também se invertem. Um `filter`
//    CSS daria o mesmo resultado, mas o WebKitGTK o recalcula a cada quadro das animações
//    (virada a ~30 qps), e o `ctx.filter` do canvas não tem efeito nele.
// `papel` e `tinta` são as cores resultantes do branco e do preto: servem para a amostra no
// painel e para o teste de contraste.

export type PaginaPdf = "original" | "creme" | "sepia" | "noite";

export interface EstiloPagina {
  nome: string;
  descricao: string;
  papel: string;
  tinta: string;
  /** Cor da camada multiply (creme, sépia). */
  camada?: string;
  /** Inversão aplicada nos pixels (noite), igual a este `filter` CSS. */
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

/** Inverte a página já desenhada pelo pdf.js (uma vez por desenho). */
export function inverterCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) return;
  const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
  inverterPixels(imagem.data);
  ctx.putImageData(imagem, 0, 0);
}

export const PAGINAS_PDF: Record<PaginaPdf, EstiloPagina> = {
  original: {
    nome: "Original",
    descricao: "como o PDF foi feito (sugerido)",
    papel: "#ffffff",
    tinta: "#000000",
  },
  creme: {
    nome: "Creme",
    descricao: "papel claro e quente",
    papel: "#faf3e3",
    tinta: "#000000",
    camada: "#faf3e3",
  },
  sepia: {
    nome: "Sépia",
    descricao: "papel amarelado",
    papel: "#f0e1c2",
    tinta: "#000000",
    camada: "#f0e1c2",
  },
  noite: {
    nome: "Noite",
    descricao: "claro e escuro invertidos (figuras também)",
    papel: inverter("#ffffff", INVERSAO),
    tinta: inverter("#000000", INVERSAO),
    filtro: `invert(${INVERSAO}) hue-rotate(180deg)`,
  },
};
