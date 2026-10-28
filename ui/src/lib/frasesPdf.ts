// Blocos e frases no PDF (M17b). A camada de texto do pdf.js não tem parágrafos: só pedaços de
// texto (spans) posicionados na página, na ordem em que o arquivo os escreve (que nem sempre é
// a de leitura). Os pedaços são postos na ordem de leitura (recorte XY, M19), viram linhas pela
// posição vertical, e as linhas viram blocos pelo espaço entre elas e pela mudança do tamanho
// da letra (um título é maior que o texto). Dentro de cada bloco, as frases saem de `frasesDe`,
// a mesma do EPUB.
import { frasesDe } from "./frases";
import { tipoDoTexto, type TipoDeTrecho } from "./voz";

/** O que importa de cada pedaço de texto para agrupar: a caixa dele na tela. */
export interface Caixa {
  top: number;
  height: number;
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
 * O texto a falar de cada frase a partir de `primeira` (M23): só as do texto principal
 * (`principais`, os pedaços de `soOPrincipal`); as outras (margem, legendas, número da página)
 * ficam vazias, para os índices continuarem os da página (as marcas da voz). A primeira é
 * lida (`lerAPrimeira`) quando é de onde se pediu para ouvir; não quando a leitura só continua
 * (a página seguinte, o trecho seguinte). Sem texto principal reconhecido, lê tudo.
 */
export function frasesParaFalar(
  frases: Range[],
  primeira: number,
  principais: Element[],
  lerAPrimeira = true,
): string[] {
  return frases
    .slice(primeira)
    .map((f, k) =>
      (k === 0 && lerAPrimeira) || !principais.length || principais.some((p) => f.intersectsNode(p))
        ? textoDoTrecho(f)
        : "",
    );
}

/**
 * O tipo de uma frase para a velocidade da voz (M23b): código se a maior parte das letras está
 * em monoespaçada (o pdf.js põe `font-family: monospace` nos pedaços das fontes de largura
 * fixa); lista se começa com marcador; senão, texto.
 */
export function tipoDaFrasePdf(frase: Range): TipoDeTrecho {
  const raiz = frase.commonAncestorContainer;
  const camada = raiz.nodeType === Node.ELEMENT_NODE ? (raiz as Element) : raiz.parentElement;
  let mono = 0;
  let total = 0;
  for (const span of camada?.closest(".textLayer")?.querySelectorAll("span") ?? []) {
    if (span.querySelector("span") || !frase.intersectsNode(span)) continue;
    const letras = span.textContent?.trim().length ?? 0;
    total += letras;
    if (span.style.fontFamily.includes("monospace")) mono += letras;
  }
  if (total && mono / total > 0.5) return "codigo";
  return tipoDoTexto(textoDoTrecho(frase));
}

/** Uma caixa com a posição horizontal também (para achar as colunas). */
export interface CaixaPlena extends Caixa {
  left: number;
  width: number;
}

const mediana = (valores: number[]) =>
  [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)] ?? 0;

/**
 * A ordem de leitura dos pedaços (índices), pelo recorte XY: a região se divide em colunas
 * (da esquerda para a direita) quando há um vão de pelo menos uma letra de altura entre duas
 * partes altas (de três linhas ou mais: texto e margem, duas colunas) ou numa linha só; senão,
 * no maior espaço em branco entre faixas (de cima para baixo); e cada parte se divide de novo.
 * Partes baixas não viram colunas: o recuo de um trecho de código, por exemplo. O que não se
 * divide (uma linha, um parágrafo de linhas encostadas) fica na ordem do arquivo. A ordem do
 * arquivo sozinha não serve: muitos PDFs escrevem o cabeçalho, as figuras e as equações em
 * qualquer ordem, e a "uma ideia por vez" avançava e voltava pela página.
 */
