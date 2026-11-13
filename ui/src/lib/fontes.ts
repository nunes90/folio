// Fontes que vêm com o app (licença OFL, via Fontsource), só em WOFF2 (o WebKitGTK não pede outro
// formato) e nos subconjuntos `latin` e `latin-ext` (M40c): o primeiro cobre o português, o inglês e
// o resto da Europa ocidental; o segundo, o polonês, o tcheco, o turco, o vietnamita romanizado…
// Sem ele, um "ł" ou um "ě" caía na fonte do sistema no meio da palavra. Cada @font-face leva o
// `unicode-range` do subconjunto: o navegador só baixa o arquivo se a página tiver letras dele.
//
// O documento principal recebe os @font-face ao carregar este módulo (a prévia no painel); cada
// capítulo do livro é um documento separado (iframe) e recebe os dele por `fontFace`.
import type { Fonte } from "./preferencias.svelte";

type Faixa = "latin" | "latin-ext";

/** As faixas de cada subconjunto, as mesmas do Google Fonts (e dos CSS do Fontsource). */
const FAIXAS: Record<Faixa, string> = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329," +
    "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF," +
    "U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
};

// Os arquivos, pelo nome: <pacote>-<faixa>-<peso>-<estilo>.woff2. O Vite resolve o padrão ao
// compilar e põe no pacote só o que casa com ele (nada de .woff, nem de outros pesos e alfabetos).
const URLS = import.meta.glob<string>(
  "../../node_modules/@fontsource/{literata,atkinson-hyperlegible,lexend,opendyslexic,atkinson-hyperlegible-mono}/files/*-{latin,latin-ext}-{400,700}-{normal,italic}.woff2",
  { eager: true, query: "?url", import: "default" },
);

interface Arquivo {
  url: string;
  peso: 400 | 700;
  italico: boolean;
  faixa: Faixa;
}

interface DefinicaoFonte {
  familia: string;
  /** Família genérica de reserva, caso a fonte não carregue. */
  reserva: "serif" | "sans-serif" | "monospace";
  arquivos: Arquivo[];
}

/** Os arquivos de um pacote do Fontsource, na ordem: latin antes de latin-ext, 400 antes de 700. */
function arquivosDe(pacote: string): Arquivo[] {
  const nome = new RegExp(`/${pacote}/files/${pacote}-(latin|latin-ext)-(400|700)-(normal|italic)\\.woff2$`);
  return Object.entries(URLS)
    .flatMap(([caminho, url]) => {
      const partes = nome.exec(caminho);
      if (!partes) return [];
      return [{ url, faixa: partes[1] as Faixa, peso: Number(partes[2]) as 400 | 700, italico: partes[3] === "italic" }];
    })
    .sort(
      (a, b) =>
        a.faixa.localeCompare(b.faixa) || a.peso - b.peso || Number(a.italico) - Number(b.italico),
    );
}

export const FONTES: Record<Exclude<Fonte, "original">, DefinicaoFonte> = {
  literata: { familia: "Literata", reserva: "serif", arquivos: arquivosDe("literata") },
  atkinson: {
    familia: "Atkinson Hyperlegible",
    reserva: "sans-serif",
    arquivos: arquivosDe("atkinson-hyperlegible"),
  },
  // Lexend não tem itálico; o navegador inclina a regular.
  lexend: { familia: "Lexend", reserva: "sans-serif", arquivos: arquivosDe("lexend") },
  // A OpenDyslexic só existe no subconjunto latin.
  opendyslexic: { familia: "OpenDyslexic", reserva: "sans-serif", arquivos: arquivosDe("opendyslexic") },
};

/**
 * A monoespaçada do código no EPUB (M24), sempre aplicada, qualquer que seja a fonte escolhida.
 * Da mesma família da Atkinson Hyperlegible (letras fáceis de distinguir: 0/O, 1/l/I). Com o
 * nome da fonte antes de `monospace`, o WebKit não aplica o tamanho menor (13 px) que dá à
 * família genérica sozinha.
 */
export const MONO: DefinicaoFonte = {
  familia: "Atkinson Hyperlegible Mono",
  reserva: "monospace",
  arquivos: arquivosDe("atkinson-hyperlegible-mono"),
};

/** `font-family` CSS de uma fonte do app, com reserva genérica. */
export function familiaCss(fonte: Exclude<Fonte, "original"> | DefinicaoFonte): string {
  const { familia, reserva } = typeof fonte === "string" ? FONTES[fonte] : fonte;
  return `"${familia}", ${reserva}`;
}

/**
 * @font-face para dentro do iframe do capítulo. As URLs precisam ser absolutas: o capítulo
 * é um documento `blob:` e resolveria caminhos relativos contra ele.
 */
export function fontFace(
  fonte: Exclude<Fonte, "original"> | DefinicaoFonte,
  base = location.href,
): string {
  const { familia, arquivos } = typeof fonte === "string" ? FONTES[fonte] : fonte;
  return arquivos
    .map(
      ({ url, peso, italico, faixa }) =>
        `@font-face { font-family: "${familia}"; font-weight: ${peso}; ` +
        `font-style: ${italico ? "italic" : "normal"}; font-display: swap; ` +
        `src: url("${new URL(url, base).href}") format("woff2"); unicode-range: ${FAIXAS[faixa]}; }`,
    )
    .join("\n");
}

// As fontes no documento principal (a prévia no painel Aparência): uma vez, ao carregar o módulo.
if (typeof document !== "undefined" && !document.getElementById("folio-fontes")) {
  const estilo = document.createElement("style");
  estilo.id = "folio-fontes";
  estilo.textContent = [...Object.values(FONTES), MONO].map((f) => fontFace(f)).join("\n");
  document.head.append(estilo);
}
