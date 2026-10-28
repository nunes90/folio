// Realce da frase lida em voz alta (M23b), igual no EPUB e no PDF: desenhado como os destaques
// (o Overlayer do foliate-js no EPUB, a camada de retângulos no PDF), com a cor de destaque da
// interface. Antes era a seleção do texto: um clique a desfazia e ela sumia na pausa. A CSS
// Custom Highlight API foi tentada e descartada: no WebKitGTK 2.54 a frase anterior continuava
// pintada (a área antiga não era redesenhada) e as caixas não seguiam as linhas.

/** A cor do realce: o destaque da interface (a mistura e a opacidade são as do marca-texto). */
export function corDoRealce(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--destaque").trim() || "#2563eb";
}
