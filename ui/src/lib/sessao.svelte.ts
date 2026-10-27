// A sessão de leitura do livro aberto (M20), do lado da interface: avisa o core quando a
// leitura começa, muda de lugar, continua (atividade) e termina. O tempo é contado no core
// (crates/core/src/sessoes.rs), que limita cada intervalo a 5 minutos.
//
// A sessão começa no primeiro progresso que o leitor publica (ao abrir, ele diz onde está).
// As chamadas vão numa fila, na ordem: um aviso não pode chegar antes de a sessão existir.
import {
  encerrarSessao,
  iniciarSessao,
  registrarSessao,
  type Progresso,
  type Sessao,
} from "./biblioteca";
import { log } from "./log";

/** Sem mudar de lugar, a atividade (tecla, ponteiro, rolagem) avisa no máximo uma vez por minuto. */
export const INTERVALO_ATIVIDADE_MS = 60_000;

export class SessaoDeLeitura {
  /** A sessão como o core a devolveu no último aviso (`null` antes de começar). */
  atual = $state<Sessao | null>(null);
  #fila: Promise<unknown> = Promise.resolve();
  #ultimoAviso = 0;
  #onde: Progresso | null = null;
  #encerrada = false;

  readonly #livroId: string;
  readonly #relogio: () => number;

  /** `relogio` em milissegundos (trocável nos testes). */
  constructor(livroId: string, relogio: () => number = Date.now) {
    this.#livroId = livroId;
    this.#relogio = relogio;
  }

  /** O leitor mudou de lugar (ou abriu o livro: aí a sessão começa). */
  mover(onde: Progresso): void {
    if (this.#encerrada) return;
    const primeira = this.#onde === null;
    this.#onde = onde;
    if (primeira) this.#enfileirar(() => iniciarSessao(this.#livroId, onde), true);
    else this.#enfileirar((id) => registrarSessao(id, onde));
  }

  /** Houve atividade: avisa se faz mais de um minuto desde o último aviso. */
  atividade(): void {
    if (this.#encerrada || this.#onde === null) return;
    if (this.#relogio() - this.#ultimoAviso < INTERVALO_ATIVIDADE_MS) return;
    this.#enfileirar((id) => registrarSessao(id));
  }

  /** Ao fechar o livro: o último aviso. Devolve a sessão (ou `null`, se não ficou). */
  async encerrar(): Promise<Sessao | null> {
    if (this.#encerrada) return this.atual;
    this.#encerrada = true;
    if (this.#onde === null) return null;
    await this.#enfileirar((id) => encerrarSessao(id));
    return this.atual;
  }

  /** Põe a chamada na fila. Sem sessão (o início falhou), os avisos seguintes não vão. */
  #enfileirar(chamada: (id: number) => Promise<Sessao | null>, inicio = false): Promise<unknown> {
    this.#ultimoAviso = this.#relogio();
    this.#fila = this.#fila
      .then(() => {
        const id = this.atual?.id;
        if (id === undefined && !inicio) return this.atual;
        return chamada(id ?? -1);
      })
      .then((sessao) => (this.atual = sessao))
      .catch((e) => log.warn(`sessão de leitura: ${e}`));
    return this.#fila;
  }
}