export function ordemDeLeitura(caixas: CaixaPlena[]): number[] {
  const vaoMinimo = mediana(caixas.map((c) => c.height));
  /** O maior vão entre as caixas, projetadas num eixo: [posição na lista ordenada, tamanho]. */
  const maiorVao = (ordem: number[], inicio: (c: CaixaPlena) => number, fim: (c: CaixaPlena) => number) => {
    let [melhor, tamanho, alcance] = [-1, 0, -Infinity];
    ordem.forEach((i, k) => {
      const c = caixas[i]!;
      const vao = inicio(c) - alcance;
      if (k > 0 && vao > tamanho) [melhor, tamanho] = [k, vao];
      alcance = Math.max(alcance, fim(c));
    });
    return [melhor, tamanho] as const;
  };
  const crescente = (lista: number[]) => [...lista].sort((a, b) => a - b);
  const dividir = (indices: number[]): number[] => {
    if (indices.length <= 1) return indices;
    const porY = [...indices].sort((a, b) => caixas[a]!.top - caixas[b]!.top);
    const [corteY, vaoY] = maiorVao(porY, (c) => c.top, (c) => c.top + c.height);
    const emFaixas = () => [
      ...dividir(crescente(porY.slice(0, corteY))),
      ...dividir(crescente(porY.slice(corteY))),
    ];
    const porX = [...indices].sort((a, b) => caixas[a]!.left - caixas[b]!.left);
    const [corteX, vaoX] = maiorVao(porX, (c) => c.left, (c) => c.left + c.width);
    const altura = (lista: number[]) =>
      Math.max(...lista.map((i) => caixas[i]!.top + caixas[i]!.height)) -
      Math.min(...lista.map((i) => caixas[i]!.top));
    const [esquerda, direita] = [porX.slice(0, corteX), porX.slice(corteX)];
    const colunas =
      corteX > 0 &&
      vaoX >= vaoMinimo &&
      (vaoY <= 0 || Math.min(altura(esquerda), altura(direita)) >= 3 * vaoMinimo);
    if (colunas) return [...dividir(crescente(esquerda)), ...dividir(crescente(direita))];
    if (corteY > 0 && vaoY > 0) return emFaixas();
    return indices;
  };
  return dividir(caixas.map((_, i) => i));
}

/**
 * Uma legenda: "Figure 2.12 For Example", "Fig. 3: The…", "Tabela 1 – Os…" ou só "Figure 2.14" (o
 * resto vem em outro pedaço). O número seguido de uma palavra com maiúscula, ou de nada: "Fig.
 * 2.18(a) can be combined…" é uma frase do texto, não legenda.
 */
const LEGENDA = /^(fig(ura|ure)?|tab(ela|le)|quadro|gr[áa]fico|chart|plate)\.?\s*[\dIVXLC][\d.]*\s*[:.–—-]?(\s+\p{Lu}|\s*$)/iu;

/**
 * Os blocos da página na ordem de leitura, cada um com os índices dos seus pedaços. Cada bloco
 * é contínuo na ordem do arquivo (vira um intervalo no DOM da camada de texto): uma volta na
 * ordem, uma subida na página (outra coluna) ou uma legenda (`textos`, se dados) também começa
 * um bloco.
 */
export function blocosEmOrdem(caixas: CaixaPlena[], textos?: string[]): number[][] {
  const linhas: { indices: number[]; top: number; bottom: number }[] = [];
  for (const i of ordemDeLeitura(caixas)) {
    const c = caixas[i]!;
    const meio = c.top + c.height / 2;
    const ultima = linhas.at(-1);
    if (ultima && ultima.indices.at(-1) === i - 1 && meio >= ultima.top && meio <= ultima.bottom) {
      ultima.indices.push(i);
      ultima.top = Math.min(ultima.top, c.top);
      ultima.bottom = Math.max(ultima.bottom, c.top + c.height);
    } else linhas.push({ indices: [i], top: c.top, bottom: c.top + c.height });
  }
  const caixasDasLinhas = linhas.map((l) => ({
    top: l.top,
    // A altura da linha é a da letra mais comum nela (a mediana dos pedaços).
    height: mediana(l.indices.map((i) => caixas[i]!.height)) || l.bottom - l.top,
  }));
  const inicios = new Set(quebrasDeBloco(caixasDasLinhas));
  linhas.forEach((l, k) => {
    const anterior = linhas[k - 1];
    if (anterior && (l.indices[0] !== anterior.indices.at(-1)! + 1 || l.top < anterior.top))
      inicios.add(k);
    if (textos && LEGENDA.test(l.indices.map((i) => textos[i]!.trim()).join(" "))) inicios.add(k);
  });
  const blocos: number[][] = [];
  linhas.forEach((l, k) => {
    if (inicios.has(k) || !blocos.length) blocos.push([]);
    blocos.at(-1)!.push(...l.indices);
  });
  return blocos;
}

