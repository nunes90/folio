// A voz natural (neural, M27): o catálogo que o core oferece, o download e a amostra. Um estado
// só para o app todo: o download continua com o painel fechado, e a seção "Voz" dos dois leitores
// e a paleta mostram o mesmo andamento.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { avisar, avisarSeDemorar } from "./avisos.svelte";
import type { Comando } from "./comandos";
import type { Preferencias } from "./preferencias.svelte";

export interface VozDoCatalogo {
  id: string;
  nome: string;
  /** BCP 47: "en-US", "en-GB". */
  idioma: string;
  genero: "feminina" | "masculina";
}

export interface ModeloDeVoz {
  id: string;
  nome: string;
  licenca: string;
  /** Bytes a baixar. */
  tamanho: number;
  instalado: boolean;
  vozes: VozDoCatalogo[];
}

interface Catalogo {
  modelos: ModeloDeVoz[];
  baixando: string | null;
  espeak: boolean;
}

type AvisoDownload =
  | { tipo: "progresso"; modelo: string; baixado: number; total: number }
  | { tipo: "concluido"; modelo: string }
  | { tipo: "cancelado"; modelo: string }
  | { tipo: "falhou"; modelo: string; erro: string };

const IDIOMAS: Record<string, string> = {
  "en-US": "inglês americano",
  "en-GB": "inglês britânico",
  "pt-BR": "português do Brasil",
};

/** "inglês americano, feminina". */
export function descreverVoz(v: VozDoCatalogo): string {
  return `${IDIOMAS[v.idioma] ?? v.idioma}, ${v.genero}`;
}

/** "152 MB" (megabytes decimais, como os gerenciadores de arquivos). */
export function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/** Os idiomas da voz natural, cada um com a preferência que o liga e a da voz escolhida. */
export const IDIOMAS_DA_VOZ = [
  { base: "en", nome: "inglês", pref: "vozNaturalEmIngles", escolha: "vozNatural" },
  { base: "pt", nome: "português", pref: "vozNaturalEmPortugues", escolha: "vozNaturalPortugues" },
] as const satisfies readonly {
  base: string;
  nome: string;
  pref: keyof Preferencias;
  escolha: keyof Preferencias;
}[];

export type IdiomaDaVoz = (typeof IDIOMAS_DA_VOZ)[number];

/** "pt-BR" → "pt". */
const base = (idioma: string) => idioma.split(/[-_]/)[0].toLowerCase();

export function vozesDoIdioma(modelo: ModeloDeVoz, idioma: string): VozDoCatalogo[] {
  return modelo.vozes.filter((v) => base(v.idioma) === idioma);
}

/** Os idiomas que o modelo fala, com as vozes de cada um. */
export function idiomasDoModelo(modelo: ModeloDeVoz) {
  return IDIOMAS_DA_VOZ.map((i) => ({ ...i, vozes: vozesDoIdioma(modelo, i.base) })).filter(
    (i) => i.vozes.length > 0,
  );
}

/** A voz em uso num idioma: a escolhida, se for dele, ou a primeira (a padrão do core). */
export function vozEscolhida(
  modelo: ModeloDeVoz,
  p: Preferencias,
  idioma = "en",
): VozDoCatalogo {
  const vozes = vozesDoIdioma(modelo, idioma);
  const chave = IDIOMAS_DA_VOZ.find((i) => i.base === idioma)?.escolha;
  const escolhida = chave ? vozes.find((v) => v.id === p[chave]) : undefined;
  return escolhida ?? vozes[0] ?? modelo.vozes[0];
}

class EstadoVozNatural {
  modelos = $state<ModeloDeVoz[]>([]);
  /** O espeak-ng está instalado? Sem ele, a voz natural não fala. */
  espeak = $state(true);
  carregado = $state(false);
  /** O download em andamento, se houver. */
  baixando = $state<{ modelo: string; baixado: number; total: number } | null>(null);
  /** Muda a cada instalação ou remoção: os leitores perguntam de novo se há voz. */
  mudancas = $state(0);
  /** A amostra em andamento: gerando o áudio (na 1ª vez, o modelo carrega) ou tocando. */
  /** `demorando`: a geração passou de 400 ms (só então o leitor de tela ouve "Preparando a voz…"). */
  amostraAtual = $state<{ voz: string; fase: "preparando" | "tocando"; demorando?: boolean } | null>(
    null,
  );
  #ouvindo = false;
  #fimDaAmostra: ReturnType<typeof setTimeout> | undefined;

  /** O modelo do catálogo (hoje só o Kokoro). */
  get modelo(): ModeloDeVoz | undefined {
    return this.modelos[0];
  }

