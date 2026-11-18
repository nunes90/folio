// Marcadores de página (M42a), iguais no EPUB e no PDF: a lista, saber se a página que se vê
// está marcada (a fitinha no canto), marcar ou tirar com Ctrl+B, tirar com Desfazer e os
// comandos da paleta. O que muda de um formato para o outro (onde se está, se um marcador cai na
// página da tela, ir até ele) vem do adaptador que cada leitor passa.
import {
  apagarMarcador,
  listarMarcadores,
  marcarPagina,
  restaurarMarcador,
  type Marcador,
  type NovoMarcador,
} from "./biblioteca";
import { avisar } from "./avisos.svelte";
import type { Comando } from "./comandos";

/** O que cada formato faz do seu jeito. */
export interface AdaptadorMarcadores {
  readonly livroId: string;
  /** O lugar da página que se vê, para gravar; `null` enquanto o livro não abriu. */
  aqui(): NovoMarcador | null;
  /** O marcador cai na página que se vê? (No EPUB, a página muda com a fonte: não é igualdade.) */
  naPagina(marcador: Marcador): boolean;
  irPara(marcador: Marcador): Promise<void>;
  /** Texto para o leitor de tela (região aria-live do leitor). */
  anunciar(texto: string): void;
}

const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

/** Como o marcador aparece na lista e na paleta: no PDF, a página; no EPUB, o capítulo. */
export function rotuloDoMarcador(m: Marcador, formato: "epub" | "pdf"): string {
  const noLivro = porcento.format(m.posicao);
  const pagina = formato === "pdf" ? /^pagina:(\d+)$/.exec(m.local)?.[1] : undefined;
  const partes = [pagina && `página ${pagina}`, m.capitulo].filter(Boolean);
  return partes.length ? `${partes.join(", ")} (${noLivro})` : `${noLivro} do livro`;
}

/** Ordem de leitura, a mesma do core: posição, depois criação. */
function ordenar(lista: Marcador[]): Marcador[] {
  return lista.sort((a, b) => a.posicao - b.posicao || a.criadoEm - b.criadoEm || a.id - b.id);
}

export class ControleMarcadores {
  lista = $state<Marcador[]>([]);
  /** O marcador da página que se vê (a fitinha); o leitor chama `conferir` quando a página muda. */
  daPagina = $state<Marcador | null>(null);
  #a: AdaptadorMarcadores;

  constructor(adaptador: AdaptadorMarcadores) {
    this.#a = adaptador;
  }

  async carregar(): Promise<void> {
    try {
      this.lista = ordenar(await listarMarcadores(this.#a.livroId));
    } catch (erro) {
      avisar(`Não foi possível carregar os marcadores: ${erro}`, "erro");
    }
    this.conferir();
  }

  /** A página mudou (ou a lista): a fitinha acompanha. */
  conferir(): void {
    this.daPagina = this.lista.find((m) => this.#a.naPagina(m)) ?? null;
  }

  /** Ctrl+B: marca a página que se vê ou, se ela já tem marcador, tira. */
  async alternar(): Promise<void> {
    if (this.daPagina) return this.apagar(this.daPagina);
    const aqui = this.#a.aqui();
    if (!aqui) return;
    try {
      this.#guardar(await marcarPagina(this.#a.livroId, aqui));
      this.#a.anunciar("Página marcada.");
    } catch (erro) {
      avisar(`Não foi possível marcar a página: ${erro}`, "erro");
    }
  }

  async apagar(marcador: Marcador): Promise<void> {
    try {
      const apagado = await apagarMarcador(marcador.id);
      this.lista = this.lista.filter((m) => m.id !== apagado.id);
      this.conferir();
      avisar("Marcador tirado.", "sucesso", {
        rotulo: "Desfazer",
        executar: () => void this.restaurar(apagado),
      });
    } catch (erro) {
      avisar(`Não foi possível tirar o marcador: ${erro}`, "erro");
    }
  }

  async restaurar(marcador: Marcador): Promise<void> {
    try {
      this.#guardar(await restaurarMarcador(marcador));
    } catch (erro) {
      avisar(`Não foi possível pôr o marcador de volta: ${erro}`, "erro");
    }
  }

  ir(marcador: Marcador): Promise<void> {
    return this.#a.irPara(marcador);
  }

  /** Os comandos da paleta: marcar ou tirar o desta página, e ir a cada marcador. */
  comandos(formato: "epub" | "pdf"): Comando[] {
    const alternar: Comando = {
      id: "marcador-alternar",
      titulo: this.daPagina ? "Tirar o marcador desta página" : "Marcar esta página",
      grupo: "Marcadores",
      palavras: "marcador favorito página",
      teclas: [["Ctrl", "B"]],
      executar: () => void this.alternar(),
    };
    return [
      alternar,
      ...this.lista.map((m) => ({
        id: `marcador-${m.id}`,
        titulo: `Ir ao marcador: ${rotuloDoMarcador(m, formato)}`,
        grupo: "Marcadores",
        executar: () => void this.ir(m),
      })),
    ];
  }

  #guardar(marcador: Marcador): void {
    this.lista = ordenar([...this.lista.filter((m) => m.id !== marcador.id), marcador]);
    this.conferir();
  }
}
