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
    display: block;
    width: 100%;
    padding: 0.4rem 0.75rem;
    border: 0;
    border-radius: 0.25rem;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  button:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  button[aria-current] {
    font-weight: 600;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }
</style>
