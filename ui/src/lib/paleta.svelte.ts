// A paleta de comandos (Ctrl+K) aberta ou fechada, num lugar só: além do atalho (no App), um
// botão na biblioteca e um item no menu ⋯ do leitor a abrem (M37: quem não conhece o atalho
// nunca chegava aos recursos que só existem nela).
export const paleta = $state({ aberta: false });

/** Abre a paleta, a não ser por cima de outro diálogo (confirmação, atalhos…). */
export function abrirPaleta(): void {
  if (!document.querySelector("dialog[open]")) paleta.aberta = true;
}
