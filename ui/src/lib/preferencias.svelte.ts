// Preferências de leitura (espelho de crates/core/src/preferencias.rs). O core valida e
// normaliza; aqui ficam o estado reativo, a gravação com debounce e o CSS do livro.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { familiaCss, fontFace, MONO } from "./fontes";
import { log } from "./log";
import { cssDaPagina, resolverPagina, type Pagina } from "./pagina";
import type { TemaEfetivo, TemaEscolhido } from "./temas";
import type { EstiloVirada } from "./virada";

export type Fonte = "original" | "literata" | "atkinson" | "lexend" | "opendyslexic";
export type Alinhamento = "original" | "inicio" | "justificado";
export type Movimento = "sistema" | "reduzido";
export type ModoPdf = "paginas" | "rolagem";

export interface Preferencias {
  fonte: Fonte;
  tamanho: number;
  entrelinha: number;
  espacoLetras: number;
  espacoPalavras: number;
  /** Largura máxima da coluna, em caracteres por linha (aproximados; ver `larguraDaColuna`). */
  caracteresPorLinha: number;
  colunas: number;
  alinhamento: Alinhamento;
  hifenizacao: boolean;
  /** Cores da interface (barras, painéis, biblioteca). */
  tema: TemaEscolhido;
  movimento: Movimento;
  /** Velocidade da leitura em voz alta, -100 a 100 (0 = normal do sistema). */
  velocidadeVoz: number;
  /** Animação ao virar a página (EPUB e PDF). */
  virada: EstiloVirada;
  /** PDF página a página ou em rolagem contínua. */
  modoPdf: ModoPdf;
  /** O papel do livro, igual no EPUB e no PDF; "automatica" segue a interface. */
  pagina: Pagina;
  /** No modo foco, as barras aparecem só pelo teclado (Tab), não com o ponteiro nas bordas. */
  barrasSoPeloTeclado: boolean;
}

/** Mesmos padrões e limites do core; o core é quem decide no fim (normaliza ao salvar). */
export const PADRAO: Preferencias = {
  fonte: "original",
  tamanho: 1,
  entrelinha: 1.5,
  espacoLetras: 0,
  espacoPalavras: 0,
  caracteresPorLinha: 90,
  colunas: 2,
  alinhamento: "original",
  hifenizacao: false,
  tema: "sistema",
  movimento: "sistema",
  velocidadeVoz: 0,
  virada: "esmaecer",
  modoPdf: "paginas",
  pagina: "automatica",
  barrasSoPeloTeclado: false,
};

export const LIMITES = {
  tamanho: { min: 0.75, max: 3, passo: 0.05 },
  entrelinha: { min: 1, max: 2.5, passo: 0.1 },
  espacoLetras: { min: 0, max: 0.3, passo: 0.01 },
  espacoPalavras: { min: 0, max: 1, passo: 0.05 },
  caracteresPorLinha: { min: 40, max: 160, passo: 5 },
  velocidadeVoz: { min: -100, max: 100, passo: 10 },
} as const;

export const preferencias = $state<Preferencias>({ ...PADRAO });

const ESPERA_GRAVACAO_MS = 500;
let temporizador: ReturnType<typeof setTimeout> | undefined;

export async function carregarPreferencias(): Promise<void> {
  if (!isTauri()) return;
  try {
    Object.assign(preferencias, await invoke<Preferencias>("preferencias_leitura"));
  } catch (e) {
    log.warn(`preferências indisponíveis; usando o padrão: ${e}`);
  }
}

/** Aplica na hora (o livro se atualiza) e grava depois de uma pausa nas mudanças. */
export function atualizarPreferencias(mudancas: Partial<Preferencias>): void {
  Object.assign(preferencias, mudancas);
  if (!isTauri()) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    try {
      const gravadas = await invoke<Preferencias>("salvar_preferencias_leitura", {
        preferencias: { ...preferencias },
      });
      Object.assign(preferencias, gravadas);
    } catch (e) {
      log.warn(`falha ao salvar preferências: ${e}`);
    }
  }, ESPERA_GRAVACAO_MS);
}

/** Restaura o texto; o resto (tema, movimento, página, modo foco…) fica: tem as próprias seções. */
export function restaurarPadrao(): void {
  const { tema, movimento, virada, modoPdf, pagina, barrasSoPeloTeclado } = preferencias;
  atualizarPreferencias({
    ...PADRAO,
    tema,
    movimento,
    virada,
    modoPdf,
    pagina,
    barrasSoPeloTeclado,
  });
}

