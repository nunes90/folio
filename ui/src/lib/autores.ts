// Autores da biblioteca, a partir dos metadados de cada livro (sem nada novo no core): a
// lista inteira já está na interface. Grafias que só diferem em acentos ou maiúsculas
// ("Machado de Assis", "machado de assís") contam como o mesmo autor.
import type { Livro } from "./biblioteca";
import { normalizar } from "./filtro";

export const SEM_AUTOR = "Autor desconhecido";

export interface Autor {
  /** Nome normalizado; "" para livros sem autor. Vai no filtro `autor:<chave>`. */
  chave: string;
  /** A grafia mais comum na biblioteca (no empate, a primeira que aparece). */
  nome: string;
  /** Livros fora da lixeira. */
  quantidade: number;
}

/** Chaves dos autores de um livro (`[""]` se ele não tem autor). */
export function chavesDoLivro(livro: Livro): string[] {
  const chaves = livro.autores.map(normalizar).filter(Boolean);
  return chaves.length ? chaves : [""];
}

/** Autores em ordem alfabética (o desconhecido no fim); `termo` filtra pelo nome. */
export function agruparPorAutor(livros: Livro[], termo = ""): Autor[] {
  const grupos = new Map<string, { grafias: Map<string, number>; quantidade: number }>();
  for (const livro of livros) {
    if (livro.removidoEm !== null) continue;
    const nomes = livro.autores.filter((a) => normalizar(a));
    for (const nome of nomes.length ? nomes : [SEM_AUTOR]) {
      const chave = nomes.length ? normalizar(nome) : "";
      const grupo = grupos.get(chave) ?? { grafias: new Map(), quantidade: 0 };
      grupo.quantidade++;
      grupo.grafias.set(nome.trim(), (grupo.grafias.get(nome.trim()) ?? 0) + 1);
      grupos.set(chave, grupo);
    }
  }
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  const autores = [...grupos].map(([chave, { grafias, quantidade }]) => {
    // Map mantém a ordem de inserção: no empate, fica a primeira grafia vista.
    const [nome] = [...grafias].reduce((melhor, atual) => (atual[1] > melhor[1] ? atual : melhor));
    return { chave, nome, quantidade };
  });
  return autores
    .filter((a) => palavras.every((p) => normalizar(a.nome).includes(p)))
    .sort((a, b) =>
      a.chave === "" ? 1 : b.chave === "" ? -1 : a.nome.localeCompare(b.nome, "pt-BR"),
    );
}
