<script lang="ts">
  import { onMount } from "svelte";
  import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
  import type { PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
  import "pdfjs-dist/web/pdf_viewer.css";
  import BarraPdf from "./BarraPdf.svelte";
  import BuscaPdf from "./BuscaPdf.svelte";
  import Indice from "./Indice.svelte";
  import MolduraLeitor from "./MolduraLeitor.svelte";
  import PainelTema from "./PainelTema.svelte";
  import { sistema } from "../lib/ambiente.svelte";
  import type { ItemIndice } from "../lib/foliate";
  import { log } from "../lib/log";
  import { carregarPdf, carregarVisor } from "../lib/pdf";
  import { atualizarPreferencias, preferencias } from "../lib/preferencias.svelte";
  import { achatar, converterSumario, itemAtual, type ItemSumarioPdf } from "../lib/sumario";
  import { resolverTema } from "../lib/temas";

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

  let moldura: MolduraLeitor;
  let conteiner: HTMLDivElement;
  let campoBusca = $state<HTMLInputElement>();
  let visor: PDFViewer | undefined;
  let links: PDFLinkService | undefined;
  let tarefa: PDFDocumentLoadingTask | undefined;

  let pagina = $state(1);
  let total = $state(0);
  let zoom = $state(1);
  let resultadoBusca = $state("");
  let erro = $state<string | null>(null);

  // Sumário do PDF, no mesmo formato do índice do EPUB.
  let itensIndice = $state<ItemIndice[]>([]);
  let destinos = new Map<string, string | unknown[]>();
  let paginasDoIndice = $state(new Map<string, number>());
  const hrefAtual = $derived(itemAtual(paginasDoIndice, pagina));

  /** Texto da região aria-live: anuncia a mudança de seção (não cada página). */
  let anuncio = $state("");
  let secaoAnunciada: string | undefined;
  $effect(() => {
    const secao = achatar(itensIndice).find((i) => i.href === hrefAtual)?.label.trim();
    // A primeira seção não é anunciada: o foco no título já informa o documento.
    if (secao && secao !== secaoAnunciada) {
      if (secaoAnunciada !== undefined) anuncio = `Seção: ${secao}`;
      secaoAnunciada = secao;
    }
  });

  /** Estados do PDFFindController (FindState no pdf.js). */
  const BUSCA = { ENCONTRADO: 0, NADA: 1, VOLTOU_AO_INICIO: 2, PENDENTE: 3 };

  onMount(() => {
    moldura.focarTitulo();
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
    const l = new PDFLinkService({ eventBus: eventos });
    const busca = new PDFFindController({ eventBus: eventos, linkService: l });
    const v = new PDFViewer({ container: conteiner, eventBus: eventos, linkService: l, findController: busca });
    l.setViewer(v);
    visor = v;
    links = l;

    eventos.on("pagesinit", () => {
      v.currentScaleValue = "page-width";
      const n = Number(inicio?.match(/^pagina:(\d+)$/)?.[1]);
      if (n >= 1 && n <= v.pagesCount) v.currentPageNumber = n;
      pagina = v.currentPageNumber;
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
    l.setDocument(documento);
    carregarSumario(documento).catch((e) => log.warn(`sumário do PDF indisponível: ${e}`));
  }

  async function carregarSumario(documento: PDFDocumentProxy) {
    const sumario = converterSumario((await documento.getOutline()) as ItemSumarioPdf[] | null);
    destinos = sumario.destinos;
    itensIndice = sumario.itens;
    // Página de cada item, para destacar a seção atual (como no EPUB).
    const paginas = new Map<string, number>();
    for (const [href, destino] of destinos) {
      try {
        const explicito =
          typeof destino === "string" ? await documento.getDestination(destino) : destino;
        const alvo = explicito?.[0];
        const indice =
          typeof alvo === "number"
            ? alvo
            : alvo && typeof alvo === "object"
              ? await documento.getPageIndex(alvo as { num: number; gen: number })
              : undefined;
        if (indice !== undefined) paginas.set(href, indice + 1);
      } catch {
        // Destino quebrado: o item continua navegável pelo pdf.js, só não é destacado.
      }
    }
    paginasDoIndice = paginas;
  }

  async function irParaSecao(href: string) {
    const destino = destinos.get(href);
    if (!links || destino === undefined) return;
    await links.goToDestination(destino);
    // Leva o foco ao documento: o leitor de tela continua a leitura dali.
    conteiner.focus();
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

<MolduraLeitor bind:this={moldura} {titulo} {anuncio} {onFechar}>
  {#snippet acoes()}
    <BuscaPdf resultado={resultadoBusca} onBuscar={buscar} bind:campo={campoBusca} />
  {/snippet}

  {#snippet indice()}
    {#if itensIndice.length}
      <Indice itens={itensIndice} atual={hrefAtual} onNavegar={irParaSecao} />
    {:else}
      <p>Este PDF não tem sumário.</p>
    {/if}
  {/snippet}

  {#snippet aparencia()}
    <PainelTema
      {preferencias}
      onMudar={atualizarPreferencias}
      temaDoSistema={resolverTema("sistema", sistema)}
    />
    <p class="nota">
      Fonte, espaçamentos e colunas valem só para EPUB: o PDF tem layout fixo. Para ler maior,
      use o zoom (Ctrl + ou Ctrl −).
    </p>
  {/snippet}

  {#snippet rodape()}
    <BarraPdf
      {pagina}
      {total}
      {zoom}
      onIrPara={irPara}
      onZoomMenos={() => visor?.decreaseScale()}
      onZoomMais={() => visor?.increaseScale()}
      onAjustarLargura={() => visor && (visor.currentScaleValue = "page-width")}
    />
  {/snippet}

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
</MolduraLeitor>

<style>
  .conteiner {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  .nota {
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
