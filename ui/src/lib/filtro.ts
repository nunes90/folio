// Busca e filtros da biblioteca. Funções puras: a lista inteira já está na memória da
// interface, então filtrar a cada tecla é instantâneo, sem ir ao core.
import type { Livro, Situacao } from "./biblioteca";

export type Filtro = "todos" | "lendo" | "concluidos";

const SITUACAO_DO_FILTRO: Record<Exclude<Filtro, "todos">, Situacao> = {
  lendo: "lendo",
  concluidos: "concluido",
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

function naSituacao(livros: Livro[], filtro: Filtro): Livro[] {
  if (filtro === "todos") return livros;
  return livros.filter((l) => l.situacao === SITUACAO_DO_FILTRO[filtro]);
}

/** O que a grade mostra: a busca e o filtro juntos, na ordem original (atividade recente). */
export function filtrarLivros(livros: Livro[], termo: string, filtro: Filtro): Livro[] {
  return naSituacao(buscar(livros, termo), filtro);
}

/** Quantos livros cada filtro mostraria com o termo atual (os números nos botões). */
export function contarPorFiltro(livros: Livro[], termo: string): Record<Filtro, number> {
  const achados = buscar(livros, termo);
  return {
    todos: achados.length,
    lendo: naSituacao(achados, "lendo").length,
    concluidos: naSituacao(achados, "concluidos").length,
  };
}
