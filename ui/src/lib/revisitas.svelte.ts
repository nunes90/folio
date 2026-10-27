// Trechos revisitados (M21b), do lado da interface: o leitor diz em que trecho entrou (no EPUB,
// o capítulo; no PDF, a seção do sumário ou um bloco de 10 páginas); o core conta as voltas
// (crates/core/src/visitas.rs). A partir da 3ª volta, um aviso discreto, em tom neutro; na
// paleta, "Ir para trecho revisitado: …".
import { trechosRevisitados, visitarTrecho, type Trecho, type Visita } from "./biblioteca";
import type { Comando } from "./comandos";
import { log } from "./log";

/** A partir de quantas voltas o aviso aparece. */
export const VOLTAS_PARA_AVISAR = 3;

/** A partir de quantas voltas o trecho entra na paleta. */
export const VOLTAS_PARA_LISTAR = 2;

/** No PDF sem sumário, um trecho é um bloco de tantas páginas. */
export const PAGINAS_POR_TRECHO = 10;

export function textoDaVolta(v: Visita): string {
  return `Você voltou a “${v.rotulo}” ${v.voltas} vezes.`;
}

/** O trecho de uma página do PDF sem sumário: "páginas 41–50". */
export function trechoDePaginas(pagina: number, total: number): Trecho {
  const ordem = Math.floor((pagina - 1) / PAGINAS_POR_TRECHO);
  const de = ordem * PAGINAS_POR_TRECHO + 1;
  const ate = Math.min(total, de + PAGINAS_POR_TRECHO - 1);
  return { ordem, rotulo: de === ate ? `página ${de}` : `páginas ${de}–${ate}`, local: `pagina:${de}` };
}

export class Revisitas {
  /** Os trechos a que se voltou pelo menos VOLTAS_PARA_LISTAR vezes, dos mais aos menos. */
  lista = $state<Visita[]>([]);
  #livroId: () => string;
  #avisar: (texto: string) => void;
  #atual: number | null = null;

  constructor(livroId: () => string, avisar: (texto: string) => void) {
    this.#livroId = livroId;
    this.#avisar = avisar;
  }

  async carregar(): Promise<void> {
    try {
      this.lista = await trechosRevisitados(this.#livroId(), VOLTAS_PARA_LISTAR);
    } catch (e) {
      log.warn(`trechos revisitados: ${e}`);
    }
  }

  /** O leitor está no trecho. Só a entrada conta: andar dentro dele não avisa o core de novo. */
  async entrar(trecho: Trecho): Promise<void> {
    if (trecho.ordem === this.#atual) return;
    this.#atual = trecho.ordem;
    try {
      const v = await visitarTrecho(this.#livroId(), trecho);
      if (!v.voltou) return;
      if (v.voltas >= VOLTAS_PARA_AVISAR) this.#avisar(textoDaVolta(v));
      await this.carregar();
    } catch (e) {
      log.warn(`visita ao trecho: ${e}`);
    }
  }
}

/** "Ir para trecho revisitado: Capítulo 3" na paleta, com quantas voltas. */
export function comandosDasRevisitas(lista: Visita[], ir: (local: string) => void): Comando[] {
  return lista.map((v) => ({
    id: `revisitado-${v.ordem}`,
    titulo: `Ir para trecho revisitado: ${v.rotulo}`,
    grupo: "Sessão",
    dica: `${v.voltas} voltas`,
    palavras: "voltei releitura difícil",
    executar: () => ir(v.local),
  }));
}
