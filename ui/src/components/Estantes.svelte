<script lang="ts">
  import type { Filtro } from "../lib/filtro";
  import Icone from "./Icone.svelte";

  // As estantes (vistas) da barra lateral da biblioteca. Uma só parada de Tab: as setas ↑↓,
  // Home e End andam entre elas (roving tabindex), como na grade de livros. Quem envolve
  // decide o elemento de navegação (<nav> na barra; o painel, na janela estreita).
  let {
    atual,
    contagens,
    onEscolher,
  }: {
    atual: Filtro;
    contagens: Record<Filtro, number>;
    onEscolher: (estante: Filtro) => void;
  } = $props();

  const ESTANTES: { valor: Filtro; nome: string; icone: "grade" | "livro" | "marcador" | "lido" }[] = [
    { valor: "todos", nome: "Todos", icone: "grade" },
    { valor: "lendo", nome: "Lendo", icone: "livro" },
    { valor: "para-ler", nome: "Para ler", icone: "marcador" },
    { valor: "lidos", nome: "Lidos", icone: "lido" },
  ];

  let lista: HTMLUListElement;
  // A parada de Tab acompanha a estante atual.
  let foco = $derived(Math.max(0, ESTANTES.findIndex((e) => e.valor === atual)));

  function aoTeclar(e: KeyboardEvent) {
    const destinos: Record<string, () => number> = {
      ArrowDown: () => foco + 1,
      ArrowUp: () => foco - 1,
      Home: () => 0,
      End: () => ESTANTES.length - 1,
    };
    const destino = destinos[e.key];
    if (!destino) return;
    e.preventDefault();
    foco = Math.max(0, Math.min(destino(), ESTANTES.length - 1));
    lista.querySelectorAll<HTMLButtonElement>("button")[foco]?.focus();
  }
</script>

<!-- As setas são tratadas no <ul> (delegação): o evento sobe do botão focado. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul bind:this={lista} onkeydown={aoTeclar}>
  {#each ESTANTES as estante, i (estante.valor)}
    <li>
      <button
        type="button"
        tabindex={i === foco ? 0 : -1}
        aria-current={estante.valor === atual ? "page" : undefined}
        onfocus={() => (foco = i)}
        onclick={() => onEscolher(estante.valor)}
      >
        <Icone nome={estante.icone} />
        <span class="nome">{estante.nome}</span>
        <span class="contagem">{contagens[estante.valor]}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  ul {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
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
