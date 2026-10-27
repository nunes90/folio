// Acesso à biblioteca (crates/core/src/biblioteca.rs) pelos comandos do Tauri.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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
  /** Ids das coleções em que o livro está. */
  colecoes: number[];
  /** Quantos destaques o livro tem. */
  destaques: number;
}

/** Cor do marca-texto (`Cor` no core). Nunca é a única informação: o nome vai junto. */
export type CorDestaque = "amarelo" | "verde" | "azul" | "rosa";

/** Por que o trecho foi marcado (`Motivo` no core); independente da cor. */
export type MotivoDestaque = "duvida" | "citar" | "revisar";

/** Espelha `Destaque` do core (crates/core/src/destaques.rs). */
export interface Destaque {
  id: number;
  livroId: string;
  /** Onde o trecho está: no EPUB, um CFI de intervalo. */
  local: string;
  trecho: string;
  cor: CorDestaque;
  motivo: MotivoDestaque | null;
  nota: string | null;
  /** Título da seção (do índice) em que o trecho está. */
  capitulo: string | null;
  /** 0 a 1 no livro: a ordem de leitura. */
  posicao: number;
  criadoEm: number;
  atualizadoEm: number;
}

/** O que o leitor manda para criar um destaque (`NovoDestaque` no core). */
export interface NovoDestaque {
  local: string;
  trecho: string;
  cor?: CorDestaque;
  motivo?: MotivoDestaque | null;
  nota?: string | null;
  capitulo?: string | null;
  posicao: number;
}

/** Coleção criada pelo usuário, com quantos livros (fora da lixeira) ela tem. */
export interface Colecao {
  id: number;
  nome: string;
  quantidade: number;
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
export function listarColecoes(): Promise<Colecao[]> {
  return invoke<Colecao[]>("listar_colecoes");
}

/** Falha (com a mensagem para o usuário) se o nome for vazio ou já existir. */
export function criarColecao(nome: string): Promise<Colecao> {
  return invoke<Colecao>("criar_colecao", { nome });
}

export function renomearColecao(id: number, nome: string): Promise<void> {
  return invoke("renomear_colecao", { id, nome });
}

/** Os livros continuam na biblioteca. */
export function apagarColecao(id: number): Promise<void> {
  return invoke("apagar_colecao", { id });
}

export function adicionarAColecao(colecao: number, livro: string): Promise<void> {
  return invoke("adicionar_a_colecao", { colecao, livro });
}

export function removerDaColecao(colecao: number, livro: string): Promise<void> {
  return invoke("remover_da_colecao", { colecao, livro });
}

/** Diálogo "Salvar como" para o Markdown dos destaques; null se cancelado. */
export function escolherDestinoMarkdown(nomeSugerido: string): Promise<string | null> {
  return save({
    title: "Exportar destaques",
    defaultPath: nomeSugerido,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
}

export function listarDestaques(livro: string): Promise<Destaque[]> {
  return invoke<Destaque[]>("listar_destaques", { livro });
}

export function criarDestaque(livro: string, novo: NovoDestaque): Promise<Destaque> {
  return invoke<Destaque>("criar_destaque", { livro, novo });
}

export function definirCorDestaque(id: number, cor: CorDestaque): Promise<Destaque> {
  return invoke<Destaque>("definir_cor_destaque", { id, cor });
}

/** `null` tira o motivo. */
export function definirMotivoDestaque(id: number, motivo: MotivoDestaque | null): Promise<Destaque> {
  return invoke<Destaque>("definir_motivo_destaque", { id, motivo });
}

/** `null` ou só espaços apagam a nota. */
export function definirNotaDestaque(id: number, nota: string | null): Promise<Destaque> {
  return invoke<Destaque>("definir_nota_destaque", { id, nota });
}

/** Devolve o destaque apagado, para o "Desfazer" (`restaurarDestaque`). */
export function apagarDestaque(id: number): Promise<Destaque> {
  return invoke<Destaque>("apagar_destaque", { id });
}

export function restaurarDestaque(destaque: Destaque): Promise<Destaque> {
  return invoke<Destaque>("restaurar_destaque", { destaque });
}

/** Grava os destaques (com `motivo`, só os dele) em Markdown no caminho escolhido; devolve quantos foram. */
export function exportarDestaques(
  livro: string,
  caminho: string,
  motivo: MotivoDestaque | null = null,
): Promise<number> {
  return invoke<number>("exportar_destaques", { livro, caminho, motivo });
}

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

/** Uma sessão de leitura (M20; ver crates/core/src/sessoes.rs). Datas em segundos (UTC). */
export interface Sessao {
  id: number;
  livroId: string;
  inicio: number;
  /** O último aviso. */
  fim: number;
  /** Segundos lendo de fato, sem as pausas longas. */
  ativo: number;
  de: Progresso;
  ate: Progresso;
  /** Fração do livro lida em sequência (sem voltas nem saltos): a base do ritmo. */
  avanco: number;
}

export function iniciarSessao(livro: string, onde: Progresso): Promise<Sessao> {
  return invoke<Sessao>("iniciar_sessao", { livro, onde });
}

/** A leitura continua; com `onde`, mudou de lugar. */
export function registrarSessao(id: number, onde?: Progresso): Promise<Sessao> {
  return invoke<Sessao>("registrar_sessao", { id, onde: onde ?? null });
}

/** `null`: a sessão foi curta demais e não saiu do lugar (não fica). */
export function encerrarSessao(id: number, onde?: Progresso): Promise<Sessao | null> {
  return invoke<Sessao | null>("encerrar_sessao", { id, onde: onde ?? null });
}

export function listarSessoes(livro: string): Promise<Sessao[]> {
  return invoke<Sessao[]>("listar_sessoes", { livro });
}

/** O ritmo no livro, em fração do livro por segundo de leitura; `null` sem dado bastante. */
export function ritmoDeLeitura(livro: string): Promise<number | null> {
  return invoke<number | null>("ritmo_de_leitura", { livro });
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
