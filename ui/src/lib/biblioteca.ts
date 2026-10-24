// Acesso à biblioteca (crates/core/src/biblioteca.rs) pelos comandos do Tauri.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { log } from "./log";

/** Espelha `LivroNaBiblioteca` do core (serializado em camelCase). */
/** Em que pé está a leitura (calculada no core, a partir da fração lida). */
export type Situacao = "nao-iniciado" | "lendo" | "concluido";

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
  situacao: Situacao;
  /** Marcado "para ler" em (segundos desde 1970); sai ao abrir o livro. */
  paraLerEm: number | null;
  /** Marcado como lido à mão em; vence o progresso na situação. */
  lidoEm: number | null;
  /** Na lixeira desde; livros na lixeira não vêm em `listarLivros`. */
  removidoEm: number | null;
  /** Favoritado em. */
  favoritoEm: number | null;
}

export interface Progresso {
  localizacao: string;
  fracao: number;
}

export interface Importacao {
  importados: Livro[];
  /** Arquivos que já estavam na biblioteca (mesmo conteúdo): nada foi copiado. */
  jaExistentes: Livro[];
  /** Estavam na lixeira e voltaram para a estante. */
  restaurados: Livro[];
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
    filters: [{ name: "Livros (EPUB, PDF)", extensions: ["epub", "pdf"] }],
  });
  return escolhidos ?? [];
}

export async function importarLivros(caminhos: string[]): Promise<Importacao> {
  const resultado = await invoke<Importacao>("importar_livros", { caminhos });
  log.info(
    `importados: ${resultado.importados.length}, já existentes: ${resultado.jaExistentes.length}, ` +
      `falhas: ${resultado.falhas.length}`,
  );
  return resultado;
}

/** Bytes do livro para leitura; registra a abertura (ordem de leitura recente). */
export function carregarLivro(livro: Livro): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("abrir_livro", { id: livro.id });
}

/** Remove da biblioteca a cópia do livro, a capa e o progresso; o arquivo original fica. */
export function listarLixeira(): Promise<Livro[]> {
  return invoke<Livro[]>("listar_lixeira");
}

export function definirFavorito(id: string, favorito: boolean): Promise<void> {
  return invoke("definir_favorito", { id, favorito });
}

export function definirParaLer(id: string, paraLer: boolean): Promise<void> {
  return invoke("definir_para_ler", { id, paraLer });
}

/** Lido à mão: vence o progresso. Desmarcar volta à situação do progresso. */
export function definirLido(id: string, lido: boolean): Promise<void> {
  return invoke("definir_lido", { id, lido });
}

/** Reversível: o livro fica na lixeira, com cópia, capa e progresso, até restaurar ou esvaziar. */
export function moverParaLixeira(id: string): Promise<void> {
  return invoke("mover_para_lixeira", { id });
}

export function restaurarLivro(id: string): Promise<void> {
  return invoke("restaurar_livro", { id });
}

/** Apaga de vez a cópia, a capa e o progresso; o arquivo original fica. */
export function apagarLivro(id: string): Promise<void> {
  return invoke("apagar_livro", { id });
}

/** Apaga de vez tudo o que está na lixeira; devolve quantos livros foram. */
export function esvaziarLixeira(): Promise<number> {
  return invoke<number>("esvaziar_lixeira");
}

/** Bytes do livro sem registrar abertura (para gerar a capa de PDFs). */
export function arquivoDoLivro(id: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("arquivo_livro", { id });
}

/** Envia a capa como bytes crus (sem JSON); id e tipo vão nos cabeçalhos. */
export async function definirCapa(id: string, capa: Blob): Promise<Livro> {
  return invoke<Livro>("definir_capa", new Uint8Array(await capa.arrayBuffer()), {
    headers: { livro: id, tipo: capa.type },
  });
}

export function progressoDoLivro(id: string): Promise<Progresso | null> {
  return invoke("progresso_livro", { id });
}

export function salvarProgresso(id: string, progresso: Progresso): Promise<void> {
  return invoke("salvar_progresso", { id, progresso });
}

/** URL da capa pelo protocolo de assets (escopo restrito ao cache de capas). */
export function urlDaCapa(livro: Livro): string | null {
  if (!livro.capa) return null;
  // No `cargo tauri dev`, o Vite serve as capas (ver capasNoDev em vite.config.ts).
  if (import.meta.env.DEV) return `/__capas/${livro.capa.split(/[\\/]/).pop()}`;
  return convertFileSrc(livro.capa);
}

export function caminhoInicial(): Promise<string | null> {
  return invoke<string | null>("caminho_inicial");
}
