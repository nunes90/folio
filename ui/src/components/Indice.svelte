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

  // Setas entre os capítulos, inclusive os subitens. Com o Orca em modo foco (a interface é
  // role="application"), são elas que percorrem a lista. Cada nível aninhado deixa o evento subir até a raiz.
  function aoTeclar(e: KeyboardEvent) {
    const raiz = e.currentTarget as HTMLElement;
    if (raiz.parentElement?.closest("ol")) return;
    const botoes = [...raiz.querySelectorAll("button")];
    const i = botoes.indexOf(e.target as HTMLButtonElement);
    const destino =
      e.key === "ArrowDown"
        ? botoes[i + 1]
        : e.key === "ArrowUp"
          ? botoes[i - 1]
          : e.key === "Home"
            ? botoes[0]
            : e.key === "End"
              ? botoes.at(-1)
              : undefined;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    // Nas pontas, a seta não sai da lista nem vira a página do livro.
    e.preventDefault();
    e.stopPropagation();
    destino?.focus();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ol onkeydown={aoTeclar}>
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

  /* Sem caixa própria (o item de lista continua na árvore de acessibilidade): com ela, o WebKitGTK
     aborta o processo quando um leitor de tela lê o item (ver docs/leitor-de-tela.md). */
  li {
    display: contents;
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
    overflow-wrap: anywhere;
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
