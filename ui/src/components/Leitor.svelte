<script lang="ts">
  import { onMount } from "svelte";
  import Indice from "./Indice.svelte";
  import {
    criarView,
    textoLocalizado,
    type DetalheRelocate,
    type FoliateView,
    type ItemIndice,
  } from "../lib/foliate";
  import { cssDoLivro, escala } from "../lib/escala.svelte";
  import { log } from "../lib/log";
  import { prefereMenosMovimento } from "../lib/movimento";

  let {
    arquivo,
    inicio,
    onFechar,
    onProgresso,
  }: {
    arquivo: File;
    /** Onde retomar a leitura (EPUB CFI salvo na biblioteca). */
    inicio?: string;
    onFechar: () => void;
    onProgresso?: (localizacao: string, fracao: number) => void;
  } = $props();

  let palco: HTMLDivElement;
  let view: FoliateView | undefined;

  let titulo = $state("");
  let indice = $state<ItemIndice[]>([]);
  let hrefAtual = $state<string>();
  let progresso = $state(0);
  let indiceAberto = $state(true);
  let erro = $state<string | null>(null);
  let pronto = $state(false);

  // Reaplica sempre que a escala do sistema mudar.
  $effect(() => {
    const css = cssDoLivro(escala.fator);
    if (pronto) view?.renderer.setStyles(css);
  });

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

  onMount(() => {
    window.addEventListener("keydown", aoTeclar);
    abrir().catch((e) => {
      erro = `Não foi possível abrir o livro: ${e}`;
      log.error(erro);
    });
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      view?.close();
      view?.remove();
    };
  });

  async function abrir() {
    const v = await criarView();
    v.addEventListener("relocate", (e) => {
      const { fraction, tocItem, cfi } = (e as CustomEvent<DetalheRelocate>).detail;
      progresso = fraction;
      hrefAtual = tocItem?.href;
      if (cfi) onProgresso?.(cfi, fraction);
    });
    // Cada capítulo é um iframe: as teclas pressionadas lá dentro não chegam à janela.
    v.addEventListener("load", (e) => {
      (e as CustomEvent<{ doc: Document }>).detail.doc.addEventListener("keydown", aoTeclar);
    });
    palco.append(v);
    view = v;

    await v.open(arquivo);
    v.renderer.setAttribute("flow", "paginated");
    v.renderer.setAttribute("max-column-count", "2");
    if (!prefereMenosMovimento()) v.renderer.setAttribute("animated", "");
    pronto = true;

    titulo = textoLocalizado(v.book.metadata?.title) || arquivo.name;
    indice = v.book.toc ?? [];
    await v.init({ lastLocation: inicio ?? null, showTextStart: !inicio });
  }

  function aoTeclar(e: KeyboardEvent) {
    if (!view || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // Setas seguem a direção visual (livros RTL invertem); PageUp/PageDown seguem a ordem de leitura.
    const acoes: Record<string, () => Promise<void>> = {
      ArrowLeft: () => view!.goLeft(),
      ArrowRight: () => view!.goRight(),
      PageUp: () => view!.prev(),
      PageDown: () => view!.next(),
    };
    const acao = acoes[e.key];
    if (acao) {
      e.preventDefault();
      acao();
    }
  }
</script>

<div class="leitor">
  <header>
    <button
      type="button"
      aria-expanded={indiceAberto}
      aria-controls="indice"
      onclick={() => (indiceAberto = !indiceAberto)}
    >
      Índice
    </button>
    <h1>{titulo}</h1>
    <button type="button" onclick={onFechar}>Voltar à biblioteca</button>
  </header>

  <nav id="indice" aria-label="Índice" hidden={!indiceAberto}>
    <Indice itens={indice} atual={hrefAtual} onNavegar={(href) => view?.goTo(href)} />
  </nav>

  <div class="palco" bind:this={palco}>
    {#if erro}
      <p role="alert">{erro}</p>
    {/if}
  </div>

  <footer>
    <button type="button" onclick={() => view?.prev()}>Anterior</button>
    <span>{porcento.format(progresso)}</span>
    <button type="button" onclick={() => view?.next()}>Próxima</button>
  </footer>
</div>

<style>
  .leitor {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "topo topo"
      "indice palco"
      "rodape rodape";
    height: 100vh;
  }

  header {
    grid-area: topo;
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

  nav {
    grid-area: indice;
    width: 18rem;
    overflow-y: auto;
    padding: 0.5rem;
    border-inline-end: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }

  nav[hidden] {
    display: none;
  }

  .palco {
    grid-area: palco;
    /* Itens de grid têm min-width: auto e cresceriam até caber as colunas do livro;
       aí o paginador mede uma largura maior que a visível e as páginas saem cortadas. */
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .palco :global(foliate-view) {
    display: block;
    width: 100%;
    height: 100%;
  }

  footer {
    grid-area: rodape;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1.5rem;
    padding: 0.5rem 1rem;
    border-block-start: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }
</style>
