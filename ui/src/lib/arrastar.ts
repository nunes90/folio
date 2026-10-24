// Arrastar arquivos para a janela e soltar para importar. O Tauri entrega os caminhos
// (a webview só veria nomes, sem acesso ao arquivo). O botão "Importar livros…" continua
// sendo o caminho pelo teclado.
import type { DragDropEvent } from "@tauri-apps/api/webview";

export interface AcoesDoArraste {
  /** Arquivos sobre a janela: mostrar onde soltar. */
  entrar: () => void;
  /** Saíram da janela ou foram soltos: esconder. */
  sair: () => void;
  soltar: (caminhos: string[]) => void;
}

export function tratarArraste(evento: DragDropEvent, acoes: AcoesDoArraste): void {
  switch (evento.type) {
    case "enter":
    case "over":
      acoes.entrar();
      return;
    case "drop":
      acoes.sair();
      // Soltar texto ou um link chega sem caminhos: não há o que importar.
      if (evento.paths.length) acoes.soltar(evento.paths);
      return;
    case "leave":
      acoes.sair();
  }
}

/** Escuta o arraste na janela; devolve a função que para de escutar. */
export async function ouvirArraste(acoes: AcoesDoArraste): Promise<() => void> {
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((e) => tratarArraste(e.payload, acoes));
}
