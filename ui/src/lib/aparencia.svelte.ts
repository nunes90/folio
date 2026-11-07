// A aba do painel Aparência (M28b), lembrada enquanto o app está aberto, no leitor e na biblioteca:
// quem só mexe na voz não precisa passar pela Leitura a cada vez.
export type AbaAparencia = "leitura" | "voz" | "interface";

export const abaAparencia = $state<{ atual: AbaAparencia }>({
  atual: "leitura",
});

/** A aba a mostrar, entre as que existem: na biblioteca (sem a Leitura), a Interface. */
export function abaValida(
  atual: AbaAparencia,
  existentes: AbaAparencia[],
): AbaAparencia {
  if (existentes.includes(atual)) return atual;
  return existentes.includes("interface") ? "interface" : existentes[0];
}
