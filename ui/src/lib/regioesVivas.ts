// O WebKitGTK quase não envia o evento de texto do qual o Orca lê as regiões vivas (aria-live,
// role="status", role="alert"): ele não diz nada, mesmo com o texto certo na página. As regiões continuam
// na página, para os outros leitores; aqui, cada mudança também vai direto ao leitor de tela.

const REGIAO = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]';
/** Regiões que falam ao entrar na página, como no ARIA. Só `aria-live` fala apenas quando muda. */
const FALA_AO_ENTRAR = '[role="status"], [role="alert"]';
/** Ao digitar na busca ou andar pelas opções, só o último texto interessa. */
const ESPERA_MS = 150;
/** As camadas de texto do PDF mudam muito e não têm regiões. */
const SEM_REGIOES = ".pdfViewer";

const normalizar = (texto: string | null) => (texto ?? "").replace(/\s+/g, " ").trim();

/** Observa as regiões vivas dentro de `raiz` e passa cada texto novo a `falar`. Devolve como parar. */
export function observarRegioesVivas(raiz: HTMLElement, falar: (texto: string) => void): () => void {
  const ultimo = new WeakMap<Element, string>();
  const esperas = new Map<Element, ReturnType<typeof setTimeout>>();

  function dizer(regiao: Element) {
    esperas.delete(regiao);
    const texto = normalizar(regiao.textContent);
    const antes = ultimo.get(regiao) ?? "";
    ultimo.set(regiao, texto);
    // Saiu um de vários avisos: o que ficou já foi dito. Entrou mais um: só ele.
    if (!texto || antes.includes(texto)) return;
    falar(texto.startsWith(antes) ? texto.slice(antes.length).trim() : texto);
  }

  function agendar(regiao: Element) {
    clearTimeout(esperas.get(regiao));
    esperas.set(regiao, setTimeout(() => dizer(regiao), ESPERA_MS));
  }

  const observador = new MutationObserver((mudancas) => {
    const regioes = new Set<Element>();
    for (const { target, addedNodes } of mudancas) {
      const elemento = target instanceof Element ? target : target.parentElement;
      if (!elemento || elemento.closest(SEM_REGIOES)) continue;
      const regiao = elemento.closest(REGIAO);
      if (regiao) regioes.add(regiao);
      for (const no of addedNodes) {
        if (!(no instanceof Element)) continue;
        if (no.matches(FALA_AO_ENTRAR)) regioes.add(no);
        for (const dentro of no.querySelectorAll(FALA_AO_ENTRAR)) regioes.add(dentro);
      }
    }
    regioes.forEach(agendar);
  });
  observador.observe(raiz, { subtree: true, childList: true, characterData: true });

  return () => {
    observador.disconnect();
    esperas.forEach((espera) => clearTimeout(espera));
    esperas.clear();
  };
}
