// A estante "Destaques" da biblioteca (M42b): os destaques de todos os livros, agrupados por
// livro, com a busca da biblioteca e o filtro por motivo. Funções puras: o core devolve a lista
// inteira, e filtrar a cada tecla é instantâneo.
import type { Destaque, Livro, MotivoDestaque } from "./biblioteca";
import { lerLocalPdf } from "./destaquesPdf";
import { normalizar } from "./filtro";

export interface GrupoDeDestaques {
  livro: Livro;
  /** Na ordem de leitura (a do core). */
  destaques: Destaque[];
}

const ordemDosTitulos = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/**
 * Os destaques agrupados por livro (os livros em ordem alfabética, com as regras do idioma), só
 * os de livros fora da lixeira, os do `motivo` (ou todos) e os que têm todas as palavras do
 * `termo` no trecho, na nota, no capítulo ou no título e autores do livro.
 */
export function agruparDestaques(
  destaques: Destaque[],
  livros: Livro[],
  termo: string,
  motivo: MotivoDestaque | null,
): GrupoDeDestaques[] {
  const porId = new Map(livros.filter((l) => l.removidoEm === null).map((l) => [l.id, l]));
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  const grupos = new Map<string, GrupoDeDestaques>();
  for (const d of destaques) {
    const livro = porId.get(d.livroId);
    if (!livro || (motivo && d.motivo !== motivo)) continue;
    if (palavras.length) {
      const texto = normalizar(
        [d.trecho, d.nota ?? "", d.capitulo ?? "", livro.titulo, ...livro.autores].join(" "),
      );
      if (!palavras.every((p) => texto.includes(p))) continue;
    }
    const grupo = grupos.get(livro.id) ?? { livro, destaques: [] };
    grupo.destaques.push(d);
    grupos.set(livro.id, grupo);
  }
  return [...grupos.values()].sort((a, b) => ordemDosTitulos.compare(a.livro.titulo, b.livro.titulo));
}

/**
 * Onde abrir o livro para mostrar o destaque: no EPUB, o próprio CFI (o leitor abre nele); no
 * PDF, a página do destaque (`pagina:N`, o formato do progresso).
 */
export function localParaAbrir(destaque: Destaque, formato: "epub" | "pdf"): string | undefined {
  if (formato === "epub") return destaque.local;
  const pdf = lerLocalPdf(destaque.local);
  return pdf ? `pagina:${pdf.pagina}` : undefined;
}

/** "4 destaques em 3 livros", para o leitor de tela e o cabeçalho da estante. */
export function resumoDaEstante(grupos: GrupoDeDestaques[]): string {
  const n = grupos.reduce((soma, g) => soma + g.destaques.length, 0);
  if (!n) return "Nenhum destaque";
  const destaques = n === 1 ? "1 destaque" : `${n} destaques`;
  const livros = grupos.length === 1 ? "1 livro" : `${grupos.length} livros`;
  return `${destaques} em ${livros}`;
}
