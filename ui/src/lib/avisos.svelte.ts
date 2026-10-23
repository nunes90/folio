// Avisos passageiros (toasts): resultado de importar, remover, erros. Um estado só para o
// app todo; quem mostra é Avisos.svelte. Sucesso some sozinho (com pausa sob o ponteiro ou
// o foco, WCAG 2.2.1); erro fica até ser fechado, para dar tempo de ler.
import type { Importacao } from "./biblioteca";

/** `progresso`: algo em andamento ("Importando…"); some quando o trabalho termina. */
export type TipoAviso = "sucesso" | "erro" | "progresso";

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

/** Quanto tempo um aviso de sucesso fica na tela (sem contar as pausas). */
export const DURACAO_AVISO_MS = 6000;

export const avisos = $state<Aviso[]>([]);

let proximoId = 1;

/** Mostra um aviso e devolve o id dele. */
export function avisar(texto: string, tipo: TipoAviso = "sucesso"): number {
  const id = proximoId++;
  avisos.push({ id, tipo, texto });
  return id;
}

export function dispensar(id: number): void {
  const i = avisos.findIndex((a) => a.id === id);
  if (i >= 0) avisos.splice(i, 1);
}

/**
 * Espera `trabalho` e, se ele passar de `atrasoMs`, mostra `texto` como aviso de progresso até
 * terminar. Trabalho rápido não pisca aviso nenhum (o mesmo critério de Carregando.svelte).
 */
export async function avisarSeDemorar<T>(
  trabalho: Promise<T>,
  texto: string,
  atrasoMs = 400,
): Promise<T> {
  let id: number | undefined;
  const espera = setTimeout(() => (id = avisar(texto, "progresso")), atrasoMs);
  try {
    return await trabalho;
  } finally {
    clearTimeout(espera);
    if (id !== undefined) dispensar(id);
  }
}

/** O que dizer depois de uma importação: um aviso por resultado, sem texto vazio. */
export function mensagensDaImportacao(r: Importacao): Omit<Aviso, "id">[] {
  const mensagens: Omit<Aviso, "id">[] = [];
  const [primeiro] = r.importados;
  if (r.importados.length === 1 && primeiro) {
    mensagens.push({ tipo: "sucesso", texto: `${primeiro.titulo} foi importado.` });
  } else if (r.importados.length > 1) {
    mensagens.push({ tipo: "sucesso", texto: `${r.importados.length} livros importados.` });
  }
  const [repetido] = r.jaExistentes;
  if (r.jaExistentes.length === 1 && repetido) {
    mensagens.push({ tipo: "sucesso", texto: `${repetido.titulo} já estava na biblioteca.` });
  } else if (r.jaExistentes.length > 1) {
    mensagens.push({
      tipo: "sucesso",
      texto: `${r.jaExistentes.length} livros já estavam na biblioteca.`,
    });
  }
  for (const falha of r.falhas) {
    const nome = falha.caminho.split(/[\\/]/).pop();
    mensagens.push({ tipo: "erro", texto: `Não foi possível importar ${nome}: ${falha.erro}` });
  }
  return mensagens;
}
