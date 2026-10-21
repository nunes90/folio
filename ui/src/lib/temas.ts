// Temas de cores. Fonte única: daqui saem as variáveis CSS da interface (aplicarTema) e o CSS
// injetado no livro (cssDoTema). temas.test.ts verifica o contraste WCAG de cada tema.

export type TemaEscolhido = "sistema" | "claro" | "escuro" | "sepia" | "alto-contraste";
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
  },
  sepia: {
    fundo: "#f4ecd8",
    texto: "#2e2416",
    suave: "#5a4730",
    borda: "#8c7a5b",
    controle: "#e9dec2",
    link: "#7a3a00",
    foco: "#7a3a00",
    esquema: "light",
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
  for (const nome of ["fundo", "texto", "suave", "borda", "controle", "link", "foco"] as const) {
    raiz.style.setProperty(`--${nome}`, c[nome]);
  }
}

/** CSS injetado em cada capítulo do livro (iframe: não herda as variáveis da interface). */
export function cssDoTema(tema: TemaEfetivo): string {
  const c = TEMAS[tema];
  const regras = [
    `html { color-scheme: ${c.esquema}; }`,
    `html, body { color: ${c.texto} !important; background: ${c.fundo} !important; }`,
    `a:link, a:visited { color: ${c.link} !important; }`,
  ];
  if (tema === "alto-contraste") {
    // O livro pode pintar texto de cinza ou pôr fundos coloridos: em alto contraste, tudo
    // herda o branco sobre preto. Imagens continuam como estão.
    regras.push(
      `body * { color: inherit !important; background-color: transparent !important; ` +
        `border-color: ${c.borda} !important; }`,
      `a:link *, a:visited * { color: ${c.link} !important; }`,
    );
  }
  return regras.join("\n");
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
