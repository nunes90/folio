// Paleta de comandos (Ctrl+K): cada ação do app vira um comando com nome, e a busca acha
// pelo nome. Funções puras; quem monta a lista é o App (ele sabe o contexto e as ações).
import { normalizar } from "./filtro";

export interface Comando {
  /** Único na lista (vira parte do id do elemento na paleta). */
  id: string;
  /** O que aparece e o que se busca, ex.: "Interface: escuro", "Abrir Dom Casmurro". */
  titulo: string;
  /** Categoria, mostrada ao lado do título (ex.: "Livros", "Aparência"). */
  grupo: string;
  /** Texto de apoio ao lado do título (ex.: o autor do livro, "atual"). */
  dica?: string;
  /** Mais texto para a busca, que não aparece (ex.: "tema" para os comandos de interface). */
  palavras?: string;
  /** Atalho que faz o mesmo, para ensinar (ex.: [["Ctrl", "O"]]). */
  teclas?: string[][];
  executar: () => void;
}

/** Onde a busca procura: título, dica (ex.: o autor) e palavras extras. */
function textoDe(comando: Comando): string {
  return normalizar(`${comando.titulo} ${comando.dica ?? ""} ${comando.palavras ?? ""}`);
}

/** 0: o título começa com o termo; 1: cada palavra começa uma palavra; 2: só contém. */
function relevancia(comando: Comando, termo: string, palavras: string[]): number {
  if (normalizar(comando.titulo).startsWith(termo)) return 0;
  const inicios = textoDe(comando).split(/[\s:,]+/);
  return palavras.every((p) => inicios.some((i) => i.startsWith(p))) ? 1 : 2;
}

/**
 * Comandos cujo título, dica ou palavras extras contêm todas as palavras do termo, sem acentos e
 * em qualquer ordem; os mais relevantes primeiro e, entre iguais, a ordem original.
 */
export function filtrarComandos(comandos: Comando[], termo: string): Comando[] {
  const t = normalizar(termo);
  const palavras = t.split(/\s+/).filter(Boolean);
  if (!palavras.length) return comandos;
  return comandos
    .filter((c) => {
      const texto = textoDe(c);
      return palavras.every((p) => texto.includes(p));
    })
    .map((c, i) => ({ c, i, r: relevancia(c, t, palavras) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ c }) => c);
}
