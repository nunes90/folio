<script lang="ts">
  import { urlDaCapa, type Livro } from "../lib/biblioteca";
  import { contarPorFiltro, filtrarLivros, type Filtro } from "../lib/filtro";
  import type { Preferencias } from "../lib/preferencias.svelte";
  import type { TemaEfetivo } from "../lib/temas";
  import { ATRIBUTO_CAPA, ATRIBUTO_TELA } from "../lib/transicao";
  import { fade } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import { tick } from "svelte";
  import { sistema } from "../lib/ambiente.svelte";
  import Estantes from "./Estantes.svelte";
  import Icone from "./Icone.svelte";
  import PainelLateral from "./PainelLateral.svelte";
  import PainelTema from "./PainelTema.svelte";

  let {
    livros,
    importando = false,
    arrastando = false,
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
    /** Arquivos sendo arrastados sobre a janela: mostra onde soltar. */
    arrastando?: boolean;
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

  // Busca e filtros: a grade mostra só `visiveis`; as setas, o Delete e o foco seguem ela.
  let termo = $state("");
  let filtro = $state<Filtro>("todos");
  let campoBusca = $state<HTMLInputElement>();
  const visiveis = $derived(filtrarLivros(livros, termo, filtro));
  const contagens = $derived(contarPorFiltro(livros, termo));
  const filtrando = $derived(termo.trim() !== "" || filtro !== "todos");

  // Estantes: barra lateral; na janela estreita, um painel aberto pelo botão "Estantes"
  // (como os painéis do leitor, M5d).
  const estreita = $derived(sistema.estreita);
  let estantesAbertas = $state(false);
  let botaoEstantes = $state<HTMLButtonElement>();

  async function alternarEstantes() {
    estantesAbertas = !estantesAbertas;
    if (!estantesAbertas) return;
    await tick();
    document.getElementById("estantes")?.focus();
  }

  function fecharEstantes() {
    estantesAbertas = false;
    botaoEstantes?.focus();
  }

  function escolher(estante: Filtro) {
    filtro = estante;
    if (estreita && estantesAbertas) fecharEstantes();
  }
  /** Para o leitor de tela: quantos livros a busca ou o filtro deixaram na grade. */
  const anuncioBusca = $derived(
    !filtrando
      ? ""
      : visiveis.length === 1
        ? "1 livro encontrado"
        : `${visiveis.length} livros encontrados`,
  );

  function limparBusca() {
    termo = "";
    campoBusca?.focus();
  }

  // Ctrl+F leva à busca e Ctrl+O importa (na biblioteca; nos leitores, o Ctrl+F é deles).
  function aoTeclarJanela(e: KeyboardEvent) {
    if (e.key === "Escape" && estantesAbertas && !e.defaultPrevented) {
      e.preventDefault();
      fecharEstantes();
      return;
    }
    if (!e.ctrlKey || e.altKey) return;
    const tecla = e.key.toLowerCase();
    if (tecla === "f" && campoBusca) {
      e.preventDefault();
      campoBusca.focus();
      campoBusca.select();
    } else if (tecla === "o") {
      e.preventDefault();
      if (!importando) onImportar();
    }
  }

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
    if (e.key === "Delete" && onRemover && visiveis[ativo]) {
      e.preventDefault();
      onRemover(visiveis[ativo]);
      return;
    }
    const destinos: Record<string, () => number> = {
      ArrowRight: () => ativo + 1,
      ArrowLeft: () => ativo - 1,
      ArrowDown: () => ativo + porLinha(),
      ArrowUp: () => ativo - porLinha(),
      Home: () => 0,
      End: () => visiveis.length - 1,
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
    const indice = visiveis.findIndex((l) => l.id === focarLivro);
    const atual = document.activeElement;
    const focoPerdido = !atual || atual === document.body || lista.contains(atual);
    if (indice >= 0 && focoPerdido) focar(indice);
  });

  // Se a lista encolher, o índice ativo continua válido.
  $effect(() => {
    if (ativo >= visiveis.length) ativo = Math.max(0, visiveis.length - 1);
  });

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

  function situacao(livro: Livro): string {
    // A regra (inclusive "o que arredonda para 100% está concluído") fica no core.
    if (livro.situacao === "nao-iniciado" || livro.fracao == null) return "Não iniciado";
    if (livro.situacao === "concluido") return "Lido";
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
  <button
    type="button"
    class="primario"
    onclick={onImportar}
    disabled={importando}
    aria-keyshortcuts="Control+O"
  >
    <Icone nome="mais" /><span class="rotulo">{importando ? "Importando…" : "Importar livros…"}</span>
  </button>
{/snippet}

<svelte:window onkeydown={aoTeclarJanela} />

<main {...{ [ATRIBUTO_TELA]: "" }}>
  {#if arrastando}
    <!-- Só para quem arrasta com o mouse; o teclado usa "Importar livros…". -->
    <div class="soltar" aria-hidden="true" transition:fade={{ duration: duracao("curta"), easing: curva }}>
      <span class="icone-soltar"><Icone nome="mais" /></span>
      <p>Solte para importar</p>
      <p class="formatos">EPUB ou PDF; o arquivo original fica onde está.</p>
    </div>
  {/if}

  {#if livros.length && !estreita}
    <nav class="barra" aria-label="Estantes">
      <Estantes atual={filtro} {contagens} onEscolher={escolher} />
    </nav>
  {/if}

  {#if livros.length && estreita}
    {#if estantesAbertas}
      <!-- Só para o mouse: no teclado, Esc fecha o painel. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="veu"
        aria-hidden="true"
        onclick={fecharEstantes}
        transition:fade={{ duration: duracao("media"), easing: curva }}
      ></div>
    {/if}
    <div class="gaveta">
      <PainelLateral
        id="estantes"
        rotulo="Estantes"
        aberto={estantesAbertas}
        lado="inicio"
        elemento="nav"
        onFechar={fecharEstantes}
      >
        <Estantes atual={filtro} {contagens} onEscolher={escolher} />
      </PainelLateral>
    </div>
  {/if}

  <div class="principal">
    <header>
      {#if livros.length && estreita}
        <button
          type="button"
          class="secundario"
          bind:this={botaoEstantes}
          aria-expanded={estantesAbertas}
          aria-controls="estantes"
          onclick={alternarEstantes}
        >
          <Icone nome="grade" /><span class="rotulo">Estantes</span>
        </button>
      {/if}
      <h1>Biblioteca</h1>
      {#if livros.length}
        <search class="busca">
          <Icone nome="buscar" />
          <input
            type="search"
            bind:this={campoBusca}
            bind:value={termo}
            aria-label="Buscar na biblioteca"
            aria-keyshortcuts="Control+F"
            placeholder="Título ou autor"
          />
        </search>
      {/if}
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
        <!-- (Ctrl+O importa de qualquer lugar da biblioteca.) -->
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

    {#if livros.length === 0}
      <section class="vazia" aria-labelledby="titulo-vazia">
        <span class="icone-vazia"><Icone nome="livro" /></span>
        <h2 id="titulo-vazia">Sua biblioteca está vazia</h2>
        <p>Importe um EPUB ou PDF para começar. O arquivo original fica onde está: a biblioteca guarda uma cópia.</p>
        {@render botaoImportar()}
      </section>
    {:else}
      <p class="so-leitor-de-tela" role="status">{anuncioBusca}</p>

      {#if visiveis.length === 0}
        <div class="sem-resultado">
          {#if termo.trim()}
            <p>Nenhum livro encontrado para “{termo.trim()}”.</p>
            <button type="button" onclick={limparBusca}>Limpar busca</button>
          {:else}
            <p>Nenhum livro nesta lista ainda.</p>
            <button type="button" onclick={() => (filtro = "todos")}>Mostrar todos</button>
          {/if}
        </div>
      {/if}

      <!-- As setas são tratadas no <ul> (delegação): o evento sobe do botão focado. -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <ul bind:this={lista} onkeydown={aoTeclar} aria-label="Livros" hidden={!visiveis.length}>
        {#each visiveis as livro, i (livro.id)}
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
  </div>
</main>

<style>
  /* Barra lateral (estantes) + área principal. Na janela estreita, só a área principal. */
  main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 100vh;
    background: var(--app);
  }

  .principal {
    grid-column: 2;
    min-width: 0;
    padding: 1rem 1.5rem;
  }

  .barra {
    grid-column: 1;
    position: sticky;
    top: 0;
    align-self: start;
    width: 14rem;
    height: 100vh;
    overflow-y: auto;
    padding: 4.25rem 0.75rem 1rem;
    border-inline-end: 1px solid var(--divisoria);
    background: var(--painel);
  }

  /* Janela estreita: as estantes num painel por cima, com véu (padrão do M5d). */
  .gaveta {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 4;
    display: flex;
    max-width: 100%;
  }

  .gaveta :global(.painel) {
    width: 16rem;
    max-width: 100vw;
    box-shadow: var(--sombra);
  }

  .veu {
    position: fixed;
    inset: 0;
    z-index: 3;
    background: rgb(0 0 0 / 30%);
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

  /* Por cima de toda a biblioteca, sem capturar o arraste (quem recebe é a janela). */
  .soltar {
    position: fixed;
    inset: 0.75rem;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border: 2px dashed var(--destaque);
    border-radius: var(--raio-grande);
    background: color-mix(in srgb, var(--destaque-suave) 92%, transparent);
    color: var(--destaque);
    pointer-events: none;
  }

  .soltar p {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .soltar .formatos {
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--texto);
  }

  .icone-soltar {
    font-size: 2.5rem;
  }

  header {
    flex-wrap: wrap;
  }

  /* Busca: ocupa o espaço entre o título e as ações, encolhe em janelas estreitas. */
  .busca {
    flex: 1 1 14rem;
    max-width: 24rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding-inline: 0.6rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    background: var(--card);
    color: var(--suave);
  }

  .busca:focus-within {
    outline: 3px solid var(--foco);
    outline-offset: 2px;
  }

  .busca input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--texto);
  }

  /* O contorno de foco fica na caixa inteira (acima), não só no campo. */
  .busca input:focus-visible {
    outline: none;
  }

  .busca input::placeholder {
    color: var(--suave);
    opacity: 1;
  }

  .sem-resultado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin-block-start: 3rem;
    text-align: center;
  }

  .sem-resultado p {
    margin: 0;
    color: var(--suave);
  }

  ul[hidden] {
    display: none;
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
