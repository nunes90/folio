<script lang="ts">
  // O lado novo do PDF (M25c): outra página do mesmo documento, ao lado da principal, para
  // comparar. Um segundo PDFViewer sobre o mesmo documento (já carregado: o pdf.js não o lê de
  // novo), com a mesma cor de página e os mesmos destaques (o ControleDestaques é o do leitor:
  // um destaque criado num lado aparece nos dois). Lê e destaca; voz, meta, sessão, progresso,
  // busca e a uma ideia por vez ficam só com o lado principal. Os controles ficam no rodapé
  // (ControlesLado), como no EPUB.
  import { onMount, untrack } from "svelte";
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
  import "pdfjs-dist/web/pdf_viewer.css";
  import "../lib/paginasPdf.css";
  import type { Destaque } from "../lib/biblioteca";
  import type { ControleDestaques } from "../lib/controleDestaques.svelte";
  import { duracao } from "../lib/animacao";
  import {
    acertou,
    desenharCamadaDestaques,
    lerLocalPdf,
    naJanela,
    selecaoNoPdf,
  } from "../lib/destaquesPdf";
  import { posicaoDaBarra, resumo } from "../lib/destaques";
  import { inverterCanvas } from "../lib/pagina";
  import { camadaDeTexto, carregarVisor, paginaRenderizada } from "../lib/pdf";
  import { frasesDaCamada, textoDoTrecho } from "../lib/frasesPdf";
  import { trechoSeguinte, unir } from "../lib/frases";
  import type { MudancaDeTrecho } from "../lib/controleDestaques.svelte";
  import { preferencias } from "../lib/preferencias.svelte";
  import { animarVirada, cancelarVirada, quadrosDaVirada } from "../lib/virada";

  let {
    documento,
    inicio,
    escala,
    invertida,
    camada,
    papel,
    marcaOpacidade,
    marcaMistura,
    destaques,
    capituloDa,
    pagina = $bindable(0),
    zoom = $bindable(1),
  }: {
    documento: PDFDocumentProxy;
    /** A página em que o lado abre. */
    inicio: number;
    /** O zoom do lado principal ao abrir (ex.: "page-fit", 1.5): os dois com o mesmo tamanho. */
    escala: string;
    /** A cor da página, a mesma do principal (lib/pagina.ts). */
    invertida: boolean;
    camada: boolean;
    papel: string;
    marcaOpacidade: number;
    marcaMistura: string;
    destaques: ControleDestaques;
    /** A seção do sumário em que a página está (o capítulo do destaque). */
    capituloDa: (n: number) => string | null;
    /** A página e o zoom do lado (para os controles no rodapé, os mesmos do principal). */
    pagina?: number;
    zoom?: number;
  } = $props();

  let conteiner: HTMLDivElement;
  let visor = $state<PDFViewer>();
  let pronto = $state(false);
  let anuncio = $state("");
  const total = $derived(documento.numPages);

  // Entrar ou sair da noite muda os pixels: o pdf.js redesenha as páginas (como no principal).
  let estavaInvertida = untrack(() => invertida);
  $effect(() => {
    const agora = invertida;
    if (!pronto || !visor || agora === estavaInvertida) return;
    estavaInvertida = agora;
    const v = visor;
    untrack(() => v.refresh());
  });

  function paginaEl(n: number): HTMLElement | null {
    return conteiner?.querySelector<HTMLElement>(`.page[data-page-number="${n}"]`) ?? null;
  }

  export function desenhar(d: Destaque) {
    const n = lerLocalPdf(d.local)?.pagina;
    const el = n ? paginaEl(n) : null;
    if (el && n) desenharCamadaDestaques(el, n, destaques.lista);
  }

  export const apagarDesenho = desenhar;

  /** Leva o lado à página `n`, com a virada das preferências (no modo página a página). */
  export async function ir(n: number, seguindoFrase = false) {
    const v = visor;
    if (!v || n < 1 || n > total || n === pagina) return;
    // Virar à mão encerra a barra; no modo frase, a página vira para acompanhar a frase.
    if (!seguindoFrase) destaques.esconder();
    if (preferencias.modoPdf === "rolagem") {
      v.currentPageNumber = n;
      return;
    }
    const sentido = n > pagina ? "direita" : "esquerda";
    cancelarVirada();
    const animar = duracao("curta") > 0 && quadrosDaVirada(preferencias.virada, sentido) !== null;
    if (animar) conteiner.style.opacity = "0";
    try {
      v.currentPageNumber = n;
      await paginaRenderizada(v, n);
    } finally {
      if (animar) conteiner.style.opacity = "";
    }
    animarVirada(conteiner, preferencias.virada, sentido);
  }

  export function virar(sentido: "esquerda" | "direita") {
    return ir(pagina + (sentido === "direita" ? 1 : -1));
  }

  export function zoomMenos() {
    visor?.decreaseScale();
  }

  export function zoomMais() {
    visor?.increaseScale();
  }

  export function ajustarLargura() {
    if (visor) visor.currentScaleValue = "page-width";
  }

  export function focar() {
    conteiner?.focus({ preventScroll: true });
  }

  /** O elemento está dentro deste lado? (F6 e o foco da barra de destaque.) */
  export function contem(el: Element | null): boolean {
    return !!el && !!conteiner?.contains(el);
  }

  /** A seleção da janela está neste lado? (A barra de destaque devolve o foco para cá.) */
  export function temSelecao(): boolean {
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && contem(sel.anchorNode?.parentElement ?? null);
  }

  /** Há texto selecionado neste lado? Abre a barra de destaque sobre ele. */
  function verSelecao(focar: boolean): boolean {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const achada = selecaoNoPdf(sel.getRangeAt(0), conteiner, total, capituloDa);
    if (!achada) return false;
    destaques.mostrarSelecao(achada.selecao, achada.posicao, focar, true);
    return true;
  }

  // Modo frase, como no principal: Ctrl+D sem seleção seleciona a primeira frase da página e abre
  // a barra; Alt+↑/↓ trocam de frase (passando de página nas pontas) e Alt+Shift+↑/↓ mudam o
  // tamanho do trecho (a barra os manda para cá: `temModoFrase`). Para destacar sem o mouse.
  let modoFrase: { pagina: number; frases: Range[]; de: number; ate: number } | null = null;
  const frasesPorCamada = new WeakMap<Element, Range[]>();

  export function temModoFrase(): boolean {
    return modoFrase !== null;
  }

  /** A barra fechou: a seleção do modo frase era só a prévia. */
  export function sairDoModoFrase() {
    if (modoFrase) window.getSelection()?.removeAllRanges();
    modoFrase = null;
  }

  async function iniciarModoFrase(n: number, onde: "inicio" | "fim") {
    const camada = await camadaDeTexto(visor, () => paginaEl(n), n);
    const frases = camada ? (frasesPorCamada.get(camada) ?? frasesDaCamada(camada, null)) : [];
    if (camada) frasesPorCamada.set(camada, frases);
    if (!frases.length) {
      anuncio = "Não há texto selecionável nesta página para destacar.";
      return;
    }
    const i = onde === "inicio" ? 0 : frases.length - 1;
    modoFrase = { pagina: n, frases, de: i, ate: i };
    mostrarFrases();
  }

  /** Seleciona o trecho do modo frase e abre a barra sobre ele (com o foco). */
  function mostrarFrases() {
    if (!modoFrase) return;
    const trecho = unir(modoFrase.frases, modoFrase.de, modoFrase.ate);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(trecho);
    verSelecao(true);
    anuncio = `Frase: ${resumo(textoDoTrecho(trecho), 300)}`;
  }

  /** Alt+↑/↓ (outra frase; nas pontas, a página vizinha) e Alt+Shift+↑/↓ (trecho na página). */
  export async function mudarTrecho(mudanca: MudancaDeTrecho) {
    if (!modoFrase) return;
    const { pagina: n, frases, de, ate } = modoFrase;
    const novo = trechoSeguinte(frases.length, de, ate, mudanca);
    if (novo) {
      modoFrase = { ...modoFrase, de: novo[0], ate: novo[1] };
      mostrarFrases();
    } else if (mudanca === "proxima" || mudanca === "anterior") {
      const vizinha = n + (mudanca === "proxima" ? 1 : -1);
      if (vizinha < 1 || vizinha > total) {
        anuncio = mudanca === "proxima" ? "Fim do documento." : "Início do documento.";
        return;
      }
      await ir(vizinha, true);
      await iniciarModoFrase(vizinha, mudanca === "proxima" ? "inicio" : "fim");
    } else {
      anuncio = mudanca === "estender" ? "Fim da página." : "Só uma frase.";
    }
  }

  /** Soltar o ponteiro: a barra sobre a seleção ou, num destaque, a dele. */
  function aoSoltar(e: PointerEvent) {
    setTimeout(() => {
      if (verSelecao(false)) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(".page");
      if (!el) return;
      const caixa = el.getBoundingClientRect();
      const x = (e.clientX - caixa.left) / caixa.width;
      const y = (e.clientY - caixa.top) / caixa.height;
      const n = Number(el.dataset.pageNumber);
      for (const d of destaques.lista) {
        const local = lerLocalPdf(d.local);
        if (local?.pagina === n && acertou(local.retangulos, x, y)) {
          destaques.mostrarDestaque(d, posicaoDaBarra(naJanela(local.retangulos[0]!, caixa)), true);
          return;
        }
      }
    });
  }

  /** Teclas com o foco neste lado: as setas viram as páginas daqui; Ctrl+D destaca daqui. */
  function aoTeclar(e: KeyboardEvent) {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (!verSelecao(true)) void iniciarModoFrase(pagina, "inicio");
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const sentido: Record<string, "esquerda" | "direita"> = {
      ArrowLeft: "esquerda",
      ArrowRight: "direita",
      PageUp: "esquerda",
      PageDown: "direita",
    };
    const s = sentido[e.key];
    // Na rolagem contínua, as setas rolam (como no principal); PageUp/PageDown viram.
    if (!s || (preferencias.modoPdf === "rolagem" && e.key.startsWith("Arrow"))) return;
    e.preventDefault();
    void virar(s);
  }

  /** O modo e o zoom do principal: página a página (página inteira) ou rolagem (largura). */
  function aplicarModo(v: PDFViewer, modos: { PAGE: number; VERTICAL: number }, valor?: string) {
    const paginas = preferencias.modoPdf === "paginas";
    v.scrollMode = paginas ? modos.PAGE : modos.VERTICAL;
    v.currentScaleValue = valor ?? (paginas ? "page-fit" : "page-width");
  }

  onMount(() => {
    let fechado = false;
    let observador: ResizeObserver | null = null;
    void (async () => {
      const { EventBus, PDFLinkService, PDFViewer, ScrollMode } = await carregarVisor();
      if (fechado) return;
      const eventos = new EventBus();
      const links = new PDFLinkService({ eventBus: eventos });
      const v = new PDFViewer({ container: conteiner, eventBus: eventos, linkService: links });
      links.setViewer(v);
      eventos.on(
        "pagerendered",
        ({ source, cssTransform, error, pageNumber }: {
          source: { canvas?: HTMLCanvasElement | null };
          cssTransform: boolean;
          error: unknown;
          pageNumber: number;
        }) => {
          if (invertida && !cssTransform && !error && source.canvas) inverterCanvas(source.canvas);
          const el = paginaEl(pageNumber);
          if (el) desenharCamadaDestaques(el, pageNumber, destaques.lista);
        },
      );
      eventos.on("pagesinit", () => {
        aplicarModo(v, ScrollMode, escala);
        v.currentPageNumber = Math.min(Math.max(1, inicio), total);
        pagina = v.currentPageNumber;
        pronto = true;
        focar();
      });
      eventos.on("scalechanging", ({ scale }: { scale: number }) => {
        if (scale !== zoom) destaques.esconderDe(true);
        zoom = scale;
      });
      eventos.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
        if (!modoFrase) destaques.esconderDe(true);
        pagina = pageNumber;
      });
      v.setDocument(documento);
      links.setDocument(documento);
      visor = v;
      // Como no principal: os zooms "página inteira" e "largura" acompanham a área do lado.
      let tamanho = "";
      observador =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => {
              const novo = `${conteiner.clientWidth}x${conteiner.clientHeight}`;
              if (novo === tamanho) return;
              tamanho = novo;
              const valor = v.currentScaleValue;
              if (valor === "page-fit" || valor === "page-width") v.currentScaleValue = valor;
            });
      observador?.observe(conteiner);
    })();
    return () => {
      fechado = true;
      observador?.disconnect();
      // O documento é do principal: só o visor deste lado sai.
      visor?.setDocument(null as unknown as PDFDocumentProxy);
    };
  });
</script>

<section class="lado" aria-label="Ao lado: página {pagina} de {total}">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="conteiner paginas-pdf"
    class:camada
    class:invertida
    style:--papel-pdf={papel}
    style:--marca-opacidade={marcaOpacidade}
    style:--marca-mistura={marcaMistura}
    bind:this={conteiner}
    onpointerup={aoSoltar}
    onkeydown={aoTeclar}
    tabindex="0"
    role="region"
    aria-label="Documento ao lado"
  >
    <div class="pdfViewer"></div>
  </div>
  <p class="so-leitor-de-tela" aria-live="polite">{anuncio}</p>
</section>

<style>
  .lado {
    position: relative;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: clip;
  }

  /* A linha entre os dois lados, por cima (como no EPUB: uma borda tiraria largura do lado). */
  .lado::before {
    content: "";
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 1;
    width: 1px;
    background: var(--divisoria);
    pointer-events: none;
  }

  .conteiner {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: var(--app);
  }
</style>
