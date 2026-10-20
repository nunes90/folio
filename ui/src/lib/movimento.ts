/** True se o sistema pede menos animação (prefers-reduced-motion). */
export function prefereMenosMovimento(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
