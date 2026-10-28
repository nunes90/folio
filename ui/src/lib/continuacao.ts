// Continuação ao reabrir (M22): "Da última vez (há 2 dias), você estava em “Capítulo 3”" e as
// frases que antecedem o ponto em que se parou, tiradas do próprio texto (sem resumo, sem IA).
// Aparece ao reabrir um livro com progresso, se a última leitura foi há uma hora ou mais.

/** Desde a última leitura, quanto tempo (segundos) para o cartão aparecer. */
export const AUSENCIA_MINIMA = 60 * 60;

/** O que o cartão mostra. */
export interface Continuacao {
  /** Onde se estava, com a preposição: "em “Capítulo 3”", "na página 42". */
  onde: string;
  /** Há quanto tempo foi a última leitura ("há 2 dias"), se se sabe. */
  quando?: string;
  /** As frases logo antes do ponto (a última pode continuar na página). */
  trecho: string[];
}

/** Mostrar o cartão? Sim se há progresso e a última leitura foi há uma hora ou mais (ou não se sabe). */
export function deveMostrar(temProgresso: boolean, ultimaLeitura: number | undefined, agora: number): boolean {
  if (!temProgresso) return false;
  return ultimaLeitura === undefined || agora - ultimaLeitura >= AUSENCIA_MINIMA;
}

/** "há 3 horas", "ontem", "há 2 semanas" (segundos desde 1970). */
export function haQuanto(quando: number, agora: number): string {
  const formato = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const segundos = quando - agora;
  const unidades: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86400],
    ["month", 30 * 86400],
    ["week", 7 * 86400],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unidade, tamanho] of unidades)
    if (Math.abs(segundos) >= tamanho) return formato.format(Math.round(segundos / tamanho), unidade);
  // O Intl diria "este minuto".
  return "há instantes";
}

/** Espaços e quebras de linha juntos viram um espaço; sem espaços nas pontas. */
export const limpar = (texto: string) => texto.replace(/\s+/g, " ").trim();

/** As últimas `quantas` frases de um texto (pelo Intl.Segmenter, como as frases do M17). */
export function ultimasFrases(texto: string, quantas: number, idioma?: string | null): string[] {
  let segmentador: Intl.Segmenter;
  try {
    segmentador = new Intl.Segmenter(idioma ?? undefined, { granularity: "sentence" });
  } catch {
    segmentador = new Intl.Segmenter(undefined, { granularity: "sentence" });
  }
  const frases = [...segmentador.segment(limpar(texto))].map((s) => s.segment.trim()).filter(Boolean);
  return frases.slice(-quantas);
}

/** O texto para o leitor de tela (o cartão inteiro numa frase só). */
export function textoDaContinuacao(c: Continuacao): string {
  const quando = c.quando ? ` (${c.quando})` : "";
  const trecho = c.trecho.length ? ` Onde você parou: ${c.trecho.join(" ")}` : "";
  return `Da última vez${quando}, você estava ${c.onde}.${trecho}`;
}