/** Blocos com menos letras que isto são "curtos": rótulos de figura, pedaços de equação. */
const CURTO = 25;

/**
 * Uma ideia do PDF: os pedaços dela, se é feita só de blocos curtos (rótulos, equação) e se é
 * uma legenda.
 */
export interface Ideia {
  indices: number[];
  curta: boolean;
  legenda: boolean;
}

/**
 * Os blocos agrupados em ideias, para a "uma ideia por vez": blocos curtos seguidos e próximos
 * (até três linhas de distância) viram uma ideia só (os rótulos de uma figura, as partes de
 * uma equação), e um curto que encosta no anterior (um índice solto no meio da linha) vai com
 * ele. Uma legenda começa uma ideia própria, que leva o resto dela (na mesma linha ou logo
 * abaixo).
 * `textos`: o texto de cada pedaço.
 */
export function ideiasEmOrdem(caixas: CaixaPlena[], textos: string[]): Ideia[] {
  const tamanho = (b: number[]) => b.reduce((soma, i) => soma + textos[i]!.trim().length, 0);
  const texto = (b: number[]) => b.map((i) => textos[i]!.trim()).join(" ");
  const distancia = 3 * mediana(caixas.map((c) => c.height));
  const faixa = (b: number[]) => [
    Math.min(...b.map((i) => caixas[i]!.top)),
    Math.max(...b.map((i) => caixas[i]!.top + caixas[i]!.height)),
  ];
  const ideias: Ideia[] = [];
  for (const bloco of blocosEmOrdem(caixas, textos)) {
    const curto = tamanho(bloco) < CURTO;
    const anterior = ideias.at(-1);
    if (LEGENDA.test(texto(bloco))) {
      ideias.push({ indices: [...bloco], curta: false, legenda: true });
      continue;
    }
    if (anterior) {
      const [topo, base] = faixa(anterior.indices);
      const [t, b] = faixa(bloco);
      const naLinha = b > topo && t < base;
      const perto = t < base + distancia && b > topo - distancia;
      // O resto da legenda (na mesma linha ou na de baixo); um curto perto de outros curtos
      // (rótulos, equação); um curto na altura do bloco anterior (um índice solto).
      const logoAbaixo = t >= topo && t < base + distancia / 3;
      if ((anterior.legenda && (naLinha || logoAbaixo)) || (curto && ((anterior.curta && perto) || naLinha))) {
        anterior.indices.push(...bloco);
        continue;
      }
    }
    ideias.push({ indices: [...bloco], curta: curto, legenda: false });
  }
  return ideias;
}

/**
 * Só as ideias do texto principal, para a "uma ideia por vez" (o resto fica esmaecido e o ↓
 * passa direto). É uma estimativa pelo layout, sem saber o que cada coisa é:
 *  - a coluna principal é a da borda esquerda com mais letras de texto corrido; o que está
 *    fora dela (margem, notas laterais) sai;
 *  - legendas saem, e os rótulos da figura (as ideias curtas logo antes da legenda) também;
 *  - o que é curto e fica acima ou abaixo de todo o texto corrido (número da página, título
 *    corrido) sai.
 * Equações e código dentro da coluna ficam: fazem parte da leitura. Uma página sem texto
 * corrido (ex.: a abertura de um capítulo) fica com tudo, menos as legendas.
 */
