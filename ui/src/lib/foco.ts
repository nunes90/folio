/**
 * Um diálogo aberto com o foco dentro do livro (iframe) não consegue devolvê-lo e ele cai no `body`, de
 * onde as teclas funcionam mas o leitor de tela não sabe onde está. Leva o foco à área do livro, ao
 * livro atual da biblioteca ou, sem livros à vista, à estante atual. Se o foco está em outro lugar, não mexe.
 */
export function recuperarFoco(): void {
  const raiz = document;
  if (raiz.activeElement && raiz.activeElement !== raiz.body) return;
  raiz
    .querySelector<HTMLElement>(
      '.conteudo[tabindex="-1"], button.livro[tabindex="0"], nav[aria-label="Estantes"] button[tabindex="0"]',
    )
    ?.focus();
}
