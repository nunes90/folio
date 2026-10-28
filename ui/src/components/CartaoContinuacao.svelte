<script lang="ts">
  // "Onde você parou" (M22): um cartão discreto sobre o livro ao reabrir, com as frases que
  // antecedem o ponto em que se parou. Não é um diálogo: não prende o foco nem bloqueia a
  // leitura. Some com "Continuar lendo", com Esc ou ao virar a página (MolduraLeitor).
  import { fade } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import type { Continuacao } from "../lib/continuacao";

  let { continuacao, onFechar }: { continuacao: Continuacao; onFechar: () => void } = $props();
</script>

<section
  class="cartao"
  aria-labelledby="titulo-continuacao"
  transition:fade={{ duration: duracao("media"), easing: curva }}
>
  <h2 id="titulo-continuacao">Onde você parou</h2>
  <p>
    Da última vez{continuacao.quando ? ` (${continuacao.quando})` : ""}, você estava
    {continuacao.onde}.
  </p>
  {#if continuacao.trecho.length}
    <blockquote>…&nbsp;{continuacao.trecho.join(" ")}</blockquote>
  {/if}
  <div class="botoes">
    <button type="button" onclick={onFechar}>Continuar lendo</button>
  </div>
</section>

<style>
  .cartao {
    width: min(34rem, calc(100% - 2rem));
    max-height: calc(100% - 2rem);
    overflow: auto;
    padding: 1rem 1.25rem;
    background: var(--card);
    color: var(--texto);
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    box-shadow: var(--sombra);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  p {
    margin: 0;
  }

  blockquote {
    margin: 0.75rem 0 0;
    padding-inline-start: 0.75rem;
    border-inline-start: 3px solid var(--destaque);
    color: var(--suave);
    font-style: italic;
  }

  .botoes {
    display: flex;
    justify-content: flex-end;
    margin-block-start: 0.75rem;
  }
</style>
