<script lang="ts">
  // A linha de status, logo abaixo do livro (M41; antes, InfoDoRodape, dividindo o rodapé com os
  // controles, onde a meta era cortada entre 600 e 1000 px): quanto falta no ritmo de quem lê, à
  // esquerda, e a meta da sessão, à direita. O rodapé fica só para navegar.
  //
  // A linha tem sempre a mesma altura, com ou sem texto: o livro não é repaginado quando a
  // estimativa aparece (depois de alguns minutos de leitura) ou quando a meta é posta.
  //
  // No modo foco (com `foco`), ela flutua sobre a borda de baixo do livro e também leva o que era o
  // canto: a porcentagem, a saída planejada e o estado da voz. Ali é só para ver (aria-hidden, sem
  // o botão de tirar a meta): o rodapé, que o Tab revela, e a paleta dizem e fazem o mesmo.
  import Icone from "./Icone.svelte";
  import type { EstadoVoz } from "../lib/voz";
  import type { MetaDaSessao } from "../lib/meta.svelte";

  let {
    estimativa,
    meta,
    foco = null,
  }: {
    estimativa?: string;
    meta?: MetaDaSessao;
    /** Só no modo foco: o que o canto mostrava. */
    foco?: { progresso: number; saida?: string; voz: EstadoVoz } | null;
  } = $props();

  const textoDaVoz = (voz: EstadoVoz) =>
    voz === "parado" ? null : voz === "pausado" ? "voz pausada" : "lendo em voz alta";
</script>

<div class="linha-status" class:no-foco={!!foco} aria-hidden={foco ? "true" : undefined}>
  <span class="estimativa">{estimativa ?? ""}</span>
  <div class="direita">
    {#if meta?.meta}
      <div class="meta" role={foco ? undefined : "group"} aria-label={foco ? undefined : "Meta da sessão"}>
        <span class="texto-meta">Meta: {meta.texto}</span>
        <!-- Decorativa: o texto ao lado diz o mesmo. -->
        <span class="barra-meta" aria-hidden="true">
          <span style:transform="scaleX({meta.progresso})"></span>
        </span>
        {#if !foco}
          <button
            type="button"
            class="discreto tirar-meta"
            aria-label="Tirar a meta da sessão"
            onclick={() => meta.definir(null)}
          >
            <Icone nome="fechar" />
          </button>
        {/if}
      </div>
    {/if}
    {#if foco}
      <span class="canto">
        {Math.round(foco.progresso * 100)}%{#if foco.saida}&ensp;·&ensp;foco: {foco.saida}{/if}{#if textoDaVoz(foco.voz)}&ensp;·&ensp;{textoDaVoz(foco.voz)}{/if}
      </span>
    {/if}
  </div>
</div>

<style>
  .linha-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    /* A altura do botão de tirar a meta: com ou sem ele, a mesma. */
    min-height: 1.75rem;
    padding: 0.125rem 1rem;
    color: var(--suave);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    min-width: 0;
  }

  .estimativa {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .direita {
    display: flex;
    align-items: center;
    gap: 1rem;
    /* A meta inteira antes da estimativa: quem cede espaço é a estimativa (com "…"). */
    flex-shrink: 0;
    max-width: 100%;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .texto-meta,
  .canto {
    white-space: nowrap;
  }

  .barra-meta {
    width: 3rem;
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

  /* 24 px: o alvo mínimo (WCAG 2.5.8), menor que os botões das barras. */
  .tirar-meta {
    min-width: 1.5rem;
    min-height: 1.5rem;
    padding: 0.15rem;
  }

  /* Numa janela estreita, a meta sem a barrinha (o texto diz o mesmo). */
  @media (max-width: 30rem) {
    .barra-meta {
      display: none;
    }
  }
</style>
