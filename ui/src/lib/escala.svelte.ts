// Escala de texto do sistema, aplicada via CSS (ver crates/app/src/escala.rs para o porquê
// de não usar o zoom da webview). Reativa: muda se o usuário alterar a escala com o app aberto.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { log } from "./log";

export const escala = $state({ fator: 1 });

function aplicar(fator: number) {
  escala.fator = fator;
  document.documentElement.style.setProperty("--escala-texto", String(fator));
}

/** Busca a escala atual e passa a acompanhar mudanças. Fora do Tauri fica em 1. */
export async function iniciarEscala(): Promise<void> {
  if (!isTauri()) return;
  try {
    aplicar(await invoke<number>("escala_texto"));
    await listen<number>("escala-texto", (e) => aplicar(e.payload));
  } catch (e) {
    log.warn(`escala de texto indisponível: ${e}`);
  }
}

/** CSS injetado em cada capítulo do livro. */
export function cssDoLivro(fator: number): string {
  return `html { font-size: ${fator * 100}% !important; }`;
}