export function soOPrincipal(ideias: Ideia[], caixas: CaixaPlena[], textos: string[]): Ideia[] {
  const texto = (ideia: Ideia) => ideia.indices.map((i) => textos[i]).join(" ").trim();
  const caixa = (ideia: Ideia) => {
    const cs = ideia.indices.map((i) => caixas[i]!);
    const left = Math.min(...cs.map((c) => c.left));
    const top = Math.min(...cs.map((c) => c.top));
    return {
      left,
      top,
      right: Math.max(...cs.map((c) => c.left + c.width)),
      bottom: Math.max(...cs.map((c) => c.top + c.height)),
    };
  };
  // Uma legenda e os rótulos curtos logo antes dela (a figura).
  const corridas = ideias.filter((ideia) => !ideia.legenda && !ideia.curta);
  if (!corridas.length) return ideias.filter((ideia) => !ideia.legenda);
  const legenda = ideias.map((ideia) => ideia.legenda);
  for (let k = ideias.length - 1; k > 0; k--)
    if (legenda[k] && ideias[k - 1]!.curta) legenda[k - 1] = true;
  // A borda esquerda (de 8 em 8 pixels) com mais letras de texto corrido.
  const peso = new Map<number, number>();
  for (const ideia of corridas) {
    const borda = Math.round(caixa(ideia).left / 8);
    peso.set(borda, (peso.get(borda) ?? 0) + texto(ideia).length);
  }
  const borda = [...peso].sort((a, b) => b[1] - a[1])[0]![0];
  const naColuna = corridas.filter((ideia) => Math.abs(Math.round(caixa(ideia).left / 8) - borda) <= 1);
  const coluna = {
    left: Math.min(...naColuna.map((ideia) => caixa(ideia).left)),
    right: Math.max(...naColuna.map((ideia) => caixa(ideia).right)),
    top: Math.min(...naColuna.map((ideia) => caixa(ideia).top)),
    bottom: Math.max(...naColuna.map((ideia) => caixa(ideia).bottom)),
  };
  return ideias.filter((ideia, k) => {
    if (legenda[k]) return false;
    const c = caixa(ideia);
    const dentro = Math.min(c.right, coluna.right) - Math.max(c.left, coluna.left);
    if (dentro < (c.right - c.left) / 2) return false;
    if (!ideia.curta) return true;
    return c.bottom > coluna.top && c.top < coluna.bottom;
  });
}

/** Os blocos de uma página do PDF, na ordem de leitura, como intervalos na camada de texto. */
export function blocosDaCamada(camada: Element): Range[] {
  const doc = camada.ownerDocument;
  const pedacos = pedacosDaCamada(camada);
  const caixas = pedacos.map((p) => p.getBoundingClientRect());
  return blocosEmOrdem(caixas).map((indices) => {
    const bloco = doc.createRange();
    bloco.setStartBefore(pedacos[indices[0]!]!);
    bloco.setEndAfter(pedacos[indices.at(-1)!]!);
    return bloco;
  });
}

/**
 * As frases de uma página do PDF, bloco a bloco, como intervalos na camada de texto (podem
 * ser selecionados como uma seleção feita com o mouse).
 */
export function frasesDaCamada(camada: Element, idioma?: string | null): Range[] {
  return blocosDaCamada(camada).flatMap((bloco) => frasesDe(bloco, idioma));
}

/** Os pedaços de texto da camada (sem as quebras e os marcadores vazios do pdf.js). */
export function pedacosDaCamada(camada: Element): HTMLElement[] {
  return [...camada.querySelectorAll("span")].filter(
    (s) => !s.querySelector("span") && s.textContent?.trim(),
  );
}

/**
 * As ideias do texto principal de uma página do PDF: os pedaços de cada uma (o véu cobre a
 * união das caixas).
 */
export function ideiasDaCamada(camada: Element): HTMLElement[][] {
  const pedacos = pedacosDaCamada(camada);
  const caixas = pedacos.map((p) => p.getBoundingClientRect());
  const textos = pedacos.map((p) => p.textContent?.trim() ?? "");
  const ideias = ideiasEmOrdem(caixas, textos);
  return soOPrincipal(ideias, caixas, textos).map((ideia) => ideia.indices.map((i) => pedacos[i]!));
}
