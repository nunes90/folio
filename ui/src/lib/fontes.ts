// Fontes que vêm com o app (licença OFL, via Fontsource). Só o subconjunto `latin`, que cobre
// o português. O documento principal as carrega pelos CSS do Fontsource (prévia no painel);
// cada capítulo do livro é um documento separado (iframe) e recebe o @font-face daqui.
import "@fontsource/literata/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/lexend/latin-400.css";
import "@fontsource/opendyslexic/latin-400.css";

import literata400 from "@fontsource/literata/files/literata-latin-400-normal.woff2?url";
import literata400i from "@fontsource/literata/files/literata-latin-400-italic.woff2?url";
import literata700 from "@fontsource/literata/files/literata-latin-700-normal.woff2?url";
import literata700i from "@fontsource/literata/files/literata-latin-700-italic.woff2?url";
import atkinson400 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url";
import atkinson400i from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-italic.woff2?url";
import atkinson700 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?url";
import atkinson700i from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-italic.woff2?url";
import lexend400 from "@fontsource/lexend/files/lexend-latin-400-normal.woff2?url";
import lexend700 from "@fontsource/lexend/files/lexend-latin-700-normal.woff2?url";
import dislexia400 from "@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url";
import dislexia400i from "@fontsource/opendyslexic/files/opendyslexic-latin-400-italic.woff2?url";
import dislexia700 from "@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2?url";
import dislexia700i from "@fontsource/opendyslexic/files/opendyslexic-latin-700-italic.woff2?url";
import mono400 from "@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-400-normal.woff2?url";
import mono400i from "@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-400-italic.woff2?url";
import mono700 from "@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-700-normal.woff2?url";

import type { Fonte } from "./preferencias.svelte";

interface Arquivo {
  url: string;
  peso: 400 | 700;
  italico: boolean;
}

interface DefinicaoFonte {
  familia: string;
  /** Família genérica de reserva, caso a fonte não carregue. */
  reserva: "serif" | "sans-serif" | "monospace";
  arquivos: Arquivo[];
}

export const FONTES: Record<Exclude<Fonte, "original">, DefinicaoFonte> = {
  literata: {
    familia: "Literata",
    reserva: "serif",
    arquivos: [
      { url: literata400, peso: 400, italico: false },
      { url: literata400i, peso: 400, italico: true },
      { url: literata700, peso: 700, italico: false },
      { url: literata700i, peso: 700, italico: true },
    ],
  },
  atkinson: {
    familia: "Atkinson Hyperlegible",
    reserva: "sans-serif",
    arquivos: [
      { url: atkinson400, peso: 400, italico: false },
      { url: atkinson400i, peso: 400, italico: true },
      { url: atkinson700, peso: 700, italico: false },
      { url: atkinson700i, peso: 700, italico: true },
    ],
  },
  // Lexend não tem itálico; o navegador inclina a regular.
  lexend: {
    familia: "Lexend",
    reserva: "sans-serif",
    arquivos: [
      { url: lexend400, peso: 400, italico: false },
      { url: lexend700, peso: 700, italico: false },
    ],
  },
  opendyslexic: {
    familia: "OpenDyslexic",
    reserva: "sans-serif",
    arquivos: [
      { url: dislexia400, peso: 400, italico: false },
      { url: dislexia400i, peso: 400, italico: true },
      { url: dislexia700, peso: 700, italico: false },
      { url: dislexia700i, peso: 700, italico: true },
    ],
  },
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
  arquivos: [
    { url: mono400, peso: 400, italico: false },
    { url: mono400i, peso: 400, italico: true },
    { url: mono700, peso: 700, italico: false },
  ],
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
      ({ url, peso, italico }) =>
        `@font-face { font-family: "${familia}"; font-weight: ${peso}; ` +
        `font-style: ${italico ? "italic" : "normal"}; font-display: swap; ` +
        `src: url("${new URL(url, base).href}") format("woff2"); }`,
    )
    .join("\n");
}
