import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { log } from "./log";

/** Mostra o diálogo do sistema (xdg-desktop-portal no Linux). Null se o usuário cancelar. */
export async function escolherArquivo(): Promise<string | null> {
  return open({
    multiple: false,
    directory: false,
    filters: [{ name: "EPUB", extensions: ["epub"] }],
  });
}

/** Caminho passado na linha de comando, se houver. */
export function caminhoInicial(): Promise<string | null> {
  return invoke<string | null>("caminho_inicial");
}

/** Lê o livro pelo core (que valida o formato) e devolve um File para o foliate-js. */
export async function carregarLivro(caminho: string): Promise<File> {
  const bytes = await invoke<ArrayBuffer>("abrir_livro", { caminho });
  const nome = caminho.split(/[\\/]/).pop() ?? "livro.epub";
  log.info(`livro carregado: ${nome} (${bytes.byteLength} bytes)`);
  return new File([bytes], nome, { type: "application/epub+zip" });
}
