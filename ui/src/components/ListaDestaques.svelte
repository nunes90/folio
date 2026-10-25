<script lang="ts">
  // Destaques do livro, na ordem de leitura (aba "Destaques" do índice). Cada um: o trecho
  // (leva até ele), a cor em palavras e o capítulo, a nota; e os botões Nota e Apagar.
  import type { Destaque } from "../lib/biblioteca";
  import { hexDaCor, nomeDaCor, resumo } from "../lib/destaques";
  import Icone from "./Icone.svelte";

  let {
    destaques,
    onIr,
    onNota,
    onApagar,
    onExportar,
  }: {
    destaques: Destaque[];
    onIr: (destaque: Destaque) => void;
    onNota: (destaque: Destaque) => void;
    onApagar: (destaque: Destaque) => void;
    onExportar?: () => void;
  } = $props();
</script>

{#if destaques.length}
  {#if onExportar}
    <button type="button" class="exportar" onclick={onExportar}>
      <Icone nome="exportar" /><span>Exportar em Markdown…</span>
    </button>
  {/if}
  <ul aria-label="Destaques">
    {#each destaques as destaque (destaque.id)}
      <li style:--cor-destaque={hexDaCor(destaque.cor)}>
        <button type="button" class="trecho" onclick={() => onIr(destaque)}>
          <span class="texto">{resumo(destaque.trecho, 160)}</span>
          <span class="meta">
            {nomeDaCor(destaque.cor)}{destaque.capitulo ? ` · ${destaque.capitulo}` : ""}
          </span>
          {#if destaque.nota}<span class="nota">{destaque.nota}</span>{/if}
        </button>
        <div class="acoes">
          <button
            type="button"
            aria-label="{destaque.nota ? 'Editar nota' : 'Adicionar nota'}: {resumo(destaque.trecho, 40)}"
            title={destaque.nota ? "Editar nota" : "Adicionar nota"}
            onclick={() => onNota(destaque)}
          >
            <Icone nome="nota" />
          </button>
          <button
            type="button"
            aria-label="Apagar destaque: {resumo(destaque.trecho, 40)}"
            title="Apagar destaque"
            onclick={() => onApagar(destaque)}
          >
            <Icone nome="lixeira" />
          </button>
        </div>
      </li>
    {/each}
  </ul>
{:else}
  <p class="vazio">
    Nenhum destaque ainda. Selecione um trecho e escolha uma cor, ou use <kbd>Ctrl</kbd>+<kbd
      >D</kbd
    > com o trecho selecionado.
  </p>
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    padding-block: 0.15rem;
    border-block-end: 1px solid var(--divisoria);
  }

  /* Faixa com a cor do destaque (a cor também está escrita na linha de baixo). */
  li::before {
    content: "";
    flex: none;
    width: 4px;
    margin-block: 0.45rem;
    align-self: stretch;
    border-radius: 2px;
    background: var(--cor-destaque);
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

  .trecho {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    padding: 0.4rem 0.5rem;
    text-align: start;
  }

  .meta {
    color: var(--suave);
    font-size: 0.8125rem;
  }

  .nota {
    padding-inline-start: 0.5rem;
    border-inline-start: 2px solid var(--divisoria);
    font-size: 0.875rem;
    white-space: pre-line;
  }

  .acoes {
    display: flex;
    flex-direction: column;
  }

  .acoes button {
    display: inline-flex;
    padding: 0.4rem;
  }

  .exportar {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-block-end: 0.5rem;
    padding: 0.35rem 0.6rem;
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
