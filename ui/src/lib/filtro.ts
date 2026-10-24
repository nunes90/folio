// Busca e filtros da biblioteca. Funções puras: a lista inteira já está na memória da
// interface, então filtrar a cada tecla é instantâneo, sem ir ao core.
import type { Livro } from "./biblioteca";

/** As estantes da barra lateral (vistas da biblioteca). */
export type Filtro = "todos" | "lendo" | "para-ler" | "lidos" | "lixeira";

// Um livro na lixeira só aparece na estante "lixeira".
const NA_ESTANTE: Record<Filtro, (livro: Livro) => boolean> = {
  todos: (l) => l.removidoEm === null,
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

function naSituacao(livros: Livro[], filtro: Filtro): Livro[] {
  return livros.filter(NA_ESTANTE[filtro]);
}

/** O que a grade mostra: a busca e o filtro juntos, na ordem original (atividade recente). */
export function filtrarLivros(livros: Livro[], termo: string, filtro: Filtro): Livro[] {
  return naSituacao(buscar(livros, termo), filtro);
}

/** Quantos livros cada filtro mostraria com o termo atual (os números nos botões). */
export function contarPorFiltro(livros: Livro[], termo: string): Record<Filtro, number> {
  const achados = buscar(livros, termo);
  return {
    todos: naSituacao(achados, "todos").length,
    lendo: naSituacao(achados, "lendo").length,
    "para-ler": naSituacao(achados, "para-ler").length,
    lidos: naSituacao(achados, "lidos").length,
    lixeira: naSituacao(achados, "lixeira").length,
  };
}
