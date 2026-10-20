// Acesso à biblioteca (crates/core/src/biblioteca.rs) pelos comandos do Tauri.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { log } from "./log";

/** Espelha `LivroNaBiblioteca` do core (serializado em camelCase). */
export interface Livro {
  id: string;
  formato: "epub" | "pdf";
  titulo: string;
  autores: string[];
  idioma: string | null;
  arquivo: string;
  capa: string | null;
  adicionadoEm: number;
  abertoEm: number | null;
  fracao: number | null;
}

export interface Progresso {
  localizacao: string;
  fracao: number;
}

export interface Importacao {
  importados: Livro[];
  falhas: { caminho: string; erro: string }[];
}

export function listarLivros(): Promise<Livro[]> {
  return invoke("listar_livros");
}

/** Diálogo do sistema (xdg-desktop-portal no Linux) com seleção múltipla. */
export async function escolherArquivos(): Promise<string[]> {
  const escolhidos = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "EPUB", extensions: ["epub"] }],
  });
  return escolhidos ?? [];
}

export async function importarLivros(caminhos: string[]): Promise<Importacao> {
  const resultado = await invoke<Importacao>("importar_livros", { caminhos });
  log.info(`importados: ${resultado.importados.length}, falhas: ${resultado.falhas.length}`);
  return resultado;
}

/** Bytes do livro como File, que é o que o foliate-js recebe. */
export async function carregarLivro(livro: Livro): Promise<File> {
  const bytes = await invoke<ArrayBuffer>("abrir_livro", { id: livro.id });
  return new File([bytes], `${livro.id}.epub`, { type: "application/epub+zip" });
}

export function progressoDoLivro(id: string): Promise<Progresso | null> {
  return invoke("progresso_livro", { id });
}

export function salvarProgresso(id: string, progresso: Progresso): Promise<void> {
  return invoke("salvar_progresso", { id, progresso });
}

/** URL da capa pelo protocolo de assets (escopo restrito ao cache de capas). */
export function urlDaCapa(livro: Livro): string | null {
  return livro.capa ? convertFileSrc(livro.capa) : null;
}

export function caminhoInicial(): Promise<string | null> {
  return invoke<string | null>("caminho_inicial");
}
