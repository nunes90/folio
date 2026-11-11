// Leitura em voz alta no leitor, igual no EPUB e no PDF (M34a; antes, escrita duas vezes, uma em
// cada leitor): o estado (parado, falando, pausado), pausar e retomar, o "Ouvir" da barra de
// destaque (só o trecho), o aviso "Preparando a voz…", o que fazer com cada evento do motor e a
// pausa enquanto a barra de destaque está aberta. O que muda de um formato para o outro (qual é o
// próximo bloco, como realçar a frase lida) vem do adaptador que cada leitor passa.
import { avisar, dispensar } from "./avisos.svelte";
import type { Comando } from "./comandos";
import { log } from "./log";
import {
  comandosDaVoz,
  falar,
  ouvirVoz,
  pararVoz,
  textoDaFalhaDaVoz,
  vozDisponivel,
  type ConfigVoz,
  type EstadoVoz,
  type EventoVoz,
} from "./voz";
import { AvisoDePreparo, SEM_VOZ } from "./vozNatural.svelte";

/** O que cada formato faz do seu jeito. `D` é de onde a leitura do livro pode começar. */
export interface AdaptadorVoz<D> {
  /**
   * Começa a ler o livro a partir de `desde` (ou de onde se está) e fala o primeiro bloco, com
   * `ControleVoz.falar`. Sem o que falar até o fim, chama `ControleVoz.acabou`.
   */
  comecar(desde?: D): Promise<void>;
  /** Uma marca do bloco em fala chegou: a frase dela passa a ser a lida. */
  aoMarcar(marca: string): void;
  /** O bloco em fala acabou: fala o seguinte (ou `acabou`, no fim do livro). */
  seguir(): Promise<void>;
  /** Fala de novo a partir da última frase marcada (depois de uma pausa). */
  retomar(): Promise<void>;
  /** A leitura parou: tira o realce da frase lida e esquece onde estava. */
  aoParar(): void;
  /** Realça uma frase do trecho do "Ouvir" e leva a página até ela. */
  mostrarFrase(frase: Range): void;
  /** O que falar das `frases` do "Ouvir", a partir da `desde`; `null` se não há texto. */
  blocoDoTrecho(frases: Range[], desde: number): { ssml: string; config: ConfigVoz } | null;
  /** Texto para o leitor de tela (região aria-live do leitor). */
  anunciar(texto: string): void;
}

/** O motor de voz; trocado nos testes. */
export interface MotorDoControle {
  falar(ssml: string, config: ConfigVoz): Promise<void>;
  parar(): Promise<void>;
  disponivel(): Promise<boolean>;
  ouvir(aoEvento: (e: EventoVoz) => void): Promise<() => void>;
}

const MOTOR: MotorDoControle = {
  falar,
  parar: pararVoz,
  disponivel: vozDisponivel,
  ouvir: ouvirVoz,
};

export class ControleVoz<D = void> {
  estado = $state<EstadoVoz>("parado");
  /** Há voz para ler (a do sistema ou a natural baixada)? */
  possivel = $state(false);
  /** A frase que a voz está lendo (ou leu por último, na pausa). O adaptador a atualiza. */
  fraseLida: Range | null = null;

  #adaptador: AdaptadorVoz<D>;
  #motor: MotorDoControle;
  /** "Preparando a voz…" se a primeira frase demorar (a voz natural carrega o modelo). */
  #preparo: AvisoDePreparo;
  /** O trecho que o "Ouvir" da barra está lendo (só ele; no fim, para) e a última frase marcada. */
  #trecho: { frases: Range[]; marca: number } | null = null;
  /** Ctrl+D pausou a voz para destacar a frase lida: retomar quando a barra fechar. */
  #retomarAoFechar = false;
  #vez = 0;

  constructor(adaptador: AdaptadorVoz<D>, motor: MotorDoControle = MOTOR) {
    this.#adaptador = adaptador;
    this.#motor = motor;
    this.#preparo = new AvisoDePreparo((t) => avisar(t, "progresso"), dispensar);
  }

  /**
   * Muda a cada fala nova, pausa ou parada: quem acorda depois de um `await` com uma vez antiga
   * (uma página que demorou a ter texto, um preparo) desiste.
   */
  get vez(): number {
    return this.#vez;
  }

  novaVez(): number {
    return ++this.#vez;
  }

  /** Pergunta ao motor se há voz (ao abrir o livro e quando a voz natural é baixada ou removida). */
  conferir(): void {
    this.#motor
      .disponivel()
      .then((d) => (this.possivel = d))
      .catch(() => {});
  }

  /** Passa a receber os eventos do motor; devolve como encerrar (ao fechar o livro). */
  ligar(): () => void {
    let pararDeOuvir: (() => void) | undefined;
    let encerrado = false;
    this.#motor
      .ouvir((e) => this.aoEvento(e))
      .then((f) => (encerrado ? f() : (pararDeOuvir = f)))
      .catch(() => {});
    return () => {
      encerrado = true;
      // Fechar o livro encerra a leitura em voz alta.
      this.#preparo.terminar();
      if (this.estado !== "parado") this.#motor.parar().catch(() => {});
      pararDeOuvir?.();
    };
  }

  /** "Ler em voz alta": o livro, a partir de `desde` (ou de onde se está). Lendo, recomeça dali. */
  async ler(desde?: D): Promise<void> {
    this.#trecho = null;
    if (!this.possivel) {
      this.#adaptador.anunciar(SEM_VOZ);
      return;
    }
    this.#preparo.comecar();
    try {
      if (this.estado !== "parado") await this.parar();
      await this.#adaptador.comecar(desde);
    } catch (erro) {
      // Sem isto, um erro deixava "Preparando a voz…" na tela e a leitura parada, sem aviso.
      this.#falhar("ler em voz alta", erro);
    }
  }

