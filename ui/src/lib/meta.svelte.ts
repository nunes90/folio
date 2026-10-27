// Meta da sessão (M20b): "20 min", "15 páginas" (PDF) ou "até o fim do capítulo" (EPUB). Uma
// barra discreta no rodapé mostra quanto falta; ao cumprir, uma pausa suave com o resumo. Sem
// sequência de dias, sem ranking: a meta vale para esta leitura e acaba nela.
//
// Páginas só no PDF: no EPUB elas mudam com a letra e a janela, e "15 páginas" não diria nada.
// O tempo conta como no core (crates/core/src/sessoes.rs): só enquanto há leitura, ou seja,
// até 5 minutos depois da última atividade (página, tecla, clique, roda) e com a janela à vista.
import type { Comando } from "./comandos";

export type Meta =
  | { tipo: "minutos"; minutos: number }
  | { tipo: "paginas"; paginas: number }
  | { tipo: "capitulo" };

/** Onde a leitura está, como o leitor diz. */
export interface Ponto {
  /** Para o resumo: "página 141", "Capítulo 3 (18%)". */
  rotulo: string;
  /** PDF: a página. */
  pagina?: number;
  /** EPUB: o capítulo (índice da seção) e quanto dele já passou (0 a 1). */
  capitulo?: { indice: number; fracao: number };
}

/** O que a pausa mostra ao cumprir a meta. */
export interface Resumo {
  meta: Meta;
  segundos: number;
  paginas: number;
  de: string;
  ate: string;
}

/** Sem atividade por mais que isto, o tempo para de contar (o mesmo limite do core). */
export const PAUSA_MAXIMA_MS = 5 * 60_000;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "20 min", "15 páginas", "até o fim do capítulo". */
export function nomeDaMeta(meta: Meta): string {
  if (meta.tipo === "minutos") return `${meta.minutos} min`;
  if (meta.tipo === "paginas") return plural(meta.paginas, "página", "páginas");
  return "até o fim do capítulo";
}

/** "1 minuto", "18 minutos" (arredondado; menos de meio minuto conta como 1). */
export function duracaoPorExtenso(segundos: number): string {
  return plural(Math.max(1, Math.round(segundos / 60)), "minuto", "minutos");
}

/** O texto da pausa: quanto se leu e de onde a onde. */
export function textoDoResumo({ meta, segundos, paginas, de, ate }: Resumo): string {
  const tempo = duracaoPorExtenso(segundos);
  const quanto =
    meta.tipo === "paginas"
      ? `${plural(paginas, "página", "páginas")} em ${tempo}`
      : meta.tipo === "capitulo"
        ? `o capítulo até o fim, em ${tempo}`
        : tempo;
  return de === ate ? `Você leu ${quanto}, em ${de}.` : `Você leu ${quanto}: de ${de} até ${ate}.`;
}

export class MetaDaSessao {
  meta = $state<Meta | null>(null);
  /** Quanto da meta já foi (0 a 1). */
  progresso = $state(0);
  /** O estado em texto, para o rodapé: "12 de 20 min", "5 de 15 páginas", "40% do capítulo". */
  texto = $state("");
  /** Preenchido ao cumprir a meta: a pausa aparece. */
  resumo = $state<Resumo | null>(null);

  #relogio: () => number;
  #ponto: Ponto | null = null;
  #inicio: Ponto | null = null;
  #maiorPagina = 0;
  #segundos = 0;
  #ultimoTique = 0;
  #ultimaAtividade = 0;

  /** `relogio` em milissegundos (trocável nos testes). */
  constructor(relogio: () => number = Date.now) {
    this.#relogio = relogio;
  }

  /** Define a meta a partir de agora (`null` tira). */
  definir(meta: Meta | null): void {
    this.meta = meta;
    this.resumo = null;
    this.#inicio = this.#ponto;
    this.#maiorPagina = this.#ponto?.pagina ?? 0;
    this.#segundos = 0;
    this.#ultimoTique = this.#ultimaAtividade = this.#relogio();
    this.#atualizar();
  }

  /** O leitor mudou de lugar (também conta como atividade). */
  mover(ponto: Ponto): void {
    this.#ponto = ponto;
    this.#inicio ??= ponto;
    if (ponto.pagina !== undefined) this.#maiorPagina = Math.max(this.#maiorPagina, ponto.pagina);
    this.atividade();
    this.#atualizar();
  }

  /** Tecla, clique, roda: a leitura continua. */
  atividade(): void {
    this.tique();
    this.#ultimaAtividade = this.#relogio();
  }

