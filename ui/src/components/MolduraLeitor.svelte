<script lang="ts">
  import type { Snippet } from "svelte";
  import PainelLateral from "./PainelLateral.svelte";

  // Estrutura comum aos leitores de EPUB e PDF: os mesmos botões nos mesmos lugares, os mesmos
  // painéis com as mesmas animações e os mesmos anúncios. Cada formato só preenche as áreas.
  let {
    titulo,
    anuncio = "",
    indiceAberto = $bindable(true),
    aparenciaAberta = $bindable(false),
    onFechar,
    acoes,
    indice,
    aparencia,
    rodape,
    children,
  }: {
    titulo: string;
    /** Texto para leitores de tela (região aria-live), ex.: "Seção: Capítulo 3". */
    anuncio?: string;
    indiceAberto?: boolean;
    aparenciaAberta?: boolean;
    onFechar: () => void;
    /** Ações próprias do formato no cabeçalho (ex.: busca do PDF). */
    acoes?: Snippet;
    indice: Snippet;
    aparencia: Snippet;
    rodape: Snippet;
    /** O conteúdo do livro. */
    children: Snippet;
  } = $props();

  let tituloEl: HTMLHeadingElement;
  let botaoIndice: HTMLButtonElement;
  let botaoAparencia: HTMLButtonElement;

  /** Leva o foco ao título: o leitor de tela anuncia qual livro foi aberto. */
  export function focarTitulo() {
    tituloEl.focus();
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    // Com um diálogo aberto (ex.: atalhos), o Esc é dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    const foco = document.activeElement;
    // Fecha o painel em que o foco está; senão, o de aparência (o que costuma cobrir o livro).
    if (indiceAberto && foco?.closest("#indice")) {
      e.preventDefault();
      indiceAberto = false;
      botaoIndice.focus();
    } else if (aparenciaAberta) {
      e.preventDefault();
      const estavaDentro = !!foco?.closest("#aparencia");
      aparenciaAberta = false;
      // O foco estava no painel, que some: devolve ao botão que o abriu.
      if (estavaDentro) botaoAparencia.focus();
    }
  }
</script>

<svelte:window onkeydown={aoTeclar} />

<div class="moldura">
  <header>
    <button
      type="button"
      bind:this={botaoIndice}
      aria-expanded={indiceAberto}
      aria-controls="indice"
      onclick={() => (indiceAberto = !indiceAberto)}
    >
      Índice
    </button>
    <h1 tabindex="-1" bind:this={tituloEl}>{titulo}</h1>
    {@render acoes?.()}
    <button
      type="button"
      bind:this={botaoAparencia}
      aria-expanded={aparenciaAberta}
      aria-controls="aparencia"
      onclick={() => (aparenciaAberta = !aparenciaAberta)}
    >
      Aparência
    </button>
    <button type="button" onclick={onFechar}>Voltar à biblioteca</button>
  </header>

  <div class="area-indice">
    <PainelLateral id="indice" rotulo="Índice" aberto={indiceAberto} lado="inicio" elemento="nav">
      {@render indice()}
    </PainelLateral>
  </div>

  <div class="conteudo">
    {@render children()}
  </div>

  <div class="area-aparencia">
    <PainelLateral id="aparencia" rotulo="Aparência" aberto={aparenciaAberta} lado="fim">
      {@render aparencia()}
    </PainelLateral>
  </div>

  <footer>
    {@render rodape()}
  </footer>

  <p class="so-leitor-de-tela" aria-live="polite">{anuncio}</p>
</div>

<style>
  .moldura {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "topo topo topo"
      "indice conteudo aparencia"
      "rodape rodape rodape";
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

  .area-indice,
  .area-aparencia {
    display: flex;
    min-height: 0;
  }

  .area-indice {
    grid-area: indice;
  }

  .area-aparencia {
    grid-area: aparencia;
  }

  .area-indice :global(.painel) {
    width: 18rem;
  }

  .area-aparencia :global(.painel) {
    width: 20rem;
  }

  /* Itens de grid têm min-width: auto e cresceriam até caber o livro; aí o paginador do
     EPUB mede uma largura maior que a visível. position: relative ancora o visor do PDF. */
  .conteudo {
    grid-area: conteudo;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
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
