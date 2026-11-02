// O que dizer a cada passo do docs/testes/orca.md: as falas vêm do log do Orca (linhas "SPEECH OUTPUT"), sem áudio.
import fs from "node:fs";
export const LOG = process.env.ORCA_LOG;
const SAIDA = process.env.ORCA_SAIDA;
let lidos = 0;
export function falasNovas() {
  const t = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const novas = t.slice(lidos);
  lidos = t.length;
  return [...novas.matchAll(/SPEECH OUTPUT: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
}
/** Faz a ação, espera o Orca falar e registra. */
export async function passo(id, acao, f, espera = 1100) {
  falasNovas();
  let erro = "";
  try { await f(); } catch (e) { erro = ` [ERRO NA AÇÃO: ${String(e.message ?? e).slice(0, 90)}]`; }
  await browser.pause(espera);
  const falas = falasNovas().filter((x) => !/^(Browse mode|Focus mode)$/.test(x));
  fs.appendFileSync(SAIDA, `${id}\t${acao}\t${falas.join(" | ") || "(nada)"}${erro}\n`);
}
export const estado = () => browser.execute(() => { const a = document.activeElement; return `${a?.tagName}:${(a?.getAttribute("aria-label") || a?.textContent || "").trim().slice(0, 30)}`; });
export const nota = (t) => fs.appendFileSync(SAIDA, `#\t${t}\n`);
