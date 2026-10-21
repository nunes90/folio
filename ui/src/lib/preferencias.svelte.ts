// Preferências de leitura (espelho de crates/core/src/preferencias.rs). O core valida e
// normaliza; aqui ficam o estado reativo, a gravação com debounce e o CSS do livro.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { familiaCss, fontFace } from "./fontes";
import { log } from "./log";
import { cssDoTema, type TemaEfetivo, type TemaEscolhido } from "./temas";

export type Fonte = "original" | "literata" | "atkinson" | "lexend" | "opendyslexic";
export type Alinhamento = "original" | "inicio" | "justificado";
export type Movimento = "sistema" | "reduzido";

export interface Preferencias {
  fonte: Fonte;
  tamanho: number;
  entrelinha: number;
  espacoLetras: number;
  espacoPalavras: number;
  larguraMaxima: number;
  colunas: number;
  alinhamento: Alinhamento;
  hifenizacao: boolean;
  tema: TemaEscolhido;
  movimento: Movimento;
}

/** Mesmos padrões e limites do core; o core é quem decide no fim (normaliza ao salvar). */
export const PADRAO: Preferencias = {
  fonte: "original",
  tamanho: 1,
  entrelinha: 1.5,
  espacoLetras: 0,
  espacoPalavras: 0,
  larguraMaxima: 720,
  colunas: 2,
  alinhamento: "original",
  hifenizacao: false,
  tema: "sistema",
  movimento: "sistema",
};

export const LIMITES = {
  tamanho: { min: 0.75, max: 3, passo: 0.05 },
  entrelinha: { min: 1, max: 2.5, passo: 0.1 },
  espacoLetras: { min: 0, max: 0.3, passo: 0.01 },
  espacoPalavras: { min: 0, max: 1, passo: 0.05 },
  larguraMaxima: { min: 320, max: 1600, passo: 20 },
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

/** Restaura o texto; tema e movimento ficam como estão (têm o próprio painel). */
export function restaurarPadrao(): void {
  atualizarPreferencias({ ...PADRAO, tema: preferencias.tema, movimento: preferencias.movimento });
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
    cssDoTema(tema),
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
  return regras.join("\n");
}
