// Blocos e frases no PDF (M17b). A camada de texto do pdf.js não tem parágrafos: só pedaços de
// texto (spans) posicionados na página. Os pedaços viram linhas pela posição vertical, e as
// linhas viram blocos pelo espaço entre elas e pela mudança do tamanho da letra (um título é
// maior que o texto). Dentro de cada bloco, as frases saem de `frasesDe`, a mesma do EPUB.
import { frasesDe } from "./frases";

/** O que importa de cada pedaço de texto para agrupar: a caixa dele na tela. */
export interface Caixa {
  top: number;
  height: number;
}

/**
 * Agrupa os pedaços em linhas, na ordem do texto: um pedaço continua a linha se o meio dele
 * estiver dentro da altura da linha atual. Devolve os índices dos pedaços de cada linha.
 */
export function agruparEmLinhas(caixas: Caixa[]): number[][] {
  const linhas: { indices: number[]; top: number; bottom: number }[] = [];
  caixas.forEach((c, i) => {
    const meio = c.top + c.height / 2;
    const ultima = linhas.at(-1);
    if (ultima && meio >= ultima.top && meio <= ultima.bottom) {
      ultima.indices.push(i);
      ultima.top = Math.min(ultima.top, c.top);
      ultima.bottom = Math.max(ultima.bottom, c.top + c.height);
    } else linhas.push({ indices: [i], top: c.top, bottom: c.top + c.height });
  });
  return linhas.map((l) => l.indices);
}

/**
 * Onde começa cada bloco (índices das linhas). Uma linha começa um bloco novo se houver um
 * espaço maior que meia linha antes dela, ou se a letra mudar de tamanho (título ↔ texto).
 */
export function quebrasDeBloco(linhas: Caixa[]): number[] {
  const inicios: number[] = [];
  linhas.forEach((l, i) => {
    const anterior = linhas[i - 1];
    if (!anterior) {
      inicios.push(i);
      return;
    }
    const espaco = l.top - (anterior.top + anterior.height);
    const proporcao = l.height / anterior.height;
    if (espaco > anterior.height * 0.5 || proporcao > 1.25 || proporcao < 0.8) inicios.push(i);
  });
  return inicios;
}

/**
 * O texto de um trecho da camada de texto, com um espaço no fim de cada linha. O pdf.js marca
 * o fim da linha com um <br>, que o `Range.toString()` ignora: "no trem<br>um rapaz" virava
 * "no tremum rapaz" no destaque (e no Markdown exportado).
 */
export function textoDoTrecho(trecho: Range): string {
  const copia = trecho.cloneContents();
  for (const br of copia.querySelectorAll("br")) br.replaceWith(" ");
  return (copia.textContent ?? "").replace(/ {2,}/g, " ").trim();
}

/**
 * As frases de uma página do PDF, bloco a bloco, como intervalos na camada de texto (podem
 * ser selecionados como uma seleção feita com o mouse).
 */
export function frasesDaCamada(camada: Element, idioma?: string | null): Range[] {
  const doc = camada.ownerDocument;
  // Só os pedaços com texto (o pdf.js também põe quebras e marcadores vazios).
  const pedacos = [...camada.querySelectorAll("span")].filter(
    (s) => !s.querySelector("span") && s.textContent?.trim(),
  );
  const caixas = pedacos.map((p) => p.getBoundingClientRect());
  const linhas = agruparEmLinhas(caixas);
  const caixasDasLinhas = linhas.map((indices) => {
    const top = Math.min(...indices.map((i) => caixas[i]!.top));
    const bottom = Math.max(...indices.map((i) => caixas[i]!.top + caixas[i]!.height));
    // A altura da linha é a da letra mais comum nela (a mediana dos pedaços).
    const alturas = indices.map((i) => caixas[i]!.height).sort((a, b) => a - b);
    return { top, height: alturas[Math.floor(alturas.length / 2)] ?? bottom - top };
  });
  const inicios = quebrasDeBloco(caixasDasLinhas);
  const frases: Range[] = [];
  inicios.forEach((inicio, b) => {
    const fim = (inicios[b + 1] ?? linhas.length) - 1;
    const primeiro = pedacos[linhas[inicio]![0]!]!;
    const ultimo = pedacos[linhas[fim]!.at(-1)!]!;
    const bloco = doc.createRange();
    bloco.setStartBefore(primeiro);
    bloco.setEndAfter(ultimo);
    frases.push(...frasesDe(bloco, idioma));
  });
  return frases;
}
