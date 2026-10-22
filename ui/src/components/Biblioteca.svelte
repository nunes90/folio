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

<main {...{ [ATRIBUTO_TELA]: "" }}>
  <header>
    <h1>Biblioteca</h1>
    <div class="acoes">
      {#if preferencias}
        <button
          type="button"
          aria-expanded={aparenciaAberta}
          aria-controls="aparencia-biblioteca"
          onclick={() => (aparenciaAberta = !aparenciaAberta)}
        >
          Aparência
        </button>
      {/if}
      <button type="button" onclick={onImportar} disabled={importando}>
        {importando ? "Importando…" : "Importar livros…"}
      </button>
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
    <p class="vazia">Sua biblioteca está vazia. Importe um EPUB ou PDF para começar.</p>
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
            <span class="titulo">{livro.titulo}</span>
            {#if livro.autores.length}
              <span class="autores">{livro.autores.join(", ")}</span>
            {/if}
            <span class="situacao">{situacao(livro)}</span>
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
    padding: 1rem 1.5rem;
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

  section {
    max-width: 24rem;
    margin-block-start: 1rem;
  }

  section[hidden] {
    display: none;
  }

  /* Sem aviso, não ocupa espaço (o <span> existe sempre por causa da animação). */
  .aviso:has(> span:empty) {
    margin: 0;
  }

  .vazia {
    margin-top: 3rem;
    text-align: center;
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
    border-radius: 0.5rem;
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
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  img,
  .capa-substituta {
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: 0.25rem;
    object-fit: cover;
    box-shadow: 0 0.1rem 0.4rem rgb(0 0 0 / 30%);
  }

  .capa-substituta {
    display: grid;
    place-items: center;
    font-size: 2rem;
    font-weight: 600;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .titulo {
    font-weight: 600;
  }

  .autores,
  .situacao {
    font-size: 0.875rem;
    opacity: 0.8;
  }
</style>
