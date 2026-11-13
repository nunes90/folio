// A grade da biblioteca em lotes (M36): com milhares de livros, criar todos os cartões de uma vez
// custava segundos (5.000 livros: 3,5 s para voltar do leitor à biblioteca). A grade desenha os
// primeiros e vai acrescentando conforme a rolagem chega perto do fim (ou o teclado pede um
// livro mais adiante). A busca, as contagens e as setas continuam valendo para a lista inteira.

/** Quantos cartões entram de cada vez: umas dez telas de uma janela comum. */
export const LOTE = 120;

/** Quantos cartões desenhar para o livro de índice `indice` estar na grade (em lotes inteiros). */
export function lotesAte(indice: number, lote = LOTE): number {
  return (Math.floor(Math.max(0, indice) / lote) + 1) * lote;
}

/** O limite seguinte (mais um lote), sem passar do total. */
export function maisUmLote(limite: number, total: number, lote = LOTE): number {
  return Math.min(total, limite + lote);
}
