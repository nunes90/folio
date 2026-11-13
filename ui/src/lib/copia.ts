// Cópia de segurança da biblioteca (M38): um arquivo `.folio-backup` (um ZIP) com o banco e,
// se a pessoa quiser, os arquivos dos livros. O core faz o trabalho (crates/core/src/copia.rs);
// aqui ficam os diálogos de arquivo e os textos.
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

export const EXTENSAO = "folio-backup";
const FILTRO = [{ name: "Cópia de segurança do Folio", extensions: [EXTENSAO] }];

/** O que a cópia diz de si. */
export interface Manifesto {
  formato: number;
  versaoDoApp: string;
  esquema: number;
  /** Segundos desde 1970 (UTC). */
  criadaEm: number;
  livros: number;
  /** Quantos arquivos de livro vieram na cópia (0 = só os dados). */
  arquivos: number;
}

export interface Restaurada {
  livros: number;
  /** Livros cujo arquivo não está na máquina: abrem depois de importados de novo. */
  semArquivo: number;
  /** Onde a biblioteca de antes foi guardada. */
  anterior: string;
}

/** "Folio 2026-11-12.folio-backup": o nome sugerido, com a data local. */
export function nomeSugerido(agora = new Date()): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `Folio ${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}.${EXTENSAO}`;
}

const livros = (n: number) => (n === 1 ? "1 livro" : `${n} livros`);

/** A data da cópia, por extenso ("12 de novembro de 2026, 18:40"). */
export function dataDaCopia(m: Manifesto): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(m.criadaEm * 1000),
  );
}

/** O que a cópia traz, para a confirmação antes de restaurar. */
export function textoDaCopia(m: Manifesto): string {
  const arquivos =
    m.arquivos === 0
      ? "sem os arquivos dos livros (só o progresso, os destaques, as coleções e as preferências)"
      : m.arquivos >= m.livros
        ? "com os arquivos dos livros"
        : `com os arquivos de ${m.arquivos} deles`;
  return `A cópia tem ${livros(m.livros)}, ${arquivos}.`;
}

/** O aviso depois de exportar. */
export function textoDaExportacao(m: Manifesto): string {
  return m.arquivos > 0
    ? `Cópia de segurança gravada: ${livros(m.livros)}, com os arquivos.`
    : `Cópia de segurança gravada: os dados de ${livros(m.livros)}, sem os arquivos.`;
}

/** O aviso depois de restaurar. */
export function textoDaRestauracao(r: Restaurada): string {
  const base = `Biblioteca restaurada: ${livros(r.livros)}.`;
  if (r.semArquivo === 0) return base;
  const faltam =
    r.semArquivo === 1
      ? "O arquivo de 1 deles não veio na cópia: importe-o de novo para abri-lo"
      : `Os arquivos de ${r.semArquivo} deles não vieram na cópia: importe-os de novo para abri-los`;
  return `${base} ${faltam} (o progresso e os destaques já estão lá).`;
}

/** Pergunta onde gravar a cópia; `null` se a pessoa desistiu no diálogo. */
export function escolherDestino(): Promise<string | null> {
  return save({ title: "Exportar a biblioteca", defaultPath: nomeSugerido(), filters: FILTRO });
}

export function exportarBiblioteca(caminho: string, comLivros: boolean): Promise<Manifesto> {
  return invoke<Manifesto>("exportar_copia", { caminho, comLivros });
}

/** Pergunta qual cópia restaurar e lê o manifesto dela; `null` se a pessoa desistiu. */
export async function escolherCopia(): Promise<{ caminho: string; manifesto: Manifesto } | null> {
  const caminho = await open({ title: "Restaurar uma cópia de segurança", multiple: false, filters: FILTRO });
  if (!caminho) return null;
  return { caminho, manifesto: await invoke<Manifesto>("ler_copia", { caminho }) };
}

export function restaurarCopia(caminho: string): Promise<Restaurada> {
  return invoke<Restaurada>("restaurar_copia", { caminho });
}
