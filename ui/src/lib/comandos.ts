// Paleta de comandos (Ctrl+K): cada ação do app vira um comando com nome, e a busca acha
// pelo nome. Funções puras; quem monta a lista é o App (ele sabe o contexto e as ações), com
// os comandos que o leitor aberto publica (geradores no fim deste arquivo).
import { normalizar } from "./filtro";
import type { ItemIndice } from "./foliate";
import { FONTES } from "./fontes";
import { PAGINAS, type Pagina } from "./pagina";
import {
  LIMITES,
  type Alinhamento,
  type Fonte,
  type Preferencias,
} from "./preferencias.svelte";
import type { EstiloVirada } from "./virada";

export interface Comando {
  /** Único na lista (vira parte do id do elemento na paleta). */
  id: string;
  /** O que aparece e o que se busca, ex.: "Interface: escuro", "Abrir Dom Casmurro". */
  titulo: string;
  /** Categoria, mostrada ao lado do título (ex.: "Livros", "Aparência"). */
  grupo: string;
  /** Texto de apoio ao lado do título (ex.: o autor do livro, "atual"). */
  dica?: string;
  /** Mais texto para a busca, que não aparece (ex.: "tema" para os comandos de interface). */
  palavras?: string;
  /** Atalho que faz o mesmo, para ensinar (ex.: [["Ctrl", "O"]]). */
  teclas?: string[][];
  executar: () => void;
}

/** Onde a busca procura: título, dica (ex.: o autor) e palavras extras. */
function textoDe(comando: Comando): string {
  return normalizar(`${comando.titulo} ${comando.dica ?? ""} ${comando.palavras ?? ""}`);
}

/** O que um leitor aberto publica para a paleta (ver `onComandos` nos leitores). */
export interface ComandosDoLeitor {
  comandos: Comando[];
  /** Comandos que dependem do termo digitado (ex.: ir para uma página do PDF). */
  porTermo?: (termo: string) => Comando[];
}

/** 0: o título começa com o termo; 1: cada palavra começa uma palavra; 2: só contém. */
function relevancia(comando: Comando, termo: string, palavras: string[]): number {
  if (normalizar(comando.titulo).startsWith(termo)) return 0;
  const inicios = textoDe(comando).split(/[\s:,]+/);
  return palavras.every((p) => inicios.some((i) => i.startsWith(p))) ? 1 : 2;
}

/**
 * Comandos cujo título, dica ou palavras extras contêm todas as palavras do termo, sem acentos e
 * em qualquer ordem; os mais relevantes primeiro e, entre iguais, a ordem original.
 */
export function filtrarComandos(comandos: Comando[], termo: string): Comando[] {
  const t = normalizar(termo);
  const palavras = t.split(/\s+/).filter(Boolean);
  if (!palavras.length) return comandos;
  return comandos
    .filter((c) => {
      const texto = textoDe(c);
      return palavras.every((p) => texto.includes(p));
    })
    .map((c, i) => ({ c, i, r: relevancia(c, t, palavras) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ c }) => c);
}

// --- Comandos do leitor (EPUB e PDF) ---

type Mudar = (mudancas: Partial<Preferencias>) => void;

const atual = (sim: boolean) => (sim ? "atual" : undefined);

/** "Ir para: <seção>", um por item do índice (subitens inclusive), o atual marcado. */
export function comandosDoIndice(
  itens: ItemIndice[],
  hrefAtual: string | undefined,
  navegar: (href: string) => void,
): Comando[] {
  const lista: Comando[] = [];
  const visitar = (item: ItemIndice) => {
    lista.push({
      // O índice na lista entra no id: dois itens podem apontar para o mesmo href.
      id: `secao-${lista.length}`,
      titulo: `Ir para: ${item.label.trim()}`,
      grupo: "Índice",
      dica: atual(item.href === hrefAtual),
      executar: () => navegar(item.href),
    });
    item.subitems?.forEach(visitar);
  };
  itens.forEach(visitar);
  return lista;
}

/** As ações do lado (M25b) que a paleta oferece. */
export interface AcoesDoLado {
  /** Abre (ou leva) o lado até a seção. */
  abrir(href: string): void;
  /** Abre o lado no ponto em que o livro está. */
  abrirAqui(): void;
  fechar(): void;
  /** Leva o foco ao outro lado (F6). */
  alternar(): void;
}

/**
 * Dois pontos do livro lado a lado (M25b). Fechado: "Abrir este ponto ao lado" e "Abrir ao
 * lado: <seção>"; aberto: alternar (F6), fechar e "Lado: ir para <seção>".
 */
export function comandosDoLado(aberto: boolean, itens: ItemIndice[], a: AcoesDoLado): Comando[] {
  const lista: Comando[] = aberto
    ? [
        {
          id: "lado-alternar",
          titulo: "Alternar entre os lados",
          grupo: "Lado a lado",
          teclas: [["F6"]],
          palavras: "comparar foco outro lado",
          executar: () => a.alternar(),
        },
        {
          id: "lado-fechar",
          titulo: "Fechar o lado",
          grupo: "Lado a lado",
          teclas: [["Ctrl", "Shift", "L"]],
          palavras: "comparar",
          executar: () => a.fechar(),
        },
      ]
    : [
        {
          id: "lado-aqui",
          titulo: "Abrir este ponto ao lado",
          grupo: "Lado a lado",
          teclas: [["Ctrl", "Shift", "L"]],
          palavras: "comparar dividir",
          executar: () => a.abrirAqui(),
        },
      ];
  const prefixo = aberto ? "Lado: ir para " : "Abrir ao lado: ";
  for (const c of comandosDoIndice(itens, undefined, (href) => a.abrir(href)))
    lista.push({
      ...c,
      id: `lado-${c.id}`,
      titulo: c.titulo.replace(/^Ir para: /, prefixo),
      grupo: "Lado a lado",
      palavras: "comparar",
    });
  return lista;
}

