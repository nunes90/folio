<script lang="ts">
  import type { Colecao } from "../lib/biblioteca";
  import type { Filtro, Vista } from "../lib/filtro";
  import Icone from "./Icone.svelte";

  // As estantes (vistas) da barra lateral da biblioteca. Uma só parada de Tab: as setas ↑↓,
  // Home e End andam entre elas (roving tabindex), como na grade de livros. Quem envolve
  // decide o elemento de navegação (<nav> na barra; o painel, na janela estreita).
  let {
    atual,
    contagens,
    colecoes = [],
    contagensColecoes = {},
    quantidadeAutores,
    onEscolher,
    onNovaColecao,
  }: {
    atual: Filtro;
    contagens: Record<Vista, number>;
    colecoes?: Colecao[];
    /** Livros de cada coleção com a busca atual (por id). */
    contagensColecoes?: Record<number, number>;
    /** Se presente, mostra o item "Autores" (com o número de autores). */
    quantidadeAutores?: number;
    onEscolher: (estante: Filtro) => void;
    /** Se presente, mostra "Nova coleção" (pede o nome). */
    onNovaColecao?: () => void;
  } = $props();

  type IconeEstante =
    | "grade"
    | "estrela"
    | "livro"
    | "marcador"
    | "lido"
    | "lixeira"
    | "pasta"
    | "pessoa";
  type Item = { valor: Filtro; nome: string; icone: IconeEstante; contagem: number };
  const VISTAS: { valor: Vista; nome: string; icone: IconeEstante }[] = [
    { valor: "todos", nome: "Todos", icone: "grade" },
    { valor: "favoritos", nome: "Favoritos", icone: "estrela" },
    { valor: "lendo", nome: "Lendo", icone: "livro" },
    { valor: "para-ler", nome: "Para ler", icone: "marcador" },
    { valor: "lidos", nome: "Lidos", icone: "lido" },
  ];

  // Vistas, coleções e a lixeira, nessa ordem: as setas andam por todas.
  const vistas = $derived<Item[]>(VISTAS.map((v) => ({ ...v, contagem: contagens[v.valor] })));
  const itensColecoes = $derived<Item[]>(
    colecoes.map((c) => ({
      valor: `colecao:${c.id}` as const,
      nome: c.nome,
      icone: "pasta",
      contagem: contagensColecoes[c.id] ?? c.quantidade,
    })),
  );
  const lixeira = $derived<Item>({
    valor: "lixeira",
    nome: "Lixeira",
    icone: "lixeira",
    contagem: contagens.lixeira,
  });
  // "Autores" abre a lista de autores; dentro dela (um autor aberto), o item continua o atual.
  const autores = $derived<Item[]>(
    quantidadeAutores === undefined
      ? []
      : [{ valor: "autores", nome: "Autores", icone: "pessoa", contagem: quantidadeAutores }],
  );
  const naVista = (item: Item) =>
    item.valor === atual || (item.valor === "autores" && atual.startsWith("autor:"));
  const todos = $derived([...vistas, ...autores, ...itensColecoes, lixeira]);

  let lista: HTMLUListElement;
  // A parada de Tab acompanha a estante atual.
  let foco = $derived(Math.max(0, todos.findIndex(naVista)));

  function aoTeclar(e: KeyboardEvent) {
    // "Nova coleção" é uma ação, não uma estante: tem parada de Tab própria e fica fora das setas.
    if (!(e.target instanceof Element) || !e.target.closest("button.estante")) return;
    const destinos: Record<string, () => number> = {
      ArrowDown: () => foco + 1,
      ArrowUp: () => foco - 1,
      Home: () => 0,
      End: () => todos.length - 1,
    };
    const destino = destinos[e.key];
    if (!destino) return;
    e.preventDefault();
    foco = Math.max(0, Math.min(destino(), todos.length - 1));
    lista.querySelectorAll<HTMLButtonElement>("button.estante")[foco]?.focus();
  }
</script>

{#snippet estante(item: Item, i: number)}
  <button
    type="button"
    class="estante"
    tabindex={i === foco ? 0 : -1}
    aria-current={naVista(item) ? "page" : undefined}
    onfocus={() => (foco = i)}
    onclick={() => onEscolher(item.valor)}
  >
    <Icone nome={item.icone} />
    <span class="nome">{item.nome}</span>
    <span class="contagem">{item.contagem}</span>
  </button>
{/snippet}

<!-- As setas são tratadas no <ul> (delegação): o evento sobe do botão focado. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul bind:this={lista} onkeydown={aoTeclar}>
  {#each vistas as item, i (item.valor)}
    <li>{@render estante(item, i)}</li>
  {/each}

  {#each autores as item (item.valor)}
    <li>{@render estante(item, vistas.length)}</li>
  {/each}

  {#if colecoes.length || onNovaColecao}
    <li class="separada"><h2 class="titulo-secao">Coleções</h2></li>
    {#each itensColecoes as item, i (item.valor)}
      <li>{@render estante(item, vistas.length + autores.length + i)}</li>
    {/each}
    {#if onNovaColecao}
      <li>
        <button type="button" class="nova" onclick={onNovaColecao}>
          <Icone nome="mais" /><span class="nome">Nova coleção</span>
        </button>
      </li>
    {/if}
  {/if}

  <li class="separada">{@render estante(lixeira, todos.length - 1)}</li>
</ul>

<style>
  ul {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A lixeira é outro tipo de lugar (um estado do livro): fica separada das vistas. */
  .separada {
    margin-block-start: 0.6rem;
    padding-block-start: 0.6rem;
    border-block-start: 1px solid var(--divisoria);
  }

  .titulo-secao {
    margin: 0 0 0.2rem;
    padding-inline: 0.65rem;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--suave);
  }

  .nova {
    color: var(--suave);
  }

  button {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-height: 2.25rem;
    padding: 0.35rem 0.65rem;
    border: 0;
    border-radius: var(--raio);
    background: transparent;
    color: var(--texto);
    text-align: start;
  }

  button:hover {
    background: var(--hover);
  }

  /* Estante atual: o mesmo destaque do capítulo atual no índice (M7b). */
  button[aria-current] {
    background: var(--destaque-suave);
    color: var(--destaque);
    font-weight: 600;
  }

  button[aria-current]::before {
    content: "";
    position: absolute;
    inset-block: 0.4rem;
    inset-inline-start: 0;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: var(--destaque);
  }

  .nome {
    flex: 1;
  }

  .contagem {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--suave);
  }

  [aria-current] .contagem {
    color: inherit;
  }
</style>
