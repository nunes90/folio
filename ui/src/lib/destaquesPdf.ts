// Destaques no PDF (M16c): o endereço do trecho e a geometria. O PDF não tem CFI: o destaque
// é a página e os retângulos do trecho nela, em frações da página (0 a 1). Assim não depende
// do zoom, e o desenho é em porcentagens. O arquivo do PDF nunca é alterado.

/** Um retângulo em frações da página: x e y do canto superior esquerdo, largura e altura. */
export interface Retangulo {
  x: number;
  y: number;
  l: number;
  a: number;
}

const PREFIXO = "pdf:";
const casas = (n: number) => String(Math.round(n * 10000) / 10000);

/** "pdf:3:0.1,0.2,0.5,0.02;…" (página a partir de 1). */
export function localPdf(pagina: number, retangulos: Retangulo[]): string {
  const rs = retangulos.map((r) => [r.x, r.y, r.l, r.a].map(casas).join(","));
  return `${PREFIXO}${pagina}:${rs.join(";")}`;
}

/** O contrário de `localPdf`; null se não for um local de PDF válido. */
export function lerLocalPdf(local: string): { pagina: number; retangulos: Retangulo[] } | null {
  const m = local.match(/^pdf:(\d+):(.+)$/);
  if (!m) return null;
  const pagina = Number(m[1]);
  const retangulos: Retangulo[] = [];
  for (const parte of m[2]!.split(";")) {
    const n = parte.split(",").map(Number);
    if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
    retangulos.push({ x: n[0]!, y: n[1]!, l: n[2]!, a: n[3]! });
  }
  return pagina >= 1 && retangulos.length ? { pagina, retangulos } : null;
}

interface Caixa {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Os retângulos da seleção (`range.getClientRects()`, na janela) em frações da página:
 * recortados nela (uma seleção pode passar da página), sem os vazios, e os da mesma linha
 * juntados (o pdf.js dá um retângulo por pedaço de texto).
 */
export function retangulosNaPagina(rects: Caixa[], pagina: Caixa): Retangulo[] {
  const { left, top, width, height } = pagina;
  if (!width || !height) return [];
  const dentro: Retangulo[] = [];
  for (const r of rects) {
    const x0 = Math.max(r.left, left);
    const y0 = Math.max(r.top, top);
    const x1 = Math.min(r.left + r.width, left + width);
    const y1 = Math.min(r.top + r.height, top + height);
    // Muito fino (bordas, quebras de linha) não conta.
    if (x1 - x0 < 1 || y1 - y0 < 1) continue;
    // Um retângulo da página toda é o "fim do conteúdo" do pdf.js, não texto.
    if (y1 - y0 > height * 0.5) continue;
    dentro.push({ x: (x0 - left) / width, y: (y0 - top) / height, l: (x1 - x0) / width, a: (y1 - y0) / height });
  }
  dentro.sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas: Retangulo[] = [];
  for (const r of dentro) {
    const ultima = linhas.at(-1);
    // Mesma linha: os meios verticais quase iguais (metade da altura de tolerância).
    const mesmaLinha =
      ultima && Math.abs(ultima.y + ultima.a / 2 - (r.y + r.a / 2)) < Math.min(ultima.a, r.a) / 2;
    if (ultima && mesmaLinha) {
      const x0 = Math.min(ultima.x, r.x);
      const y0 = Math.min(ultima.y, r.y);
      const x1 = Math.max(ultima.x + ultima.l, r.x + r.l);
      const y1 = Math.max(ultima.y + ultima.a, r.y + r.a);
      Object.assign(ultima, { x: x0, y: y0, l: x1 - x0, a: y1 - y0 });
    } else linhas.push({ ...r });
  }
  return linhas;
}

/** Posição (0 a 1) no documento de um ponto a `y` (fração) da página `pagina` de `total`. */
export function posicaoNoPdf(pagina: number, total: number, y: number): number {
  if (total < 1) return 0;
  const p = (pagina - 1 + Math.min(1, Math.max(0, y))) / total;
  return Math.min(1, Math.max(0, p));
}

/** O ponto (em frações da página) cai num dos retângulos? */
export function acertou(retangulos: Retangulo[], x: number, y: number): boolean {
  return retangulos.some((r) => x >= r.x && x <= r.x + r.l && y >= r.y && y <= r.y + r.a);
}

/** O retângulo, de frações da página, de volta para a janela (para posicionar a barra). */
export function naJanela(r: Retangulo, pagina: Caixa) {
  const left = pagina.left + r.x * pagina.width;
  const top = pagina.top + r.y * pagina.height;
  const width = r.l * pagina.width;
  const height = r.a * pagina.height;
  return { left, top, width, height, bottom: top + height };
}