const NOMES_PAGINA: [Pagina, string][] = [
  ["automatica", "Automática"],
  ...(Object.entries(PAGINAS) as [Pagina, { nome: string }][]).map(
    ([valor, { nome }]): [Pagina, string] => [valor, nome],
  ),
];

const NOMES_VIRADA: [EstiloVirada, string][] = [
  ["esmaecer", "Esmaecer"],
  ["deslizar", "Deslizar"],
  ["virar", "Virar a folha"],
  ["nenhuma", "Nenhuma"],
];

/** Cor da página e virada: iguais no EPUB e no PDF. */
export function comandosDaPagina(prefs: Preferencias, mudar: Mudar): Comando[] {
  return [
    ...NOMES_PAGINA.map(([pagina, nome]) => ({
      id: `pagina-${pagina}`,
      titulo: `Página: ${nome}`,
      grupo: "Aparência",
      dica: atual(prefs.pagina === pagina),
      palavras: "cor papel",
      executar: () => mudar({ pagina }),
    })),
    ...NOMES_VIRADA.map(([virada, nome]) => ({
      id: `virada-${virada}`,
      titulo: `Virada: ${nome}`,
      grupo: "Aparência",
      dica: atual(prefs.virada === virada),
      palavras: "animação",
      executar: () => mudar({ virada }),
    })),
  ];
}

const NOMES_FONTE: [Fonte, string][] = [
  ["original", "Do livro"],
  ...(Object.entries(FONTES) as [Fonte, { familia: string }][]).map(
    ([valor, { familia }]): [Fonte, string] => [valor, familia],
  ),
];

const NOMES_ALINHAMENTO: [Alinhamento, string][] = [
  ["original", "do livro"],
  ["inicio", "à esquerda"],
  ["justificado", "justificado"],
];

/** Passo de "Aumentar/Diminuir o texto" (o deslizante do painel é mais fino). */
const PASSO_TAMANHO = 0.1;

/** Tipografia do EPUB (a seção Texto do painel Aparência). */
export function comandosDoTexto(prefs: Preferencias, mudar: Mudar, restaurar: () => void): Comando[] {
  const { min, max } = LIMITES.tamanho;
  const tamanho = (n: number) => Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  const lista: Comando[] = [];
  // No limite, o comando não faria nada: some da lista.
  if (prefs.tamanho < max)
    lista.push({
      id: "texto-maior",
      titulo: "Aumentar o texto",
      grupo: "Texto",
      palavras: "fonte tamanho letra",
      executar: () => mudar({ tamanho: tamanho(prefs.tamanho + PASSO_TAMANHO) }),
    });
  if (prefs.tamanho > min)
    lista.push({
      id: "texto-menor",
      titulo: "Diminuir o texto",
      grupo: "Texto",
      palavras: "fonte tamanho letra",
      executar: () => mudar({ tamanho: tamanho(prefs.tamanho - PASSO_TAMANHO) }),
    });
  for (const [fonte, nome] of NOMES_FONTE)
    lista.push({
      id: `fonte-${fonte}`,
      titulo: `Fonte: ${nome}`,
      grupo: "Texto",
      dica: atual(prefs.fonte === fonte),
      executar: () => mudar({ fonte }),
    });
  for (const [alinhamento, nome] of NOMES_ALINHAMENTO)
    lista.push({
      id: `alinhamento-${alinhamento}`,
      titulo: `Alinhamento: ${nome}`,
      grupo: "Texto",
      dica: atual(prefs.alinhamento === alinhamento),
      executar: () => mudar({ alinhamento }),
    });
  lista.push(
    {
      id: "hifenizacao",
      titulo: prefs.hifenizacao ? "Desligar a hifenização" : "Ligar a hifenização",
      grupo: "Texto",
      executar: () => mudar({ hifenizacao: !prefs.hifenizacao }),
    },
    {
      id: "texto-padrao",
      titulo: "Restaurar o texto padrão",
      grupo: "Texto",
      palavras: "fonte tamanho espaçamento",
      executar: restaurar,
    },
  );
  return lista;
}

/** "42", "página 42", "pag 42", "p. 42": o número da página, ou null. */
function numeroDePagina(termo: string): number | null {
  const m = normalizar(termo).match(/^(?:(?:pagina|pag|pg|p)\.?\s*)?(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * Comando gerado pelo termo (PDF, M25c): "ao lado 87" ou "lado 87" abre a página no lado (ou,
 * com ele aberto, leva-o até ela), se ela existir.
 */
export function ladoPorTermo(
  termo: string,
  total: number,
  aberto: boolean,
  abrir: (n: number) => void,
): Comando[] {
  const resto = termo.trim().match(/^(?:ao\s+)?lado\s+(.+)$/i)?.[1];
  const n = resto ? numeroDePagina(resto) : null;
  if (n === null || n < 1 || n > total) return [];
  return [
    {
      id: "lado-pagina",
      titulo: aberto ? `Lado: ir para a página ${n}` : `Abrir a página ${n} ao lado`,
      grupo: "Lado a lado",
      dica: `de ${total}`,
      executar: () => abrir(n),
    },
  ];
}

/** Comando gerado pelo termo (PDF): "Ir para a página N", se N existir no documento. */
export function irParaPagina(termo: string, total: number, ir: (n: number) => void): Comando[] {
  const n = numeroDePagina(termo);
  if (n === null || n < 1 || n > total) return [];
  return [
    {
      id: "ir-para-pagina",
      titulo: `Ir para a página ${n}`,
      grupo: "PDF",
      dica: `de ${total}`,
      executar: () => ir(n),
    },
  ];
}
