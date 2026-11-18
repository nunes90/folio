// A lixeira com prazo (M43a): nada é apagado sozinho. A lixeira diz quanto espaço ocupa e há
// quanto tempo cada livro está lá, e oferece "Esvaziar os de mais de 30 dias…" (com confirmação).
import { haQuanto } from "./continuacao";

/** O mesmo prazo do core (`biblioteca::PRAZO_DA_LIXEIRA`), em segundos. */
export const PRAZO_DA_LIXEIRA = 30 * 86_400;

/** Os livros que o botão apagaria: na lixeira há `PRAZO_DA_LIXEIRA` ou mais (`agora` em segundos). */
export function antigosDaLixeira<L extends { removidoEm: number | null }>(lixeira: L[], agora: number): L[] {
  return lixeira.filter((l) => l.removidoEm !== null && l.removidoEm <= agora - PRAZO_DA_LIXEIRA);
}

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "12 MB", "1,5 GB" (unidades decimais, como os gerenciadores de arquivos). */
export function textoDoEspaco(bytes: number): string {
  if (bytes <= 0) return "nada";
  if (bytes < 1_000_000) return "menos de 1 MB";
  if (bytes < 1_000_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${decimal.format(bytes / 1_000_000_000)} GB`;
}

/**
 * "Na lixeira há 3 dias", "Na lixeira desde ontem" (a linha de situação do cartão). O Intl diz
 * "ontem" e "anteontem" no lugar de "há 1 dia" e "há 2 dias": com eles, "desde".
 */
export function tiradoHa(livro: { removidoEm: number | null }, agora: number): string {
  if (livro.removidoEm === null) return "Na lixeira";
  const quando = haQuanto(livro.removidoEm, agora);
  return quando.startsWith("há ") ? `Na lixeira ${quando}` : `Na lixeira desde ${quando}`;
}