  async carregar(): Promise<void> {
    this.#ouvir();
    const c = await invoke<Catalogo>("vozes_naturais");
    this.modelos = c.modelos;
    this.espeak = c.espeak;
    if (c.baixando && !this.baixando) {
      const m = c.modelos.find((x) => x.id === c.baixando);
      this.baixando = { modelo: c.baixando, baixado: 0, total: m?.tamanho ?? 0 };
    } else if (!c.baixando) {
      this.baixando = null;
    }
    this.carregado = true;
  }

  async baixar(modelo: string): Promise<void> {
    const m = this.modelos.find((x) => x.id === modelo);
    this.baixando = { modelo, baixado: 0, total: m?.tamanho ?? 0 };
    try {
      await invoke("baixar_voz_natural", { modelo });
    } catch (e) {
      this.baixando = null;
      avisar(`Não foi possível baixar a voz natural: ${e}`, "erro");
    }
  }

  cancelar(): Promise<void> {
    return invoke("cancelar_download_voz");
  }

  async remover(modelo: string): Promise<void> {
    try {
      await invoke("remover_voz_natural", { modelo });
      avisar("Voz natural removida.");
    } catch (e) {
      avisar(`Não foi possível remover a voz natural: ${e}`, "erro");
    }
    this.mudancas++;
    await this.carregar();
  }

  /**
   * Toca a amostra de `voz`: `amostraAtual` passa por "preparando" e "tocando" (pela duração que
   * o core devolve) e volta a `null`. `comAviso`: mostra "Preparando a voz…" como aviso (da
   * paleta, onde não há botão para mudar de estado).
   */
  async amostra(voz: string, comAviso = false): Promise<void> {
    clearTimeout(this.#fimDaAmostra);
    this.amostraAtual = { voz, fase: "preparando" };
    const demora = setTimeout(() => {
      if (this.amostraAtual?.voz === voz && this.amostraAtual.fase === "preparando")
        this.amostraAtual = { voz, fase: "preparando", demorando: true };
    }, 400);
    try {
      const pedido = invoke<number>("ouvir_amostra_voz", { id: voz });
      const ms = await (comAviso ? avisarSeDemorar(pedido, "Preparando a voz…") : pedido);
      // Outra amostra pode ter começado enquanto esta era gerada.
      if (this.amostraAtual?.voz !== voz) return;
      this.amostraAtual = { voz, fase: "tocando" };
      this.#fimDaAmostra = setTimeout(() => {
        if (this.amostraAtual?.voz === voz) this.amostraAtual = null;
      }, ms);
    } catch (e) {
      if (this.amostraAtual?.voz === voz) this.amostraAtual = null;
      avisar(`Não foi possível tocar a amostra: ${e}`, "erro");
    } finally {
      clearTimeout(demora);
    }
  }

  #ouvir() {
    if (this.#ouvindo) return;
    this.#ouvindo = true;
    listen<AvisoDownload>("voz-natural", (e) => this.#aoAviso(e.payload)).catch(() => {
      this.#ouvindo = false;
    });
  }

  #aoAviso(a: AvisoDownload) {
    switch (a.tipo) {
      case "progresso":
        this.baixando = { modelo: a.modelo, baixado: a.baixado, total: a.total };
        return;
      case "concluido":
        // Instalado já aqui: sem isso, o painel mostrava "Baixar" de novo até o catálogo voltar
        // (e o foco, que estava no "Cancelar", não tinha para onde ir).
        this.modelos = this.modelos.map((m) => (m.id === a.modelo ? { ...m, instalado: true } : m));
        this.baixando = null;
        avisar("Voz natural instalada. Os livros em inglês e em português já podem usá-la.");
        break;
      case "cancelado":
        this.baixando = null;
        avisar("Download da voz natural cancelado.");
        break;
      case "falhou":
        this.baixando = null;
        avisar(`Não foi possível baixar a voz natural: ${a.erro}`, "erro");
        break;
    }
    this.mudancas++;
    this.carregar().catch(() => {});
  }
}

export const vozNatural = new EstadoVozNatural();

/** Porcentagem baixada, de 0 a 100. */
export function porcentagem(b: { baixado: number; total: number }): number {
  return b.total > 0 ? Math.min(100, Math.floor((b.baixado / b.total) * 100)) : 0;
}

