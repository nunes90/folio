// Links que saem do livro (M35c), iguais no EPUB e no PDF: o leitor pede, o App mostra a
// confirmação ("Abrir example.org no navegador?") e só então o Rust abre. O critério é o do core
// (crates/core/src/links.rs), repetido aqui só para decidir o que mostrar: quem decide é o core.
import { invoke } from "@tauri-apps/api/core";
import { avisar } from "./avisos.svelte";

export interface LinkExterno {
  url: string;
  host: string;
}

/** O link, se for http(s) com host e sem usuário e senha; `null` nos outros casos. */
export function linkExterno(href: string): LinkExterno | null {
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || !url.hostname) return null;
  return { url: url.href, host: url.hostname };
}

/** Um endereço com esquema (`mailto:`, `ftp:`…). */
const comEsquema = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href.trim());

/** A confirmação à espera de resposta (o App a mostra). */
export const confirmacaoDeLink = $state<{ pedido: LinkExterno | null }>({ pedido: null });

/**
 * Um link do livro para fora dele foi clicado: pede confirmação antes de abrir no navegador. Um
 * link de outro esquema (`mailto:`, `file:`) não abre, e um aviso diz por quê.
 */
export function pedirParaAbrir(href: string): void {
  const link = linkExterno(href);
  if (link) {
    confirmacaoDeLink.pedido = link;
    return;
  }
  if (comEsquema(href))
    avisar("Este link não pode ser aberto pelo Folio: só endereços da web (http e https).", "erro");
}

export async function abrirLinkConfirmado(): Promise<void> {
  const link = confirmacaoDeLink.pedido;
  confirmacaoDeLink.pedido = null;
  if (!link) return;
  try {
    await invoke("abrir_no_navegador", { url: link.url });
  } catch (erro) {
    avisar(String(erro), "erro");
  }
}

export function cancelarLink(): void {
  confirmacaoDeLink.pedido = null;
}
