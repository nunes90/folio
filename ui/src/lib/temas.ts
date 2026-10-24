// Cores da interface (barras, painéis, biblioteca): daqui saem as variáveis CSS (aplicarTema).
// A cor do papel do livro é outra escolha, a página (lib/pagina.ts). temas.test.ts verifica o
// contraste WCAG de cada tema.

export type TemaEscolhido = "sistema" | "claro" | "escuro" | "alto-contraste";
export type TemaEfetivo = Exclude<TemaEscolhido, "sistema">;

export interface Cores {
  fundo: string;
  texto: string;
  /** Texto secundário (autores, descrições). */
  suave: string;
  borda: string;
  /** Fundo de botões e campos. */
  controle: string;
  link: string;
  /** Contorno de foco do teclado. */
  foco: string;
  /** `color-scheme` CSS: controles nativos (barras de rolagem, deslizantes) seguem o tema. */
  esquema: "light" | "dark";

  // Superfícies em camadas (M7, ver docs/design/redesign.md). `fundo` continua sendo a página
  // do livro; a interface ao redor usa estas.
  /** Fundo geral da interface (atrás de painéis e cards). */
  app: string;
  /** Barras e painéis laterais. */
  painel: string;
  /** Cards e áreas elevadas (capas, diálogos). */
  card: string;
  /** Fundo de botões e itens sob o ponteiro ou selecionados. */
  hover: string;
  /** Linhas que só separam áreas (decorativas: sem exigência de contraste). Pode ter alfa. */
  divisoria: string;
  /** Cor de destaque (item ativo, botão primário, progresso). Também serve como texto. */
  destaque: string;
  /** Texto sobre um fundo `destaque`. */
  sobreDestaque: string;
  /** Fundo suave de itens destacados (ex.: capítulo atual no índice). */
  destaqueSuave: string;
  /** `box-shadow` de elementos elevados; "none" no alto contraste. */
  sombra: string;
}

export const TEMAS: Record<TemaEfetivo, Cores> = {
  claro: {
    fundo: "#ffffff",
    texto: "#1a1a1a",
    suave: "#555555",
    borda: "#8a8a8a",
    controle: "#f0f0f0",
    link: "#0b57d0",
    foco: "#0b57d0",
    esquema: "light",
    app: "#f6f5f2",
    painel: "#ffffff",
    card: "#ffffff",
    hover: "#ecebe6",
    divisoria: "rgb(28 26 23 / 10%)",
    destaque: "#0b57d0",
    sobreDestaque: "#ffffff",
    destaqueSuave: "#e8effb",
    sombra: "0 1px 2px rgb(28 26 23 / 6%), 0 4px 14px rgb(28 26 23 / 8%)",
  },
  escuro: {
    fundo: "#1b1b1b",
    texto: "#e8e6e3",
    suave: "#b0aca6",
    borda: "#6e6e6e",
    controle: "#2c2c2c",
    link: "#8ab4f8",
    foco: "#8ab4f8",
    esquema: "dark",
    app: "#121214",
    painel: "#1b1b1e",
    card: "#232327",
    hover: "#2d2d32",
    divisoria: "rgb(255 255 255 / 9%)",
    destaque: "#8ab4f8",
    sobreDestaque: "#0d1626",
    destaqueSuave: "#1f2b40",
    sombra: "0 1px 2px rgb(0 0 0 / 40%), 0 6px 18px rgb(0 0 0 / 45%)",
  },
  "alto-contraste": {
    fundo: "#000000",
    texto: "#ffffff",
    suave: "#ffffff",
    borda: "#ffffff",
    controle: "#000000",
    link: "#ffff00",
    foco: "#ffff00",
    esquema: "dark",
    app: "#000000",
    painel: "#000000",
    card: "#000000",
    hover: "#1a1a1a",
    divisoria: "#ffffff",
    destaque: "#ffff00",
    sobreDestaque: "#000000",
    destaqueSuave: "#000000",
    sombra: "none",
  },
};

/** O que o sistema pede (media queries `prefers-color-scheme` e `prefers-contrast`). */
export interface PreferenciasDoSistema {
  escuro: boolean;
  contraste: boolean;
}

export function resolverTema(escolhido: TemaEscolhido, sistema: PreferenciasDoSistema): TemaEfetivo {
  if (escolhido !== "sistema") return escolhido;
  if (sistema.contraste) return "alto-contraste";
  return sistema.escuro ? "escuro" : "claro";
}

/** Define as variáveis CSS da interface (usadas em app.css). */
export function aplicarTema(tema: TemaEfetivo, raiz = document.documentElement): void {
  const c = TEMAS[tema];
  raiz.dataset.tema = tema;
  raiz.style.colorScheme = c.esquema;
  for (const [nome, valor] of Object.entries(c)) {
    if (nome === "esquema") continue;
    // sobreDestaque → --sobre-destaque
    raiz.style.setProperty(`--${nome.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}`, valor);
  }
}

// --- contraste WCAG 2 -------------------------------------------------------------------

/** Luminância relativa de uma cor `#rrggbb` (WCAG 2). */
function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Razão de contraste entre duas cores, de 1 (nenhum) a 21 (preto e branco). */
export function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro! + 0.05) / (escuro! + 0.05);
}