/** Seletores de blocos de texto corrido (os mesmos que o leitor do foliate-js ajusta). */
const TEXTO = "p, li, blockquote, dd";

/**
 * CSS injetado em cada capítulo do livro. `escala` é a escala de texto do sistema (ADR 0004);
 * o tamanho escolhido se multiplica a ela. `!important` porque o CSS do livro vem antes.
 */
export function cssDoLivro(
  p: Preferencias,
  escala: number,
  tema: TemaEfetivo,
  base?: string,
): string {
  const regras = [
    cssDaPagina(resolverPagina(p.pagina, tema), tema),
    `html { font-size: ${+(escala * p.tamanho * 100).toFixed(2)}% !important; }`,
  ];

  const espacamento = [`line-height: ${p.entrelinha} !important`];
  if (p.espacoLetras) espacamento.push(`letter-spacing: ${p.espacoLetras}em !important`);
  if (p.espacoPalavras) espacamento.push(`word-spacing: ${p.espacoPalavras}em !important`);
  regras.push(`body, ${TEXTO} { ${espacamento.join("; ")}; }`);

  const blocos: string[] = [];
  if (p.alinhamento !== "original") {
    blocos.push(`text-align: ${p.alinhamento === "justificado" ? "justify" : "start"} !important`);
  }
  const hifens = p.hifenizacao ? "auto" : "manual";
  blocos.push(`hyphens: ${hifens} !important`, `-webkit-hyphens: ${hifens} !important`);
  regras.push(`${TEXTO} { ${blocos.join("; ")}; }`);

  if (p.fonte !== "original") {
    regras.unshift(fontFace(p.fonte, base));
    // Código continua em fonte monoespaçada.
    regras.push(
      `body, body *:not(code, pre, kbd, samp, code *, pre *) ` +
        `{ font-family: ${familiaCss(p.fonte)} !important; }`,
    );
  }
  regras.push(...cssDoCodigo(base), cssDosTitulos(p.entrelinha));
  return regras.join("\n");
}

/**
 * Código (M24) sempre na monoespaçada do app, qualquer que seja a fonte do livro ou a escolhida.
 * Os espaçamentos e a hifenização do texto não valem ali (desalinhariam o código), e as linhas
 * longas de um `pre` quebram dentro da coluna em vez de vazar para a seguinte.
 */
function cssDoCodigo(base?: string): string[] {
  return [
    fontFace(MONO, base),
    `pre, code, kbd, samp, tt { font-family: ${familiaCss(MONO)} !important; ` +
      `letter-spacing: normal !important; word-spacing: normal !important; ` +
      `hyphens: none !important; -webkit-hyphens: none !important; }`,
    `pre { white-space: pre-wrap !important; overflow-wrap: anywhere; text-align: start !important; }`,
  ];
}

/**
 * Títulos (M24): entrelinha menor que a do texto (um título em duas linhas com a entrelinha do
 * texto parece dois títulos), linhas equilibradas, sem hifenizar e sem ficar sozinhos no fim
 * da coluna. As margens são só um padrão: as do livro vencem (sem `!important`).
 */
function cssDosTitulos(entrelinha: number): string {
  const titulos = "h1, h2, h3, h4, h5, h6";
  const altura = +Math.max(1.15, entrelinha * 0.8).toFixed(2);
  return [
    `${titulos} { line-height: ${altura} !important; text-wrap: balance; ` +
      `hyphens: none !important; -webkit-hyphens: none !important; ` +
      `break-after: avoid; -webkit-column-break-after: avoid; }`,
    `${titulos} { margin-block-start: 1.6em; margin-block-end: 0.6em; }`,
  ].join("\n");
}

/** Largura média de um caractere, em `em` (meio `em`: 8 px na letra de 16 px). */
const EM_POR_CARACTERE = 0.5;

/**
 * A largura máxima da coluna em px (para o `max-inline-size` do foliate-js): os caracteres por
 * linha escolhidos, no tamanho de letra efetivo (16 px × escala do sistema × tamanho). Aumentar
 * a letra alarga a coluna junto, até o limite da janela, e a linha continua com o mesmo tanto.
 */
export function larguraDaColuna(p: Preferencias, escala: number): number {
  return Math.round(p.caracteresPorLinha * EM_POR_CARACTERE * 16 * escala * p.tamanho);
}
