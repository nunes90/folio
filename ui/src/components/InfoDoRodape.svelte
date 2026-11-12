<script lang="ts">
  // O que o rodapé do leitor informa, à direita dos controles (saiu da MolduraLeitor no M34e):
  // quanto falta no ritmo de quem lê e a meta da sessão. O texto muda de tamanho e fica numa
  // coluna própria, cortado com "…", para não mover os controles.
  import Icone from "./Icone.svelte";
  import type { MetaDaSessao } from "../lib/meta.svelte";

  let { estimativa, meta }: { estimativa?: string; meta?: MetaDaSessao } = $props();
</script>

{#if estimativa || meta?.meta}
  <div class="rodape-info">
    {#if estimativa}
      <span class="estimativa">{estimativa}</span>
    {/if}
    {#if meta?.meta}
      <div class="meta" role="group" aria-label="Meta da sessão">
        <span class="texto-meta">Meta: {meta.texto}</span>
        <!-- Decorativa: o texto ao lado diz o mesmo. -->
        <span class="barra-meta" aria-hidden="true">
          <span style:transform="scaleX({meta.progresso})"></span>
        </span>
        <button
          type="button"
          class="tirar-meta"
          aria-label="Tirar a meta da sessão"
          onclick={() => meta.definir(null)}
        >
          <Icone nome="fechar" />
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .rodape-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .rodape-info > * {
    min-width: 0;
  }

  .estimativa {
    color: var(--suave);
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--suave);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  /* O texto da meta numa linha só ("Meta: 0 de 20 min" quebrava em duas a 1000 px): quem cede
     espaço é a barrinha, que é decorativa. */
  .texto-meta {
    white-space: nowrap;
  }

  .barra-meta {
    flex: 0 1 4rem;
    min-width: 1rem;
    width: 4rem;
    height: 3px;
    border-radius: 2px;
    background: var(--divisoria);
    overflow: hidden;
  }

  .barra-meta span {
    display: block;
    height: 100%;
    background: var(--destaque);
    transform-origin: left;
    transition: transform var(--duracao-media) var(--curva);
  }

  /* Menor que os botões do rodapé (a regra da moldura para `footer button`). */
  .rodape-info .tirar-meta {
    min-width: 1.75rem;
    min-height: 1.75rem;
    padding: 0.2rem;
  }
</style>
