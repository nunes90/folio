// Rótulos quando cabem (M26a-2): as barras do leitor mostram ícone + rótulo enquanto cabem e só
// o ícone quando não (o rótulo continua como nome do botão para o leitor de tela). Medido na
// própria barra, não por pontos de quebra fixos: a escala de texto, o monitor e a fonte mudam o
// quanto cabe numa mesma largura de janela (lição dos destaques fixados, M25a).

export interface EstadoRotulos {
  /** Só ícones. */
  compacto: boolean;
  /** Quanto a barra precisava com os rótulos quando transbordou (px). */
  necessario: number;
}

/**
 * O estado seguinte, dada a largura da barra (`disponivel`) e a do conteúdo (`conteudo`, o
 * scrollWidth). Com rótulos, transbordar passa a só ícones e guarda quanto precisava; só ícones,
 * os rótulos voltam quando a barra tiver isso mais a `folga` (senão mostrar e esconder os
 * rótulos ficaria alternando perto do limite).
 */
export function medirRotulos(
  e: EstadoRotulos,
  disponivel: number,
  conteudo: number,
  folga: number,
): EstadoRotulos {
  if (!e.compacto) return conteudo > disponivel + 0.5 ? { compacto: true, necessario: conteudo } : e;
  return disponivel >= e.necessario + folga ? { compacto: false, necessario: 0 } : e;
}
