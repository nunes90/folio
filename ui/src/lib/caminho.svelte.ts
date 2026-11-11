// "De onde vim" (M35a): os pontos de onde se saltou no livro (um link, o índice, um destaque, o
// slider), para voltar com Alt+←. Igual nos dois formatos: `P` é o ponto (um CFI no EPUB, a página
// no PDF). Virar páginas não entra: só saltos.
import type { Comando } from "./comandos";

const LIMITE = 30;

export class Caminho<P> {
  /** Quantos pontos há para voltar (reativo: o comando da paleta aparece e some). */
  quantos = $state(0);
  #pilha: P[] = [];

  /**
   * Vai saltar a partir de `ponto`: ele passa a ser o lugar para onde voltar. Devolve se entrou
   * (não entra um ponto vazio nem o mesmo duas vezes seguidas).
   */
  sair(ponto: P | null | undefined): boolean {
    if (ponto === null || ponto === undefined || this.#pilha.at(-1) === ponto) return false;
    this.#pilha.push(ponto);
    if (this.#pilha.length > LIMITE) this.#pilha.shift();
    this.quantos = this.#pilha.length;
    return true;
  }

  /** O ponto do último salto (sai da pilha); `null` se não há para onde voltar. */
  voltar(): P | null {
    const ponto = this.#pilha.pop() ?? null;
    this.quantos = this.#pilha.length;
    return ponto;
  }

  /** O comando da paleta, enquanto houver para onde voltar. */
  comandos(voltar: () => void): Comando[] {
    if (!this.quantos) return [];
    return [
      {
        id: "voltar-ao-ponto",
        titulo: "Voltar para onde eu estava",
        grupo: "Leitura",
        palavras: "link nota retornar de onde vim",
        teclas: [["Alt", "←"]],
        executar: voltar,
      },
    ];
  }
}

/** Alt+← (sem outras modificadoras): voltar para onde se estava. */
export function ehVoltar(e: KeyboardEvent): boolean {
  return e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.key === "ArrowLeft";
}
