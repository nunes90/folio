// Aviso de versão nova (M43b). Desligado até a pessoa responder à pergunta da biblioteca; ligado,
// consulta as Releases do GitHub (pelo core) no máximo uma vez por dia. A paleta consulta na hora,
// a pedido, com o aviso ligado ou não. O que se lembra entre as sessões (quando consultou, qual
// versão a pessoa já viu) fica no localStorage: é só conveniência, perder não faz mal.
import { avisar } from "./avisos.svelte";
import { invoke } from "./comando";
import { log } from "./log";
import { preferencias } from "./preferencias.svelte";

export interface VersaoNova {
  versao: string;
  /** A página da Release no GitHub. */
  endereco: string;
}

export const UM_DIA_MS = 86_400_000;
const CONSULTADA_EM = "folio-versao-consultada-em";
const VISTA = "folio-versao-vista";

/** Hora de consultar sozinho? Com o aviso ligado e um dia (ou mais) depois da última consulta. */
export function horaDeConsultar(ligado: boolean | null, ultima: number | null, agora: number): boolean {
  if (ligado !== true) return false;
  return ultima === null || agora - ultima >= UM_DIA_MS || agora < ultima;
}

/** O que a consulta usa (trocado nos testes). */
export interface Dependencias {
  ligado(): boolean | null;
  consultar(): Promise<VersaoNova | null>;
  abrir(endereco: string): Promise<unknown>;
  agora(): number;
  ler(chave: string): string | null;
  gravar(chave: string, valor: string): void;
}

const PADRAO: Dependencias = {
  ligado: () => preferencias.avisarVersaoNova,
  consultar: () => invoke<VersaoNova | null>("procurar_versao_nova"),
  abrir: (endereco) => invoke("abrir_no_navegador", { url: endereco }),
  agora: () => Date.now(),
  ler: (chave) => {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  },
  gravar: (chave, valor) => {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      // Sem localStorage: consulta de novo na próxima vez.
    }
  },
};

/**
 * Procura uma versão nova. `pedido`: veio da paleta (consulta na hora e diz o resultado, inclusive
 * o erro). Sozinho, respeita o aviso e o intervalo de um dia, e um erro vai só para o log. Uma
 * versão já vista (a pessoa abriu as novidades) não é avisada de novo; uma não vista, uma vez por
 * dia até ser vista.
 */
export async function procurarVersaoNova(pedido: boolean, d: Dependencias = PADRAO): Promise<void> {
  const agora = d.agora();
  if (!pedido) {
    const ultima = Number(d.ler(CONSULTADA_EM)) || null;
    if (!horaDeConsultar(d.ligado(), ultima, agora)) return;
  }
  // Antes da resposta: uma falha também conta (sem conexão, tenta amanhã).
  d.gravar(CONSULTADA_EM, String(agora));
  let nova: VersaoNova | null;
  try {
    nova = await d.consultar();
  } catch (erro) {
    if (pedido) avisar(`Não foi possível procurar uma versão nova: ${erro}`, "erro");
    else log.warn(`versão nova: ${erro}`);
    return;
  }
  if (!nova) {
    if (pedido) avisar("Você está com a versão mais nova do Folio.");
    return;
  }
  if (!pedido && d.ler(VISTA) === nova.versao) return;
  const { versao, endereco } = nova;
  avisar(`Saiu o Folio ${versao}.`, "sucesso", {
    rotulo: "Ver novidades",
    executar: () => {
      d.gravar(VISTA, versao);
      d.abrir(endereco).catch((erro) => avisar(`Não foi possível abrir o navegador: ${erro}`, "erro"));
    },
  });
}
