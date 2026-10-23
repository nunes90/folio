<script lang="ts">
  import type { ItemIndice } from "../lib/foliate";
  import Indice from "./Indice.svelte";

  let {
    itens,
    atual,
    onNavegar,
  }: {
    itens: ItemIndice[];
    /** href do capítulo em leitura, marcado com aria-current. */
    atual?: string;
    onNavegar: (href: string) => void;
  } = $props();
</script>

<ol>
  {#each itens as item (item.href)}
    <li>
      <button
        type="button"
        aria-current={item.href === atual ? "location" : undefined}
        onclick={() => onNavegar(item.href)}
      >
        {item.label.trim()}
      </button>
      {#if item.subitems?.length}
        <Indice itens={item.subitems} {atual} {onNavegar} />
      {/if}
    </li>
  {/each}
</ol>

<style>
  ol {
    list-style: none;
    margin: 0;
    padding-inline-start: 0;
  }

  ol :global(ol) {
    padding-inline-start: 1rem;
  }

  button {
    position: relative;
    display: block;
    width: 100%;
    padding: 0.4rem 0.75rem;
    border: 0;
    border-radius: var(--raio-pequeno);
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  button:hover {
    background: var(--hover);
  }

  /* Capítulo atual: fundo suave e barra lateral no destaque (contraste testado em temas.ts). */
  button[aria-current] {
    font-weight: 600;
    color: var(--destaque);
    background: var(--destaque-suave);
  }

  button[aria-current]::before {
    content: "";
    position: absolute;
    inset-block: 0.35rem;
    inset-inline-start: 0;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: var(--destaque);
  }
</style>
