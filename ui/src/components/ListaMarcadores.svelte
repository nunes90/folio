<script lang="ts">
  // Marcadores do livro, na ordem de leitura (aba "Marcadores" do índice, M42a). Cada um leva
  // até a página e tem o botão de tirar. Os mesmos padrões da lista de destaques.
  import type { Marcador } from "../lib/biblioteca";
  import { rotuloDoMarcador } from "../lib/controleMarcadores.svelte";
  import Icone from "./Icone.svelte";

  let {
    marcadores,
    formato,
    atual = null,
    onIr,
    onApagar,
  }: {
    marcadores: Marcador[];
    formato: "epub" | "pdf";
    /** O marcador da página que se vê (fica indicado na lista). */
    atual?: Marcador | null;
    onIr: (marcador: Marcador) => void;
    onApagar: (marcador: Marcador) => void;
  } = $props();
</script>

{#if marcadores.length}
  <ul aria-label="Marcadores">
    {#each marcadores as marcador (marcador.id)}
      {@const rotulo = rotuloDoMarcador(marcador, formato)}
      <li>
        <button
          type="button"
          class="ir"
          aria-current={marcador.id === atual?.id ? "location" : undefined}
          onclick={() => onIr(marcador)}
        >
          <Icone nome="marcador" preenchido={marcador.id === atual?.id} />
          <span class="nome">{rotulo}</span>
        </button>
        <button
          type="button"
          class="tirar"
          aria-label="Tirar o marcador: {rotulo}"
          title="Tirar o marcador"
          onclick={() => onApagar(marcador)}
        >
          <Icone nome="lixeira" />
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <p class="vazio">
    Nenhum marcador ainda. Use <kbd>Ctrl</kbd>+<kbd>B</kbd> para marcar a página que está lendo.
  </p>
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding-block: 0.15rem;
    border-block-end: 1px solid var(--divisoria);
  }

  button {
    border: 0;
    border-radius: var(--raio-pequeno);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button:hover {
    background: var(--hover);
  }

  .ir {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.5rem;
    text-align: start;
  }

  /* A cor do marcador é a do destaque da interface; o preenchido diz "esta página" (não só a cor). */
  .ir :global(svg) {
    flex: none;
    color: var(--destaque);
  }

  [aria-current="location"] {
    font-weight: 600;
  }

  /* Não `.rotulo`: essa classe é a que as barras compactas escondem (app.css). */
  .nome {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tirar {
    display: inline-flex;
    padding: 0.4rem;
  }

  .vazio {
    color: var(--suave);
  }

  kbd {
    padding: 0 0.25rem;
    border: 1px solid var(--borda);
    border-block-end-width: 2px;
    border-radius: var(--raio-pequeno);
    font: inherit;
    font-size: 0.85em;
    font-weight: 600;
  }
</style>
