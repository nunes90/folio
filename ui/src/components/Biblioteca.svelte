<script lang="ts">
  import { urlDaCapa, type Livro } from "../lib/biblioteca";
  import type { Preferencias } from "../lib/preferencias.svelte";
  import type { TemaEfetivo } from "../lib/temas";
  import { fade } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import { ATRIBUTO_CAPA, ATRIBUTO_TELA } from "../lib/transicao";
  import Icone from "./Icone.svelte";
  import PainelTema from "./PainelTema.svelte";

  let {
    livros,
    importando = false,
    aviso = null,
    onAbrir,
    onImportar,
    onRemover,
    preferencias,
    onMudarPreferencias,
    temaDoSistema,
    focarLivro,
  }: {
    livros: Livro[];
    importando?: boolean;
    /** Resultado da última importação ou erro, anunciado por leitores de tela. */
    aviso?: string | null;
    onAbrir: (livro: Livro) => void;
    onImportar: () => void;
    /** Pedido de remoção (quem chama confirma antes de remover). */
    onRemover?: (livro: Livro) => void;
    /** Se presentes, a biblioteca oferece o painel de tema e movimento. */
    preferencias?: Preferencias;
    onMudarPreferencias?: (mudancas: Partial<Preferencias>) => void;
    temaDoSistema?: TemaEfetivo;
    /** Id do livro que recebe o foco ao mostrar a biblioteca (o que acabou de ser fechado). */
    focarLivro?: string;
  } = $props();

  let aparenciaAberta = $state(false);

  // Roving tabindex: a grade é uma só parada de Tab; as setas movem entre os livros.
  let ativo = $state(0);
  let lista = $state<HTMLUListElement>();

  function botoes(): HTMLButtonElement[] {
    return lista
      ? [...lista.querySelectorAll<HTMLButtonElement>(":scope > li > button.livro")]
      : [];
  }

  function focar(indice: number) {
    const todos = botoes();
    if (!todos.length) return;
    ativo = Math.max(0, Math.min(indice, todos.length - 1));
    todos[ativo]!.focus();
  }

  /** Livros por linha, medidos no layout (a grade se adapta à largura da janela). */
  function porLinha(): number {
    const todos = botoes();
    const topo = todos[0]?.offsetTop;
    const n = todos.filter((b) => b.offsetTop === topo).length;
    return Math.max(1, n);
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "Delete" && onRemover && livros[ativo]) {
      e.preventDefault();
      onRemover(livros[ativo]);
      return;
    }
    const destinos: Record<string, () => number> = {
      ArrowRight: () => ativo + 1,
      ArrowLeft: () => ativo - 1,
      ArrowDown: () => ativo + porLinha(),
      ArrowUp: () => ativo - porLinha(),
      Home: () => 0,
      End: () => livros.length - 1,
    };
    const destino = destinos[e.key];
    if (!destino) return;
    e.preventDefault();
    focar(destino());
  }

  // Ao voltar de um livro (ou remover um), o foco vai para o livro indicado. Só se o foco
  // estiver perdido (no body, ex.: o elemento focado sumiu) ou já na lista: a lista muda
  // sozinha (ex.: capas de PDF geradas) e não deve puxar o foco de outro controle.
  $effect(() => {
    if (!focarLivro || !lista) return;
    const indice = livros.findIndex((l) => l.id === focarLivro);
    const atual = document.activeElement;
    const focoPerdido = !atual || atual === document.body || lista.contains(atual);
    if (indice >= 0 && focoPerdido) focar(indice);
  });

  // Se a lista encolher, o índice ativo continua válido.
  $effect(() => {
    if (ativo >= livros.length) ativo = Math.max(0, livros.length - 1);
  });

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

  function situacao(livro: Livro): string {
    if (livro.fracao == null) return "Não iniciado";
    // A última página de um EPUB raramente dá 1 exato: o que arredonda para 100% está concluído.
    if (Math.round(livro.fracao * 100) >= 100) return "Concluído";
    // Sem isso, um livro recém-aberto apareceria como "0% lido", igual a não iniciado.
    if (livro.fracao > 0 && livro.fracao < 0.01) return "menos de 1% lido";
    return `${porcento.format(livro.fracao)} lido`;
  }

  /** Iniciais para a capa substituta (livros sem capa). */
  function iniciais(titulo: string): string {
    return titulo
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("");
  }