  /** Fala um bloco do livro (o adaptador, em `comecar`, `seguir` e `retomar`). */
  async falar(ssml: string, config: ConfigVoz): Promise<void> {
    this.estado = "falando";
    await this.#motor.falar(ssml, config);
  }

  /** Não há mais o que ler: a leitura para, com o anúncio ("Fim do livro."). */
  acabou(anuncio: string): void {
    this.estado = "parado";
    this.#adaptador.aoParar();
    this.#adaptador.anunciar(anuncio);
  }

  /**
   * "Ouvir" da barra de destaque: lê só as `frases` do trecho e para. A leitura do livro inteiro
   * é o "Ler em voz alta".
   */
  async ouvirTrecho(frases: Range[]): Promise<void> {
    if (!frases.length) return;
    if (!this.possivel) {
      this.#adaptador.anunciar(SEM_VOZ);
      return;
    }
    if (this.estado !== "parado") await this.parar();
    this.#preparo.comecar();
    await this.#falarTrecho(frases, 0);
  }

  /** Fala as frases do trecho a partir da `desde` (no começo, ou ao continuar da pausa). */
  async #falarTrecho(frases: Range[], desde: number): Promise<void> {
    const bloco = this.#adaptador.blocoDoTrecho(frases, desde);
    if (!bloco) {
      this.#preparo.terminar();
      return;
    }
    const minha = this.novaVez();
    this.#trecho = { frases, marca: desde };
    this.estado = "falando";
    try {
      await this.#motor.falar(bloco.ssml, bloco.config);
    } catch (erro) {
      if (minha === this.#vez) this.#falhar("ouvir o trecho", erro);
    }
  }

  /** Um evento do motor. Os atrasados, depois de parar ou pausar (ou de outro livro), são ignorados. */
  aoEvento(e: EventoVoz): void {
    if (this.estado !== "falando") return;
    this.#preparo.terminar();
    // "Ouvir" da barra: só o trecho; no fim dele, a leitura para.
    if (this.#trecho) {
      if (e.tipo === "marca") {
        this.#trecho.marca = Number(e.marca);
        const frase = this.#trecho.frases[this.#trecho.marca];
        if (frase) {
          this.fraseLida = frase;
          this.#adaptador.mostrarFrase(frase);
        }
      } else {
        void this.parar();
      }
      return;
    }
    if (e.tipo === "marca") this.#adaptador.aoMarcar(e.marca);
    else if (e.tipo === "fim") this.#adaptador.seguir().catch((erro) => log.warn(`${erro}`));
    else this.estado = "parado";
  }

  /**
   * Pausar cancela a fala; retomar fala de novo a partir da frase em que parou. A pausa do
   * speech-dispatcher não servia: ele só pausa na marca seguinte e, ao retomar, dava o bloco por
   * terminado, pulando o resto dele.
   */
  async pausarOuRetomar(): Promise<void> {
    if (this.estado === "falando") {
      this.estado = "pausado";
      this.novaVez();
      this.#preparo.terminar();
      await this.#motor.parar();
    } else if (this.estado === "pausado") {
      // Depois de uma pausa longa, a voz natural pode ter fechado o modelo (2 min).
      this.#preparo.comecar();
      if (this.#trecho) await this.#falarTrecho(this.#trecho.frases, this.#trecho.marca);
      else await this.#adaptador.retomar();
    }
  }

  async parar(): Promise<void> {
    this.#preparo.terminar();
    this.estado = "parado";
    this.novaVez();
    this.#trecho = null;
    this.fraseLida = null;
    this.#adaptador.aoParar();
    await this.#motor.parar();
  }

  /**
   * Ctrl+D com a voz lendo: ela pausa enquanto a barra de destaque está aberta (senão a página
   * viraria no meio da escolha e a barra fecharia). Devolve a frase lida, que o leitor põe na
   * seleção para a barra abrir sobre ela; `null` se a voz não estava lendo.
   */
  async pausarParaDestacar(): Promise<Range | null> {
    if (this.estado !== "falando") return null;
    await this.pausarOuRetomar();
    this.#retomarAoFechar = true;
    return this.fraseLida?.startContainer.isConnected ? this.fraseLida : null;
  }

  /**
   * A barra fechou (ou nem abriu): a leitura pausada pelo Ctrl+D continua de onde parou. Devolve
   * se havia o que retomar (o leitor tira a frase da seleção: ela volta a ser só o realce).
   */
  retomarDepoisDaBarra(): boolean {
    if (!this.#retomarAoFechar) return false;
    this.#retomarAoFechar = false;
    if (this.estado === "pausado") void this.pausarOuRetomar();
    return true;
  }

  /** O "Ouvir" vai recomeçar a leitura no trecho: não retomar a pausada quando a barra fechar. */
  naoRetomar(): void {
    this.#retomarAoFechar = false;
  }

  /** Os comandos de voz da paleta, conforme o estado. */
  comandos(): Comando[] {
    return comandosDaVoz(
      this.estado,
      () => void this.ler(),
      () => void this.pausarOuRetomar(),
      () => void this.parar(),
    );
  }

  #falhar(contexto: string, erro: unknown): void {
    log.warn(`${contexto}: ${erro}`);
    this.#preparo.terminar();
    this.estado = "parado";
    this.#trecho = null;
    this.#adaptador.aoParar();
    this.#adaptador.anunciar(textoDaFalhaDaVoz(erro));
  }
}