/** A voz natural na paleta (grupo "Voz"), nos dois formatos. */
export function comandosDaVozNatural(
  estado: {
    modelo: ModeloDeVoz | undefined;
    baixando: EstadoVozNatural["baixando"];
    espeak: boolean;
  },
  p: Preferencias,
  mudar: (mudancas: Partial<Preferencias>) => void,
  acoes: {
    baixar(modelo: string): void;
    cancelar(): void;
    remover(modelo: string): void;
    amostra(voz: string): void;
  },
): Comando[] {
  const m = estado.modelo;
  if (!m) return [];
  const palavras = "voz natural neural kokoro leitura em voz alta";
  if (estado.baixando) {
    return [
      {
        id: "voz-natural-cancelar",
        titulo: "Cancelar o download da voz natural",
        grupo: "Voz",
        dica: `${porcentagem(estado.baixando)}%`,
        palavras,
        executar: () => acoes.cancelar(),
      },
    ];
  }
  if (!m.instalado) {
    if (!estado.espeak) return [];
    return [
      {
        id: "voz-natural-baixar",
        titulo: "Baixar a voz natural",
        grupo: "Voz",
        dica: `${m.nome}, ${megabytes(m.tamanho)}, ${idiomasDoModelo(m)
          .map((i) => i.nome)
          .join(" e ")}`,
        palavras,
        executar: () => acoes.baixar(m.id),
      },
    ];
  }
  const idiomas = idiomasDoModelo(m);
  return [
    ...idiomas.flatMap((i) => {
      const atual = vozEscolhida(m, p, i.base);
      const sufixo = i.base === "en" ? "" : ` em ${i.nome}`;
      return [
        // Escolher a voz, só onde há mais de uma.
        ...(i.vozes.length > 1
          ? i.vozes.map((v) => ({
              id: `voz-natural-${v.id}`,
              titulo: `Voz${sufixo}: ${v.nome}`,
              grupo: "Voz",
              dica: v.id === atual.id ? `atual · ${descreverVoz(v)}` : descreverVoz(v),
              palavras,
              executar: () => mudar({ [i.escolha]: v.id }),
            }))
          : []),
        {
          id: `voz-natural-amostra-${i.base}`,
          titulo: `Ouvir amostra da voz${sufixo}`,
          grupo: "Voz",
          dica: atual.nome,
          palavras,
          executar: () => acoes.amostra(atual.id),
        },
        {
          id: `voz-natural-em-${i.base}`,
          titulo: p[i.pref]
            ? `Não usar a voz natural em livros em ${i.nome}`
            : `Usar a voz natural em livros em ${i.nome}`,
          grupo: "Voz",
          palavras,
          executar: () => mudar({ [i.pref]: !p[i.pref] }),
        },
      ];
    }),
    {
      id: "voz-natural-remover",
      titulo: "Remover a voz natural",
      grupo: "Voz",
      dica: `libera ${megabytes(m.tamanho)}`,
      palavras,
      executar: () => acoes.remover(m.id),
    },
  ];
}

/**
 * "Preparando a voz…" se a fala demorar a começar (a voz natural carrega o modelo na primeira
 * frase, ~1 s). Começa ao pedir a leitura e termina no primeiro evento da voz.
 */
export class AvisoDePreparo {
  #espera: ReturnType<typeof setTimeout> | undefined;
  #id: number | undefined;
  #dispensar: (id: number) => void;
  #avisar: (texto: string) => number;

  constructor(avisarFn: (texto: string) => number, dispensarFn: (id: number) => void) {
    this.#avisar = avisarFn;
    this.#dispensar = dispensarFn;
  }

  /**
   * 1 s, e não os 400 ms dos outros avisos: o aviso também vai ao leitor de tela, e a voz que
   * começa logo depois dele (o modelo já aberto gera a primeira frase em 0,4–1 s) era atropelada
   * pelo "Preparando a voz…" do Orca. Fica para a primeira fala, quando o modelo ainda carrega.
   */
  comecar(atrasoMs = 1000) {
    this.terminar();
    this.#espera = setTimeout(() => (this.#id = this.#avisar("Preparando a voz…")), atrasoMs);
  }

  terminar() {
    clearTimeout(this.#espera);
    this.#espera = undefined;
    if (this.#id !== undefined) this.#dispensar(this.#id);
    this.#id = undefined;
  }
}

/** `comandosDaVozNatural` com o estado do app (o que os leitores põem na paleta). */
export function comandosDaVozNaturalDoApp(
  p: Preferencias,
  mudar: (mudancas: Partial<Preferencias>) => void,
): Comando[] {
  return comandosDaVozNatural(vozNatural, p, mudar, {
    baixar: (m) => void vozNatural.baixar(m),
    cancelar: () => void vozNatural.cancelar(),
    remover: (m) => void vozNatural.remover(m),
    amostra: (v) => void vozNatural.amostra(v, true),
  });
}

/** O que dizer quando não há como ler em voz alta. */
export const SEM_VOZ =
  "Leitura em voz alta indisponível: instale o speech-dispatcher ou baixe a voz natural (Aparência, seção Voz).";
