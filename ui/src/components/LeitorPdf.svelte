<script lang="ts">
  import { onMount } from "svelte";
  import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
  import type { PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
  import "pdfjs-dist/web/pdf_viewer.css";
  import BarraPdf from "./BarraPdf.svelte";
  import BuscaPdf from "./BuscaPdf.svelte";
  import Indice from "./Indice.svelte";
  import Carregando from "./Carregando.svelte";
  import MolduraLeitor from "./MolduraLeitor.svelte";
  import PainelPdf from "./PainelPdf.svelte";
  import PainelTema from "./PainelTema.svelte";
  import { sistema } from "../lib/ambiente.svelte";
  import type { ItemIndice } from "../lib/foliate";
  import { log } from "../lib/log";
  import { inverterCanvas, PAGINAS_PDF } from "../lib/paginaPdf";
  import { carregarPdf, carregarVisor } from "../lib/pdf";
  import { atualizarPreferencias, preferencias } from "../lib/preferencias.svelte";
  import { achatar, converterSumario, itemAtual, type ItemSumarioPdf } from "../lib/sumario";
  import { resolverTema } from "../lib/temas";
  import { aguardarTransicao } from "../lib/transicao";

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
  /** Modos de rolagem do pdf.js (ScrollMode), disponíveis depois de carregar o visor. */
  let modosDeRolagem: { PAGE: number; VERTICAL: number } | undefined;
  let pronto = $state(false);
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
  // Cor da página escolhida no painel Aparência.
  const paginaPdf = $derived(PAGINAS_PDF[preferencias.paginaPdf]);
  const invertida = $derived(preferencias.paginaPdf === "noite");

  // Entrar ou sair da noite muda os pixels das páginas: o pdf.js as redesenha (as já
  // invertidas voltam ao original, e vice-versa). Creme e sépia são só uma camada por cima.
  let estavaInvertida = false;
  $effect(() => {
    const agora = invertida;
    if (!pronto || !visor || agora === estavaInvertida) return;
    estavaInvertida = agora;
    visor.refresh();
  });

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

  // Página a página (como um livro, zoom "página inteira") ou rolagem contínua (zoom
  // "largura"). Reage na hora quando a preferência muda.
  $effect(() => {
    const paginas = preferencias.modoPdf === "paginas";
    if (!pronto || !visor || !modosDeRolagem) return;
    visor.scrollMode = paginas ? modosDeRolagem.PAGE : modosDeRolagem.VERTICAL;
    visor.currentScaleValue = paginas ? "page-fit" : "page-width";
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
    // Espera a transição da capa terminar: carregar o livro durante ela a faria engasgar.
    await aguardarTransicao();
    const { EventBus, PDFFindController, PDFLinkService, PDFViewer, ScrollMode } =
      await carregarVisor();
    modosDeRolagem = ScrollMode;
    const eventos = new EventBus();
    const l = new PDFLinkService({ eventBus: eventos });
    const busca = new PDFFindController({ eventBus: eventos, linkService: l });
    const v = new PDFViewer({ container: conteiner, eventBus: eventos, linkService: l, findController: busca });
    l.setViewer(v);
    visor = v;
    links = l;

    // Noite: inverte os pixels de cada página assim que o pdf.js a desenha (uma vez por
    // desenho). Registrado antes de qualquer outro "pagerendered": a virada (paginaRenderizada)
    // só começa depois, já com a página invertida. `cssTransform` é só um reescalonamento por
    // CSS, sem desenho novo: os pixels já estão invertidos.
    eventos.on(
      "pagerendered",
      ({ source, cssTransform, error }: { source: { canvas?: HTMLCanvasElement | null }; cssTransform: boolean; error: unknown }) => {
        if (preferencias.paginaPdf === "noite" && !cssTransform && !error && source.canvas) {
          inverterCanvas(source.canvas);
        }
      },
    );
    estavaInvertida = invertida;

    eventos.on("pagesinit", () => {
      pronto = true; // o efeito acima aplica o modo e o zoom
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

  /**
   * Página a página, a navegação passa pela moldura: mesma animação de virada que o EPUB.
   * Na rolagem contínua, o próprio pdf.js rola até a página (virar não faria sentido).
   */
  function irPara(n: number) {
    if (!visor || n < 1 || n > total || n === pagina) return;
    const v = visor;
    if (preferencias.modoPdf === "rolagem") {
      v.currentPageNumber = n;
      return;
    }
    moldura.virarPagina(n > pagina ? "direita" : "esquerda", () => {
      v.currentPageNumber = n;
      return paginaRenderizada(v, n);
    });
  }

  /** Estado "terminada" de uma página no pdf.js (RenderingStates.FINISHED). */
  const RENDERIZADA = 3;
  /** Limite de espera pela renderização: depois disso, anima assim mesmo. */
  const ESPERA_MAXIMA_MS = 400;

  /**
   * Resolve quando o pdf.js terminar de desenhar a página `n` (na hora, se já estiver pronta):
   * a virada só começa depois, para não disputar a thread com a renderização.
   */
  function paginaRenderizada(v: PDFViewer, n: number): Promise<void> {
    if (v.getPageView(n - 1)?.renderingState === RENDERIZADA) return Promise.resolve();
    return new Promise((resolver) => {
      const aoRenderizar = ({ pageNumber }: { pageNumber: number }) => {
        if (pageNumber === n) terminar();
      };
      const limite = setTimeout(() => terminar(), ESPERA_MAXIMA_MS);
      function terminar() {
        clearTimeout(limite);
        v.eventBus.off("pagerendered", aoRenderizar);
        resolver();
      }
      v.eventBus.on("pagerendered", aoRenderizar);
    });
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
    if (e.key === "ArrowLeft") irPara(pagina - 1);
    else if (e.key === "ArrowRight") irPara(pagina + 1);
  }
</script>

<MolduraLeitor
  bind:this={moldura}
  {titulo}
  {anuncio}
  progresso={total ? pagina / total : 0}
  {onFechar}
>
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
    <PainelPdf {preferencias} onMudar={atualizarPreferencias} />
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
  {:else if !pronto}
    <Carregando texto="Abrindo o PDF…" />
  {/if}
  <!-- O PDFViewer exige um contêiner com position: absolute e um filho .pdfViewer.
       Região rolável focável (tabindex) para rolar pelo teclado. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex: o WCAG exige que áreas roláveis
       sejam alcançáveis pelo teclado (regra scrollable-region-focusable do axe). -->
  <div
    class="conteiner"
    class:camada={!!paginaPdf.camada}
    class:invertida
    style:--papel-pdf={paginaPdf.papel}
    bind:this={conteiner}
    tabindex="0"
    role="region"
    aria-label={titulo}
  >
    <div class="pdfViewer"></div>
  </div>
</MolduraLeitor>

<style>
  .conteiner {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: var(--app);
  }

  /* Cor da página (lib/paginaPdf.ts): só efeitos sobre a página já desenhada. */
  .conteiner.camada :global(.page)::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--papel-pdf);
    mix-blend-mode: multiply;
    pointer-events: none;
  }

  /* Noite: os pixels são invertidos ao desenhar (lib/paginaPdf.ts). Antes disso, a página
     já aparece na cor final, sem clarão branco. */
  .conteiner.invertida :global(.page) {
    background-color: var(--papel-pdf);
  }

  .nota {
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