  /**
   * Passa o tempo desde o último tique: conta só se houve atividade há menos de 5 minutos e
   * a janela está à vista (`visivel`).
   */
  tique(visivel = true): void {
    const agora = this.#relogio();
    const lendo = visivel && agora - this.#ultimaAtividade <= PAUSA_MAXIMA_MS;
    if (lendo && this.meta && !this.resumo) this.#segundos += (agora - this.#ultimoTique) / 1000;
    this.#ultimoTique = agora;
    this.#atualizar();
  }

  /** A pausa fechou: segue lendo sem meta. */
  continuar(): void {
    this.definir(null);
  }

  /** A mesma meta de novo, a partir daqui. */
  repetir(): void {
    const meta = this.resumo?.meta ?? this.meta;
    this.definir(meta);
  }

  #atualizar(): void {
    const meta = this.meta;
    if (!meta || this.resumo) return;
    const inicio = this.#inicio;
    const ponto = this.#ponto;
    let progresso = 0;
    if (meta.tipo === "minutos") {
      progresso = this.#segundos / (meta.minutos * 60);
      const minutos = Math.min(meta.minutos, Math.floor(this.#segundos / 60));
      this.texto = `${minutos} de ${meta.minutos} min`;
    } else if (meta.tipo === "paginas") {
      const lidas = Math.max(0, this.#maiorPagina - (inicio?.pagina ?? this.#maiorPagina));
      progresso = lidas / meta.paginas;
      this.texto = `${Math.min(lidas, meta.paginas)} de ${plural(meta.paginas, "página", "páginas")}`;
    } else {
      const de = inicio?.capitulo;
      const agora = ponto?.capitulo;
      if (de && agora && agora.indice > de.indice) progresso = 1;
      else if (de && agora && agora.indice === de.indice)
        progresso = de.fracao >= 1 ? 1 : Math.max(0, (agora.fracao - de.fracao) / (1 - de.fracao));
      this.texto = `${Math.round(Math.min(1, progresso) * 100)}% do capítulo`;
    }
    this.progresso = Math.min(1, progresso);
    if (progresso >= 1) {
      const paginas = Math.max(0, this.#maiorPagina - (inicio?.pagina ?? this.#maiorPagina));
      this.resumo = {
        meta,
        segundos: this.#segundos,
        paginas,
        de: inicio?.rotulo ?? "",
        ate: ponto?.rotulo ?? "",
      };
    }
  }
}

/** As metas oferecidas na paleta, conforme o formato. */
const MINUTOS = [10, 20, 30, 45, 60];
const PAGINAS = [5, 10, 20, 30];

/** Os comandos da meta para a paleta (Ctrl+K). */
export function comandosDaMeta(meta: MetaDaSessao, formato: "epub" | "pdf"): Comando[] {
  const opcoes: Meta[] = [
    ...MINUTOS.map((minutos) => ({ tipo: "minutos" as const, minutos })),
    ...(formato === "epub"
      ? [{ tipo: "capitulo" as const }]
      : PAGINAS.map((paginas) => ({ tipo: "paginas" as const, paginas }))),
  ];
  const atual = meta.meta ? nomeDaMeta(meta.meta) : null;
  const lista: Comando[] = opcoes.map((m) => ({
    id: `meta-${nomeDaMeta(m)}`,
    titulo: `Meta da sessão: ${nomeDaMeta(m)}`,
    grupo: "Sessão",
    dica: nomeDaMeta(m) === atual ? "atual" : undefined,
    palavras: "objetivo ler tempo",
    executar: () => meta.definir(m),
  }));
  if (meta.meta)
    lista.unshift({
      id: "meta-tirar",
      titulo: "Tirar a meta da sessão",
      grupo: "Sessão",
      dica: meta.texto,
      palavras: "objetivo cancelar",
      executar: () => meta.definir(null),
    });
  return lista;
}

/**
 * Uma meta digitada na paleta: "25 min", "25 minutos" e, no PDF, "12 páginas", "12 pág". Devolve
 * o comando que a define (ou nada).
 */
export function metaPorTermo(termo: string, meta: MetaDaSessao, formato: "epub" | "pdf"): Comando[] {
  const t = termo.trim().toLowerCase();
  const minutos = t.match(/^(\d{1,3})\s*(m|min|mins|minuto|minutos)$/);
  const paginas = formato === "pdf" ? t.match(/^(\d{1,4})\s*(p|pg|pág|pag|págs|pags|página|pagina|páginas|paginas)$/) : null;
  const n = Number((minutos ?? paginas)?.[1]);
  if (!n) return [];
  const nova: Meta = minutos ? { tipo: "minutos", minutos: n } : { tipo: "paginas", paginas: n };
  return [
    {
      id: "meta-digitada",
      titulo: `Meta da sessão: ${nomeDaMeta(nova)}`,
      grupo: "Sessão",
      executar: () => meta.definir(nova),
    },
  ];
}
