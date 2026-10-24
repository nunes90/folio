// Busca e filtros da biblioteca. Funções puras: a lista inteira já está na memória da
// interface, então filtrar a cada tecla é instantâneo, sem ir ao core.
import { chavesDoLivro } from "./autores";
import type { Livro } from "./biblioteca";

/** As vistas fixas da barra lateral. */
export type Vista = "todos" | "favoritos" | "lendo" | "para-ler" | "lidos" | "lixeira";

/**
 * O que a área principal mostra: uma vista fixa, a lista de autores (`autores`), os livros de
 * um autor (`autor:<chave>`, ver lib/autores.ts) ou os de uma coleção (`colecao:<id>`).
 */
export type Filtro = Vista | "autores" | `autor:${string}` | `colecao:${number}`;

/** Chave do autor, se o filtro for de um autor ("" = livros sem autor). */
export function chaveDoAutor(filtro: Filtro): string | null {
  return filtro.startsWith("autor:") ? filtro.slice("autor:".length) : null;
}

/** Id da coleção, se o filtro for de coleção. */
export function idDaColecao(filtro: Filtro): number | null {
  return filtro.startsWith("colecao:") ? Number(filtro.slice("colecao:".length)) : null;
}

// Um livro na lixeira só aparece na estante "lixeira".
const NA_ESTANTE: Record<Vista, (livro: Livro) => boolean> = {
  todos: (l) => l.removidoEm === null,
  favoritos: (l) => l.removidoEm === null && l.favoritoEm !== null,
  lendo: (l) => l.removidoEm === null && l.situacao === "lendo",
  "para-ler": (l) => l.removidoEm === null && l.paraLerEm !== null,
  lidos: (l) => l.removidoEm === null && l.situacao === "concluido",
  lixeira: (l) => l.removidoEm !== null,
};

/** Minúsculas, sem acentos e sem espaços nas pontas: "Aluísio" e "aluisio" se encontram. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Livros cujo título ou autores contêm todas as palavras do termo, em qualquer ordem. */
function buscar(livros: Livro[], termo: string): Livro[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return livros;
  return livros.filter((livro) => {
    const texto = normalizar([livro.titulo, ...livro.autores].join(" "));
    return palavras.every((p) => texto.includes(p));
  });
}

function naColecao(id: number): (livro: Livro) => boolean {
  return (l) => l.removidoEm === null && l.colecoes.includes(id);
}

function doAutor(chave: string): (livro: Livro) => boolean {
  return (l) => l.removidoEm === null && chavesDoLivro(l).includes(chave);
}

function naSituacao(livros: Livro[], filtro: Filtro): Livro[] {
  // A lista de autores não é uma estante de livros.
  if (filtro === "autores") return [];
  const colecao = idDaColecao(filtro);
  if (colecao !== null) return livros.filter(naColecao(colecao));
  const autor = chaveDoAutor(filtro);
  if (autor !== null) return livros.filter(doAutor(autor));
  return livros.filter(NA_ESTANTE[filtro as Vista]);
}

/** O que a grade mostra: a busca e o filtro juntos, na ordem original (atividade recente). */
export function filtrarLivros(livros: Livro[], termo: string, filtro: Filtro): Livro[] {
  return naSituacao(buscar(livros, termo), filtro);
}

/** Quantos livros cada filtro mostraria com o termo atual (os números nos botões). */
export function contarPorFiltro(livros: Livro[], termo: string): Record<Vista, number> {
  const achados = buscar(livros, termo);
  return {
    todos: naSituacao(achados, "todos").length,
    favoritos: naSituacao(achados, "favoritos").length,
    lendo: naSituacao(achados, "lendo").length,
    "para-ler": naSituacao(achados, "para-ler").length,
    lidos: naSituacao(achados, "lidos").length,
    lixeira: naSituacao(achados, "lixeira").length,
  };
}

/** Quantos livros (fora da lixeira) cada coleção mostraria com o termo atual. */
export function contarPorColecao(
  livros: Livro[],
  termo: string,
  colecoes: number[],
): Record<number, number> {
  const achados = buscar(livros, termo);
  return Object.fromEntries(colecoes.map((id) => [id, achados.filter(naColecao(id)).length]));
}
