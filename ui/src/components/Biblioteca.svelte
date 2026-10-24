<script lang="ts">
  import { urlDaCapa, type Colecao, type Livro } from "../lib/biblioteca";
  import {
    contarPorColecao,
    contarPorFiltro,
    filtrarLivros,
    chaveDoAutor,
    idDaColecao,
    type Filtro,
  } from "../lib/filtro";
  import { agruparPorAutor } from "../lib/autores";
  import ListaAutores from "./ListaAutores.svelte";
  import type { Preferencias } from "../lib/preferencias.svelte";
  import type { TemaEfetivo } from "../lib/temas";
  import { ATRIBUTO_CAPA, ATRIBUTO_TELA } from "../lib/transicao";
  import { fade } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import { tick } from "svelte";
  import { sistema } from "../lib/ambiente.svelte";
  import Estantes from "./Estantes.svelte";
  import Icone from "./Icone.svelte";
  import MenuLivro, { type AcaoLivro } from "./MenuLivro.svelte";
  import PainelLateral from "./PainelLateral.svelte";
  import PainelTema from "./PainelTema.svelte";

  let {
    livros,
    importando = false,
    arrastando = false,
    onAbrir,
    onImportar,
    lixeira = [],
    colecoes = [],
    onNovaColecao,
    onRenomearColecao,
    onApagarColecao,
    onTirarDaColecao,
    onAcao,
    onEsvaziar,
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
    /** Livros na lixeira (aparecem só na estante "Lixeira"). */
    lixeira?: Livro[];
    /** Ação pedida pelo menu ou pelo teclado (quem chama confirma o que for irreversível). */
    onAcao?: (livro: Livro, acao: AcaoLivro) => void;
    onEsvaziar?: () => void;
    colecoes?: Colecao[];
    onNovaColecao?: () => void;
    onRenomearColecao?: (colecao: Colecao) => void;
    onApagarColecao?: (colecao: Colecao) => void;
    onTirarDaColecao?: (livro: Livro, colecao: number) => void;
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
  // A estante e a lixeira numa lista só: cada estante filtra a parte dela (lib/filtro.ts).
  const todos = $derived([...livros, ...lixeira]);
  const temLivros = $derived(todos.length > 0);
  const visiveis = $derived(filtrarLivros(todos, termo, filtro));
  const contagens = $derived(contarPorFiltro(todos, termo));
  const naLixeira = $derived(filtro === "lixeira");
  const contagensColecoes = $derived(
    contarPorColecao(
      todos,
      termo,
      colecoes.map((c) => c.id),
    ),
  );
  // Coleção aberta (se o filtro for de coleção).
  // Autores: a lista (com a busca) e o autor aberto, pela chave do filtro.
  const autores = $derived(agruparPorAutor(todos, termo));
  const naListaDeAutores = $derived(filtro === "autores");
  const autorAtual = $derived.by(() => {
    const chave = chaveDoAutor(filtro);
    return chave === null ? null : (agruparPorAutor(todos).find((a) => a.chave === chave) ?? null);
  });
  /** Autor de onde se voltou para a lista: recebe o foco nela. */
  let voltandoDe = $state<string | null>(null);
  let tituloAutor = $state<HTMLHeadingElement>();

  async function abrirAutor(chave: string) {
    voltandoDe = null;
    filtro = `autor:${chave}`;
    await tick();
    tituloAutor?.focus();
  }

  function voltarParaAutores() {
    voltandoDe = chaveDoAutor(filtro);
    filtro = "autores";
  }

  // O autor aberto sumiu (ex.: os livros dele foram para a lixeira): volta para a lista.
  $effect(() => {
    if (chaveDoAutor(filtro) !== null && !autorAtual) filtro = "autores";
  });

  const colecaoAtual = $derived.by(() => {
    const id = idDaColecao(filtro);
    return id === null ? null : (colecoes.find((c) => c.id === id) ?? null);
  });
  // A coleção aberta foi apagada (aqui ou em outro lugar): volta para Todos.
  $effect(() => {
    if (idDaColecao(filtro) !== null && !colecaoAtual) filtro = "todos";
  });

  // Menu "Mais ações": de qual livro está aberto (um por vez).
  let menuDe = $state<string | null>(null);

  /** Fecha o menu e devolve o foco ao livro dele (se ainda estiver na grade). */
  function fecharMenu() {
    const id = menuDe;
    menuDe = null;
    const i = visiveis.findIndex((l) => l.id === id);
    if (i >= 0) focar(i);
  }

  // Clique fora do menu o fecha, sem mexer no foco.
  function aoApontar(e: PointerEvent) {
    if (menuDe && !(e.target instanceof Element && e.target.closest(".menu-livro"))) menuDe = null;
  }
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
    !filtrando || (naListaDeAutores && !termo.trim())
      ? ""
      : naListaDeAutores
        ? autores.length === 1
          ? "1 autor encontrado"
          : `${autores.length} autores encontrados`
        : visiveis.length === 1
          ? "1 livro encontrado"
          : `${visiveis.length} livros encontrados`,
  );

  function limparBusca() {
    termo = "";
    campoBusca?.focus();
  }

  /** Leva à busca (Ctrl+F e a paleta de comandos). */
  export function buscar() {
    campoBusca?.focus();
    campoBusca?.select();
  }

  /** Mostra uma estante, a lista de autores ou uma coleção (paleta de comandos); foco no 1º livro. */
  export async function mostrar(destino: Filtro) {
    termo = "";
    voltandoDe = null;
    filtro = destino;
    await tick();
    focar(0);
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
      buscar();
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
    const livro = visiveis[ativo];
    // Delete: na estante, vai para a lixeira (reversível); na lixeira, apagar de vez (confirma).
    if (e.key === "Delete" && onAcao && livro) {
      e.preventDefault();
      onAcao(livro, naLixeira ? "apagar" : "lixeira");
      return;
    }
    // Tecla Menu ou Shift+F10: o menu de ações do livro focado (como o clique direito).
    if (onAcao && livro && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
      e.preventDefault();
      menuDe = livro.id;
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

<svelte:window onkeydown={aoTeclarJanela} onpointerdown={aoApontar} />

<main {...{ [ATRIBUTO_TELA]: "" }}>
  {#if arrastando}
    <!-- Só para quem arrasta com o mouse; o teclado usa "Importar livros…". -->
    <div class="soltar" aria-hidden="true" transition:fade={{ duration: duracao("curta"), easing: curva }}>
      <span class="icone-soltar"><Icone nome="mais" /></span>
      <p>Solte para importar</p>
      <p class="formatos">EPUB ou PDF; o arquivo original fica onde está.</p>
    </div>
  {/if}

  {#if temLivros && !estreita}
    <nav class="barra" aria-label="Estantes">
      <Estantes
        atual={filtro}
        {contagens}
        {colecoes}
        {contagensColecoes}
        quantidadeAutores={autores.length}
        onEscolher={escolher}
        {onNovaColecao}
      />
    </nav>
  {/if}

  {#if temLivros && estreita}
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
        <Estantes
        atual={filtro}
        {contagens}
        {colecoes}
        {contagensColecoes}
        quantidadeAutores={autores.length}
        onEscolher={escolher}
        {onNovaColecao}
      />
      </PainelLateral>
    </div>
  {/if}

  <div class="principal">
    <header>
      {#if temLivros && estreita}
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
      {#if temLivros}
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
        {#if temLivros}
          {@render botaoImportar()}
        {/if}
      </div>
    </header>

    {#if preferencias && onMudarPreferencias}
      <section id="aparencia-biblioteca" aria-label="Aparência" hidden={!aparenciaAberta}>
        <PainelTema {preferencias} onMudar={onMudarPreferencias} {temaDoSistema} />
      </section>
    {/if}

    {#if !temLivros}
      <section class="vazia" aria-labelledby="titulo-vazia">
        <span class="icone-vazia"><Icone nome="livro" /></span>
        <h2 id="titulo-vazia">Sua biblioteca está vazia</h2>
        <p>Importe um EPUB ou PDF para começar. O arquivo original fica onde está: a biblioteca guarda uma cópia.</p>
        {@render botaoImportar()}
      </section>
    {:else}
      <p class="so-leitor-de-tela" role="status">{anuncioBusca}</p>

      {#if naListaDeAutores}
        <div class="cabeca-colecao"><h2>Autores</h2></div>
        {#if autores.length}
          <ListaAutores {autores} focar={voltandoDe} onEscolher={abrirAutor} />
        {:else}
          <div class="sem-resultado">
            <p>Nenhum autor encontrado para “{termo.trim()}”.</p>
            <button type="button" onclick={limparBusca}>Limpar busca</button>
          </div>
        {/if}
      {/if}

      {#if autorAtual}
        <div class="cabeca-colecao">
          <button type="button" class="voltar" aria-label="Voltar para Autores" onclick={voltarParaAutores}>
            <Icone nome="anterior" /><span>Autores</span>
          </button>
          <h2 tabindex="-1" bind:this={tituloAutor}>{autorAtual.nome}</h2>
        </div>
      {/if}

      {#if colecaoAtual}
        <div class="cabeca-colecao">
          <h2>{colecaoAtual.nome}</h2>
          {#if onRenomearColecao}
            <button type="button" onclick={() => onRenomearColecao(colecaoAtual)}>Renomear…</button>
          {/if}
          {#if onApagarColecao}
            <button type="button" onclick={() => onApagarColecao(colecaoAtual)}>Apagar coleção…</button>
          {/if}
        </div>
      {/if}

      {#if naLixeira && visiveis.length && onEsvaziar}
        <div class="aviso-lixeira">
          <p>Os livros ficam na lixeira até você esvaziá-la. Para trazer um de volta, use Restaurar.</p>
          <button type="button" onclick={onEsvaziar}>Esvaziar lixeira…</button>
        </div>
      {/if}

      {#if visiveis.length === 0 && !naListaDeAutores}
        <div class="sem-resultado">
          {#if termo.trim()}
            <p>Nenhum livro encontrado para “{termo.trim()}”.</p>
            <button type="button" onclick={limparBusca}>Limpar busca</button>
          {:else if colecaoAtual}
            <p>Nenhum livro nesta coleção ainda. Use “Adicionar à coleção…” no menu de um livro.</p>
            <button type="button" onclick={() => (filtro = "todos")}>Mostrar todos</button>
          {:else if naLixeira}
            <p>A lixeira está vazia.</p>
            <button type="button" onclick={() => (filtro = "todos")}>Mostrar todos</button>
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
              aria-keyshortcuts={onAcao ? "Delete Shift+F10" : undefined}
              onfocus={() => (ativo = i)}
              onclick={() => (naLixeira && onAcao ? (menuDe = livro.id) : onAbrir(livro))}
              oncontextmenu={(e) => {
                if (!onAcao) return;
                e.preventDefault();
                menuDe = livro.id;
              }}
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
            {#if onAcao}
              <!-- Ícones para o mouse (fora do Tab); no teclado, as mesmas ações estão no menu. -->
              <div class="acoes-card">
                {#if !naLixeira}
                  {@const lidoPeloProgresso = livro.situacao === "concluido" && livro.lidoEm === null}
                  {#each [
                    { acao: "favorito" as const, nome: "Favorito", icone: "estrela" as const, ativo: livro.favoritoEm !== null },
                    { acao: "para-ler" as const, nome: "Para ler", icone: "marcador" as const, ativo: livro.paraLerEm !== null },
                    { acao: "lido" as const, nome: "Lido", icone: "lido" as const, ativo: livro.situacao === "concluido" },
                  ] as marca (marca.acao)}
                    {@const travado = marca.acao === "lido" && lidoPeloProgresso}
                    <button
                      type="button"
                      class="marca"
                      tabindex="-1"
                      aria-label={marca.nome}
                      aria-pressed={marca.ativo}
                      aria-disabled={travado || undefined}
                      title={travado ? "Lido (pelo progresso)" : marca.nome}
                      onclick={() => !travado && onAcao(livro, marca.acao)}
                    >
                      <Icone nome={marca.icone} preenchido={marca.ativo && marca.acao !== "lido"} />
                    </button>
                  {/each}
                  {@const emColecoes = livro.colecoes.length}
                  <!-- Abre o diálogo de coleções (não liga/desliga): destacado se o livro está em alguma. -->
                  <button
                    type="button"
                    class="marca"
                    class:marcada={emColecoes > 0}
                    tabindex="-1"
                    aria-label="Coleções"
                    aria-haspopup="dialog"
                    title={emColecoes ? `Coleções (${emColecoes})` : "Coleções"}
                    onclick={() => onAcao(livro, "colecoes")}
                  >
                    <Icone nome="pasta" preenchido={emColecoes > 0} />
                  </button>
                {/if}
                <MenuLivro
                  {livro}
                  aberto={menuDe === livro.id}
                  onAlternar={() => (menuDe = menuDe === livro.id ? null : livro.id)}
                  onFechar={fecharMenu}
                  naColecao={colecaoAtual !== null}
                  onAcao={(acao) =>
                    acao === "tirar-da-colecao"
                      ? colecaoAtual && onTirarDaColecao?.(livro, colecaoAtual.id)
                      : onAcao(livro, acao)}
                />
              </div>
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

  /* Barra lateral como painel flutuante (igual ao PainelLateral): margem em relação à janela,
     cantos arredondados, borda suave e sombra. */
  .barra {
    grid-column: 1;
    position: sticky;
    top: 0.75rem;
    align-self: start;
    box-sizing: border-box;
    width: 14rem;
    height: calc(100vh - 1.5rem);
    margin: 0.75rem 0 0.75rem 0.75rem;
    overflow-y: auto;
    padding: 0.75rem 0.5rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--painel);
    box-shadow: var(--sombra);
  }

  :global([data-tema="alto-contraste"]) .barra {
    border-color: var(--borda);
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

  /* Coluna: a linha de ações fica no pé do card, alinhada com a dos vizinhos mesmo quando o
     título de um ocupa duas linhas. */
  li {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* Linha de ações do card: marcas à esquerda, ⋯ no fim. */
  .acoes-card {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    margin-block-start: auto;
    padding-inline: 0.25rem;
  }

  .acoes-card :global(.menu-livro) {
    margin-inline-start: auto;
  }

  .marca {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-color: transparent;
    border-radius: var(--raio);
    background: transparent;
    color: var(--suave);
    font-size: 1.05rem;
  }

  .marca:hover:not([aria-disabled="true"]) {
    background: var(--hover);
    color: var(--texto);
  }

  /* Marcada: cor de destaque, fundo suave e, quando o ícone tem, a forma cheia. A cor não é a
     única pista (WCAG 1.4.1). */
  .marca[aria-pressed="true"],
  .marca.marcada {
    background: var(--destaque-suave);
    color: var(--destaque);
  }

  .marca[aria-disabled="true"] {
    cursor: default;
  }

  :global([data-tema="alto-contraste"]) .marca[aria-pressed="true"],
  :global([data-tema="alto-contraste"]) .marca.marcada {
    border-color: var(--destaque);
  }

  .cabeca-colecao {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-block-start: 1rem;
  }

  .cabeca-colecao h2 {
    flex: 1;
    margin: 0;
    font-size: 1.25rem;
  }

  .cabeca-colecao button {
    border-radius: var(--raio);
  }

  .cabeca-colecao h2:focus {
    outline: none;
  }

  .voltar {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    order: -1;
    flex: none;
    border-color: transparent;
    background: transparent;
    color: var(--destaque);
  }

  .voltar:hover {
    background: var(--hover);
  }

  .aviso-lixeira {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-block-start: 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--painel);
  }

  .aviso-lixeira p {
    margin: 0;
    color: var(--suave);
  }

  .aviso-lixeira button {
    border-radius: var(--raio);
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
