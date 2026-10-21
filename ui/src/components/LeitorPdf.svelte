<script lang="ts">
  import { onMount } from "svelte";
  import type { PDFDocumentLoadingTask } from "pdfjs-dist";
  import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
  import "pdfjs-dist/web/pdf_viewer.css";
  import BarraPdf from "./BarraPdf.svelte";
  import BuscaPdf from "./BuscaPdf.svelte";
  import { log } from "../lib/log";
  import { carregarPdf, carregarVisor } from "../lib/pdf";

  let {
    dados,
    titulo,
    inicio,
    onFechar,
    onProgresso,
  }: {
    dados: ArrayBuffer;
    titulo: string;
    /** Onde retomar, no formato `pagina:N` (salvo na biblioteca). */
    inicio?: string;
    onFechar: () => void;
    onProgresso?: (localizacao: string, fracao: number) => void;
  } = $props();

  let conteiner: HTMLDivElement;
  let tituloEl: HTMLHeadingElement;
  let campoBusca = $state<HTMLInputElement>();
  let visor: PDFViewer | undefined;
  let tarefa: PDFDocumentLoadingTask | undefined;

  let pagina = $state(1);
  let total = $state(0);
  let zoom = $state(1);
  let resultadoBusca = $state("");
  let erro = $state<string | null>(null);

  /** Estados do PDFFindController (FindState no pdf.js). */
  const BUSCA = { ENCONTRADO: 0, NADA: 1, VOLTOU_AO_INICIO: 2, PENDENTE: 3 };

  onMount(() => {
    // Foco no título: o leitor de tela anuncia qual documento foi aberto.
    tituloEl.focus();
    window.addEventListener("keydown", aoTeclar);
    abrir().catch((e) => {
      erro = `Não foi possível abrir o PDF: ${e}`;
      log.error(erro);
    });
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      tarefa?.destroy();
    };
  });

  async function abrir() {
    const { EventBus, PDFFindController, PDFLinkService, PDFViewer } = await carregarVisor();
    const eventos = new EventBus();
    const links = new PDFLinkService({ eventBus: eventos });
    const busca = new PDFFindController({ eventBus: eventos, linkService: links });
    const v = new PDFViewer({ container: conteiner, eventBus: eventos, linkService: links, findController: busca });
    links.setViewer(v);
    visor = v;

    eventos.on("pagesinit", () => {
      v.currentScaleValue = "page-width";
      const n = Number(inicio?.match(/^pagina:(\d+)$/)?.[1]);
      if (n >= 1 && n <= v.pagesCount) v.currentPageNumber = n;
      // Registra a abertura mesmo sem troca de página (senão o livro aparece como "Não iniciado").
      onProgresso?.(`pagina:${v.currentPageNumber}`, v.currentPageNumber / v.pagesCount);
    });
    eventos.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      pagina = pageNumber;
      onProgresso?.(`pagina:${pageNumber}`, total ? pageNumber / total : 0);
    });
    eventos.on("scalechanging", ({ scale }: { scale: number }) => (zoom = scale));
    eventos.on(
      "updatefindcontrolstate",
      ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => {
        if (state === BUSCA.PENDENTE) resultadoBusca = "Buscando…";
        else if (state === BUSCA.NADA) resultadoBusca = "Nada encontrado";
        else resultadoBusca = `${matchesCount.current} de ${matchesCount.total}`;
      },
    );
    eventos.on(
      "updatefindmatchescount",
      ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
        if (matchesCount.total) resultadoBusca = `${matchesCount.current} de ${matchesCount.total}`;
      },
    );

    tarefa = carregarPdf(dados);
    const documento = await tarefa.promise;
    total = documento.numPages;
    v.setDocument(documento);
    links.setDocument(documento);
  }

  function irPara(n: number) {
    if (visor && n >= 1 && n <= total) visor.currentPageNumber = n;
  }

  function buscar(termo: string, anterior: boolean) {
    visor?.eventBus.dispatch("find", {
      source: null,
      // Mesmo termo de novo: "again" avança para a próxima ocorrência em vez de recomeçar.
      type: "again",
      query: termo,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: anterior,
      matchDiacritics: false,
    });
  }

  function aoTeclar(e: KeyboardEvent) {
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    if (!visor) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "f") {
      e.preventDefault();
      campoBusca?.focus();
      return;
    }
    if (ctrl && (e.key === "+" || e.key === "=")) {
      e.preventDefault();
      visor.increaseScale();
      return;
    }
    if (ctrl && e.key === "-") {
      e.preventDefault();
      visor.decreaseScale();
      return;
    }
    if (ctrl && e.key === "0") {
      e.preventDefault();
      visor.currentScaleValue = "page-width";
      return;
    }
    // Setas trocam de página, exceto quando o foco está num campo de texto.
    const emCampo = e.target instanceof HTMLInputElement;
    if (emCampo || ctrl || e.altKey) return;
    if (e.key === "ArrowLeft") visor.previousPage();
    else if (e.key === "ArrowRight") visor.nextPage();
  }
</script>

<div class="leitor">
  <header>
    <button type="button" onclick={onFechar}>Voltar à biblioteca</button>
    <h1 tabindex="-1" bind:this={tituloEl}>{titulo}</h1>
    <BuscaPdf resultado={resultadoBusca} onBuscar={buscar} bind:campo={campoBusca} />
  </header>

  <div class="area">
    {#if erro}
      <p role="alert">{erro}</p>
    {/if}
    <!-- O PDFViewer exige um contêiner com position: absolute e um filho .pdfViewer.
         Região rolável focável (tabindex) para rolar pelo teclado. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex: o WCAG exige que áreas roláveis
         sejam alcançáveis pelo teclado (regra scrollable-region-focusable do axe). -->
    <div class="conteiner" bind:this={conteiner} tabindex="0" role="region" aria-label={titulo}>
      <div class="pdfViewer"></div>
    </div>
  </div>

  <footer>
    <BarraPdf
      {pagina}
      {total}
      {zoom}
      onIrPara={irPara}
      onZoomMenos={() => visor?.decreaseScale()}
      onZoomMais={() => visor?.increaseScale()}
      onAjustarLargura={() => visor && (visor.currentScaleValue = "page-width")}
    />
  </footer>
</div>

<style>
  .leitor {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-block-end: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }

  h1 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area {
    position: relative;
    min-height: 0;
  }

  .conteiner {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  footer {
    padding: 0.5rem 1rem;
    border-block-start: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }
</style>
