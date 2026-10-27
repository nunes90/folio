// Progresso honesto (M21): quanto falta, no ritmo de quem lê. O ritmo vem das sessões deste livro
// (crates/core/src/sessoes.rs: avanço em sequência pelo tempo ativo); sem leitura bastante, não
// há estimativa, e nada aparece. Tom neutro: é uma conta, não uma cobrança.
import type { Comando } from "./comandos";

export interface Estimativa {
  /** Segundos até o fim do capítulo (`null` se não se sabe onde ele acaba). */
  capitulo: number | null;
  /** Segundos até o fim do livro. */
  livro: number;
}

/** "menos de 1 min", "~12 min", "~1 h 20 min", "~4 h" (acima de 1 h, de 10 em 10 min). */
export function duracaoAproximada(segundos: number): string {
  const minutos = segundos / 60;
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 59.5) return `~${Math.round(minutos)} min`;
  let horas = Math.floor(minutos / 60);
  let resto = Math.round((minutos % 60) / 10) * 10;
  if (resto === 60) [horas, resto] = [horas + 1, 0];
  return resto ? `~${horas} h ${resto} min` : `~${horas} h`;
}

/**
 * Quanto falta a partir de `fracao` (0 a 1 no livro), com o `ritmo` (fração por segundo).
 * `fimDoCapitulo`: onde o capítulo atual acaba (fração), se o leitor sabe.
 */
export function estimar(
  fracao: number,
  ritmo: number | null,
  fimDoCapitulo: number | null = null,
): Estimativa | null {
  if (!ritmo || ritmo <= 0 || !Number.isFinite(ritmo)) return null;
  const livro = Math.max(0, 1 - fracao) / ritmo;
  const capitulo =
    fimDoCapitulo !== null && fimDoCapitulo > fracao ? (fimDoCapitulo - fracao) / ritmo : null;
  return { capitulo, livro };
}

/** O texto curto do rodapé: o capítulo, se se sabe; senão, o livro. */
export function textoDoRodape(e: Estimativa, formato: "epub" | "pdf"): string {
  if (e.capitulo !== null) return `${duracaoAproximada(e.capitulo)} no capítulo`;
  return `${duracaoAproximada(e.livro)} no ${formato === "pdf" ? "documento" : "livro"}`;
}

/** A frase completa (paleta, leitor de tela). */
export function textoCompleto(e: Estimativa, formato: "epub" | "pdf"): string {
  const obra = formato === "pdf" ? "documento" : "livro";
  const livro = `${duracaoAproximada(e.livro)} até o fim do ${obra}`;
  return e.capitulo !== null
    ? `No seu ritmo neste ${obra}: ${duracaoAproximada(e.capitulo)} até o fim do capítulo e ${livro}.`
    : `No seu ritmo neste ${obra}: ${livro}.`;
}

/** O comando "Quanto falta?" da paleta: anuncia a estimativa (ou diz por que não há). */
export function comandoQuantoFalta(
  e: Estimativa | null,
  formato: "epub" | "pdf",
  anunciar: (texto: string) => void,
): Comando {
  return {
    id: "quanto-falta",
    titulo: "Quanto falta?",
    grupo: "Sessão",
    dica: e ? textoDoRodape(e, formato) : undefined,
    palavras: "tempo estimativa ritmo fim capítulo",
    executar: () =>
      anunciar(
        e
          ? textoCompleto(e, formato)
          : "Ainda não há leitura bastante neste livro para estimar o seu ritmo: leia mais uns minutos.",
      ),
  };
}
