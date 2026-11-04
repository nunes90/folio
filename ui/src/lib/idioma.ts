// O idioma de um texto pelas palavras mais comuns, para quando o arquivo não o declara (a maioria
// dos PDFs não tem `/Lang` no catálogo). Ele escolhe a voz: a natural para o inglês, e a do sistema
// no idioma certo para os outros.

/** Palavras curtas e frequentes de cada idioma, sem as que dois deles compartilham ("a", "de", "en"). */
const PALAVRAS: Record<string, readonly string[]> = {
  en: ["the", "and", "of", "to", "is", "in", "that", "it", "with", "for", "this", "are", "was", "you", "be", "as", "on", "or", "not", "can"],
  pt: ["não", "que", "um", "uma", "do", "da", "dos", "das", "para", "com", "é", "os", "as", "ao", "no", "na", "mais", "são", "também", "isso"],
  es: ["el", "los", "las", "del", "y", "que", "un", "una", "por", "con", "es", "para", "al", "lo", "se", "su", "más", "como", "está", "pero"],
  fr: ["le", "les", "des", "et", "est", "une", "du", "pour", "dans", "pas", "qui", "sur", "au", "avec", "ce", "il", "sont", "mais", "ou", "nous"],
  de: ["der", "die", "das", "und", "ist", "nicht", "ein", "eine", "mit", "den", "zu", "von", "auf", "für", "sich", "dem", "auch", "es", "im", "wir"],
};

/** Menos palavras que isto: não dá para dizer (um título, um número de página). */
const PALAVRAS_MINIMAS = 30;

/**
 * O idioma provável de `texto` ("en", "pt", "es", "fr", "de") ou `null` se não der para dizer:
 * pouco texto, poucas palavras comuns ou dois idiomas parecidos demais.
 */
export function idiomaDoTexto(texto: string): string | null {
  const palavras = texto.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (palavras.length < PALAVRAS_MINIMAS) return null;
  const contagem = Object.entries(PALAVRAS).map(([idioma, lista]) => {
    const conjunto = new Set(lista);
    return { idioma, n: palavras.filter((p) => conjunto.has(p)).length };
  });
  contagem.sort((a, b) => b.n - a.n);
  const [primeiro, segundo] = contagem;
  // Num texto comum, essas palavras são de 20% a 40% de todas; código ou uma lista de nomes, bem menos.
  if (primeiro.n < palavras.length * 0.1) return null;
  if (primeiro.n < segundo.n * 2) return null;
  return primeiro.idioma;
}
