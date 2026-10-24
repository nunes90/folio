<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import { sistema } from "../lib/ambiente.svelte";
  import Icone from "./Icone.svelte";
  import PainelLateral from "./PainelLateral.svelte";
  import { ATRIBUTO_AREA, ATRIBUTO_TELA } from "../lib/transicao";
  import { preferencias } from "../lib/preferencias.svelte";
  import { animarVirada, cancelarVirada, quadrosDaVirada, type Sentido } from "../lib/virada";
  import { curva, duracao } from "../lib/animacao";

  // Estrutura comum aos leitores de EPUB e PDF: os mesmos botões nos mesmos lugares, os mesmos
  // painéis com as mesmas animações e os mesmos anúncios. Cada formato só preenche as áreas.
  let {
    titulo,
    anuncio = "",
    progresso = 0,
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
    /** Fração lida (0 a 1), mostrada numa barra fina sob o cabeçalho. */
    progresso?: number;
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
  let areaEl: HTMLDivElement;
  let botaoIndice: HTMLButtonElement;
  let botaoAparencia: HTMLButtonElement;

  // Janela estreita: os painéis cobrem o livro (que não muda de tamanho nem é repaginado),
  // um de cada vez, com um véu por trás. O índice começa fechado para o livro aparecer.
  const estreita = $derived(sistema.estreita);
  if (untrack(() => sistema.estreita)) indiceAberto = false;
  $effect.pre(() => {
    if (estreita && untrack(() => indiceAberto && aparenciaAberta)) indiceAberto = false;
  });
  const cobrindo = $derived(estreita && (indiceAberto || aparenciaAberta));

  async function alternar(painel: "indice" | "aparencia") {
    const abrir = painel === "indice" ? !indiceAberto : !aparenciaAberta;
    if (painel === "indice") indiceAberto = abrir;
    else aparenciaAberta = abrir;
    if (!estreita || !abrir) return;
    if (painel === "indice") aparenciaAberta = false;
    else indiceAberto = false;
    // O painel cobre o livro: o foco vai para ele (Esc ou o véu fecham e o devolvem).
    await tick();
    document.getElementById(painel)?.focus();
  }

  /** Fecha o painel que cobre o livro e devolve o foco ao botão que o abriu. */
  function fecharPainel() {
    if (aparenciaAberta) {
      aparenciaAberta = false;
      botaoAparencia.focus();
    } else if (indiceAberto) {
      indiceAberto = false;
      botaoIndice.focus();
    }
  }

  /** Botão de fechar dos painéis: fecha e devolve o foco ao botão da barra. */
  function fecharIndice() {
    indiceAberto = false;
    botaoIndice.focus();
  }

  function fecharAparencia() {
    aparenciaAberta = false;
    botaoAparencia.focus();
  }

  // Os avisos (Avisos.svelte) ficam acima do rodapé enquanto um livro está aberto: a altura
  // real dele vai para --rodape-leitor (em janela estreita, o rodapé quebra em duas linhas).
  let rodapeEl: HTMLElement;
  onMount(() => {
    const raiz = document.documentElement;
    const publicar = () =>
      raiz.style.setProperty("--rodape-leitor", `${rodapeEl.getBoundingClientRect().height}px`);
    publicar();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publicar);
    observador?.observe(rodapeEl);
    return () => {
      observador?.disconnect();
      raiz.style.removeProperty("--rodape-leitor");
    };
  });

  /** Leva o foco ao título: o leitor de tela anuncia qual livro foi aberto. */
  export function focarTitulo() {
    tituloEl.focus();
  }

  /**
   * Navega com a animação de virada escolhida nas preferências: igual para EPUB e PDF.
   * `sentido` é o lado de onde a página nova vem; `navegar` só deve terminar quando a página
   * nova estiver pronta (no PDF, renderizada). Estilo Apple, nada pesado durante o
   * movimento: a área fica invisível enquanto isso (é o primeiro quadro de toda virada) e a
   * animação começa com a thread livre. A virada anterior é cancelada antes: os leitores
   * medem a área do livro e ela não pode estar transformada.
   */
  export async function virarPagina(sentido: Sentido, navegar: () => unknown): Promise<void> {
    cancelarVirada();
    const animar = duracao("curta") > 0 && quadrosDaVirada(preferencias.virada, sentido) !== null;
    if (animar) areaEl.style.opacity = "0";
    try {
      await navegar();
    } finally {
      // Volta ao normal na mesma tarefa em que a animação começa: não há quadro intermediário.
      if (animar) areaEl.style.opacity = "";
    }
    animarVirada(areaEl, preferencias.virada, sentido);
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    // Com um diálogo aberto (ex.: atalhos), o Esc é dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    const foco = document.activeElement;
    // Painel cobrindo o livro (janela estreita): o Esc sempre o fecha.
    if (cobrindo) {
      e.preventDefault();
      fecharPainel();
      return;
    }
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

<div class="moldura" class:estreita {...{ [ATRIBUTO_TELA]: "" }}>
  <header>
    <div class="lado inicio">
      <button
        type="button"
        bind:this={botaoIndice}
        aria-expanded={indiceAberto}
        aria-controls="indice"
        onclick={() => alternar("indice")}
      >
        <Icone nome="indice" /><span class="rotulo">Índice</span>
      </button>
    </div>
    <h1 tabindex="-1" bind:this={tituloEl}>{titulo}</h1>
    <div class="lado fim">
      {@render acoes?.()}
      <button
        type="button"
        bind:this={botaoAparencia}
        aria-expanded={aparenciaAberta}
        aria-controls="aparencia"
        onclick={() => alternar("aparencia")}
      >
        <Icone nome="aparencia" /><span class="rotulo">Aparência</span>
      </button>
      <button type="button" onclick={onFechar}>
        <Icone nome="voltar" /><span class="rotulo">Voltar à biblioteca</span>
      </button>
    </div>
    <!-- Decorativa: a porcentagem lida está no rodapé, como texto. -->
    <div class="progresso-leitura" aria-hidden="true">
      <span style:transform="scaleX({Math.min(1, Math.max(0, progresso))})"></span>
    </div>
  </header>

  <div class="area-indice">
    <PainelLateral
      id="indice"
      rotulo="Índice"
      aberto={indiceAberto}
      lado="inicio"
      elemento="nav"
      onFechar={fecharIndice}
    >
      {@render indice()}
    </PainelLateral>
  </div>

  <!-- Destino (e origem, ao fechar) da capa na transição com a biblioteca (lib/transicao.ts). -->
  <div class="conteudo" bind:this={areaEl} {...{ [ATRIBUTO_AREA]: "" }}>
    {@render children()}
  </div>

  {#if cobrindo}
    <!-- Só para o mouse: no teclado, Esc fecha o painel. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="veu"
      aria-hidden="true"
      onclick={fecharPainel}
      transition:fade={{ duration: duracao("media"), easing: curva }}
    ></div>
  {/if}

  <div class="area-aparencia">
    <PainelLateral
      id="aparencia"
      rotulo="Aparência"
      aberto={aparenciaAberta}
      lado="fim"
      onFechar={fecharAparencia}
    >
      {@render aparencia()}
    </PainelLateral>
  </div>

  <footer bind:this={rodapeEl}>
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
    background: var(--app);
  }

  /* Título centralizado quando cabe: as laterais dividem o resto por igual, mas nunca ficam
     menores que o próprio conteúdo (no PDF, a busca deixa o lado direito mais largo). */
  header {
    grid-area: topo;
    position: relative;
    display: grid;
    grid-template-columns: minmax(min-content, 1fr) minmax(3rem, auto) minmax(min-content, 1fr);
    align-items: center;
    gap: 0.75rem;
    padding: 0.35rem 0.75rem;
    background: var(--painel);
    border-block-end: 1px solid var(--divisoria);
  }

  .lado {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .lado.fim {
    justify-content: flex-end;
  }

  /* Botões das barras: sem borda, fundo só sob o ponteiro (no alto contraste, com borda). */
  header :global(button),
  footer :global(button) {
    flex-shrink: 0;
    justify-content: center;
    white-space: nowrap;
    min-width: 2.25rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.6rem;
    border-color: transparent;
    border-radius: var(--raio);
    background: transparent;
  }

  header :global(button:hover:not(:disabled)),
  footer :global(button:hover:not(:disabled)) {
    background: var(--hover);
  }

  :global([data-tema="alto-contraste"]) :is(header, footer) :global(button) {
    border-color: var(--borda);
  }

  .progresso-leitura {
    position: absolute;
    inset: auto 0 -1px;
    height: 3px;
  }

  .progresso-leitura span {
    display: block;
    height: 100%;
    background: var(--destaque);
    transform-origin: left;
    transition: transform var(--duracao-media) var(--curva);
  }

  h1 {
    min-width: 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
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

  /* Janela estreita: os painéis ficam na mesma célula do livro, por cima dele. */
  .estreita .area-indice,
  .estreita .area-aparencia,
  .veu {
    grid-area: conteudo;
    z-index: 1;
  }

  .estreita .area-indice {
    justify-self: start;
  }

  .estreita .area-aparencia {
    justify-self: end;
  }

  /* O cartão (PainelLateral) já tem fundo, borda e sombra: aqui só a camada. */
  .estreita .area-indice,
  .estreita .area-aparencia {
    z-index: 2;
    max-width: 100%;
  }

  .estreita .area-indice :global(.painel),
  .estreita .area-aparencia :global(.painel) {
    max-width: 100%;
  }

  .veu {
    background: rgb(0 0 0 / 30%);
  }

  .estreita header {
    gap: 0.25rem;
    padding-inline: 0.4rem;
  }

  footer {
    grid-area: rodape;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 1.5rem;
    padding: 0.35rem 0.75rem;
    background: var(--painel);
    border-block-start: 1px solid var(--divisoria);
  }
</style>
