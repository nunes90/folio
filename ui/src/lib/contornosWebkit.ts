// Contornos de defeitos do WebKitGTK no conteúdo dos livros.

/**
 * Tira o espaço entre o último `<br>` de um bloco e o fim dele. Em versos (`<br>` e uma quebra de
 * linha antes de `</p>`), esse nó fazia o WebKitGTK abortar o processo da página quando um leitor
 * de tela pedia os atributos do texto (ver e2e/atspi/rodar.sh). Não aparece na tela nem muda os
 * CFIs: é o último nó do bloco.
 */
export function tirarEspacoAposUltimaQuebra(doc: Document): void {
  for (const br of doc.querySelectorAll("br")) {
    const seguinte = br.nextSibling;
    if (seguinte?.nodeType === Node.TEXT_NODE && !seguinte.nextSibling && !seguinte.textContent?.trim()) {
      seguinte.remove();
    }
  }
}
