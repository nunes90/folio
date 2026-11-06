// Contornos de defeitos do WebKitGTK no conteúdo dos livros.

/**
 * Tira o espaço entre o último `<br>` de um bloco e o fim dele. Em versos (`<br>` e uma quebra de
 * linha antes de `</p>`), esse nó fazia o WebKitGTK abortar o processo da página quando um leitor
 * de tela pedia os atributos do texto (ver docs/leitor-de-tela.md). Não aparece na tela nem muda os
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

/** O que o `for await` do pdf.js precisa de um `ReadableStream`. */
interface FluxoComLeitor {
  getReader(): { read(): Promise<{ done: boolean; value?: unknown }>; releaseLock(): void };
}

/**
 * Faz o `for await` funcionar num `ReadableStream`. O WebKitGTK do AppImage (2.50, do Ubuntu 22.04)
 * ainda não o permite, e sem isso o `getTextContent` do pdf.js falha ("undefined is not a function").
 */
export function permitirForAwaitEmStreams(prototipo: object): void {
  if (Symbol.asyncIterator in prototipo) return;
  Object.defineProperty(prototipo, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* (this: FluxoComLeitor) {
      const leitor = this.getReader();
      try {
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) return;
          yield value;
        }
      } finally {
        leitor.releaseLock();
      }
    },
  });
}