</script>

{#snippet botaoImportar()}
  <button type="button" class="primario" onclick={onImportar} disabled={importando}>
    <Icone nome="mais" /><span class="rotulo">{importando ? "Importando…" : "Importar livros…"}</span>
  </button>
{/snippet}

<main {...{ [ATRIBUTO_TELA]: "" }}>
  <header>
    <h1>Biblioteca</h1>
    <div class="acoes">
      {#if preferencias}
        <button
          type="button"
          class="secundario"
          aria-expanded={aparenciaAberta}
          aria-controls="aparencia-biblioteca"
          onclick={() => (aparenciaAberta = !aparenciaAberta)}
        >
          <Icone nome="aparencia" /><span class="rotulo">Aparência</span>
        </button>
      {/if}
      <!-- Biblioteca vazia: o botão de importar fica só no centro, junto da explicação. -->
      {#if livros.length}
        {@render botaoImportar()}
      {/if}
    </div>
  </header>

  {#if preferencias && onMudarPreferencias}
    <section id="aparencia-biblioteca" aria-label="Aparência" hidden={!aparenciaAberta}>
      <PainelTema {preferencias} onMudar={onMudarPreferencias} {temaDoSistema} />
    </section>
  {/if}

  <!-- Sempre no DOM: regiões aria-live só anunciam mudanças em elementos que já existiam. -->
  <p class="aviso" role="status">
    {#key aviso}
      <span in:fade={{ duration: duracao("curta"), easing: curva }}>{aviso ?? ""}</span>
    {/key}
  </p>

  {#if livros.length === 0}
    <section class="vazia" aria-labelledby="titulo-vazia">
      <span class="icone-vazia"><Icone nome="livro" /></span>
      <h2 id="titulo-vazia">Sua biblioteca está vazia</h2>
      <p>Importe um EPUB ou PDF para começar. O arquivo original fica onde está: a biblioteca guarda uma cópia.</p>
      {@render botaoImportar()}
    </section>
  {:else}
    <!-- As setas são tratadas no <ul> (delegação): o evento sobe do botão focado. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <ul bind:this={lista} onkeydown={aoTeclar} aria-label="Livros">
      {#each livros as livro, i (livro.id)}
        {@const capa = urlDaCapa(livro)}
        <li>
          <button
            type="button"
            class="livro"
            tabindex={i === ativo ? 0 : -1}
            aria-keyshortcuts={onRemover ? "Delete" : undefined}
            onfocus={() => (ativo = i)}
            onclick={() => onAbrir(livro)}
          >
            <span class="capa">
              {#if capa}
                <!-- alt vazio: o título logo abaixo já identifica o livro. -->
                <img
                  src={capa}
                  alt=""
                  loading="lazy"
                  {...{ [ATRIBUTO_CAPA]: livro.id }}
                />
              {:else}
                <span
                  class="capa-substituta"
                  aria-hidden="true"
                  {...{ [ATRIBUTO_CAPA]: livro.id }}
                  >{iniciais(livro.titulo)}</span
                >
              {/if}
              {#if livro.fracao}
                <!-- Decorativa: a situação ("37% lido") está escrita logo abaixo. -->
                <span class="progresso-capa" aria-hidden="true">
                  <span style:transform="scaleX({Math.min(1, livro.fracao)})"></span>
                </span>
              {/if}
            </span>
            <span class="titulo">{livro.titulo}</span>
            {#if livro.autores.length}
              <span class="autores">{livro.autores.join(", ")}</span>
            {/if}
            <span class="meta">
              <span class="selo">{livro.formato.toUpperCase()}</span>
              <span class="situacao">{situacao(livro)}</span>
            </span>
          </button>
          {#if onRemover}
            <!-- Fora da ordem do Tab (o teclado usa Delete no livro focado); para o mouse. -->
            <button
              type="button"
              class="remover"
              tabindex="-1"
              aria-label="Remover {livro.titulo}"
              title="Remover da biblioteca"
              onclick={() => onRemover(livro)}><Icone nome="fechar" /></button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    padding: 1rem 1.5rem;
    background: var(--app);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .acoes {
    display: flex;
    gap: 0.5rem;
  }

  .acoes button,
  .vazia button {
    min-height: 2.25rem;
    border-radius: var(--raio);
  }

  .secundario {
    border-color: transparent;
    background: transparent;
  }

  .secundario:hover {
    background: var(--hover);
  }

  /* Ação principal da tela, na cor de destaque (contraste testado em temas.ts). */
  .primario {
    border-color: var(--destaque);
    background: var(--destaque);
    color: var(--sobre-destaque);
    font-weight: 600;
  }

  #aparencia-biblioteca {
    max-width: 24rem;
    margin-block-start: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--painel);
    box-shadow: var(--sombra);
  }

  #aparencia-biblioteca[hidden] {
    display: none;
  }

  /* Sem aviso, não ocupa espaço (o <span> existe sempre por causa da animação). */
  .aviso:has(> span:empty) {
    margin: 0;
  }

  .vazia {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    max-width: 26rem;
    margin: 4rem auto 0;
    text-align: center;
  }

  .vazia h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .vazia p {
    margin: 0 0 0.5rem;
    color: var(--suave);
  }

  .icone-vazia {
    font-size: 2.5rem;
    color: var(--suave);
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: 1.5rem;
    margin: 1rem 0 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
  }

  .remover {
    position: absolute;
    inset-block-start: 1rem;
    inset-inline-end: 1rem;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 1rem;
    opacity: 0.75;
    transition: opacity var(--duracao-curta) var(--curva);
  }

  .remover:hover,
  li:hover .remover {
    opacity: 1;
  }

  li button.livro {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    padding: 0.5rem;
    border: 0;
    border-radius: var(--raio-grande);
    background: none;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* A capa se eleva um pouco ao passar o mouse ou focar: indica o que será aberto. */
  img,
  .capa-substituta {
    transition: transform var(--duracao-curta) var(--curva);
  }

  li button.livro:hover img,
  li button.livro:hover .capa-substituta,
  li button.livro:focus-visible img,
  li button.livro:focus-visible .capa-substituta {
    transform: translateY(-0.25rem);
  }

  li button.livro:hover {
    background: var(--hover);
  }

  /* A barra de progresso fica presa à capa e sobe com ela no hover. */
  .capa {
    position: relative;
    display: block;
    margin-block-end: 0.35rem;
  }

  img,
  .capa-substituta {
    display: block;
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: var(--raio-pequeno);
    object-fit: cover;
    box-shadow: var(--sombra);
  }

  :global([data-tema="alto-contraste"]) :is(img, .capa-substituta) {
    outline: 1px solid var(--borda);
  }

  .capa-substituta {
    display: grid;
    place-items: center;
    font-size: 2rem;
    font-weight: 600;
    background: var(--card);
  }

  .progresso-capa {
    position: absolute;
    inset: auto 0 0;
    height: 0.25rem;
    overflow: hidden;
    border-radius: 0 0 var(--raio-pequeno) var(--raio-pequeno);
    background: rgb(0 0 0 / 25%);
    transition: transform var(--duracao-curta) var(--curva);
  }

  /* Na cor de destaque: aparece tanto sobre capas escuras quanto sobre as substitutas claras. */
  .progresso-capa span {
    display: block;
    height: 100%;
    background: var(--destaque);
    transform-origin: left;
  }

  li button.livro:hover .progresso-capa,
  li button.livro:focus-visible .progresso-capa {
    transform: translateY(-0.25rem);
  }

  .titulo {
    font-weight: 600;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .autores {
    font-size: 0.875rem;
    color: var(--suave);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--suave);
  }

  .selo {
    padding: 0 0.3rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio-pequeno);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
</style>
