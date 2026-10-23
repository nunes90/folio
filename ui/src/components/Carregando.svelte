<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";

  // Aviso de carregamento, igual para EPUB e PDF. Só aparece se a espera passar de
  // ATRASO_MS: aberturas rápidas não piscam um aviso (como a Apple faz). Sem girar nada:
  // um texto discreto que esmaece, anunciado ao leitor de tela (role="status").
  let { texto }: { texto: string } = $props();

  const ATRASO_MS = 400;
  let visivel = $state(false);

  onMount(() => {
    const espera = setTimeout(() => (visivel = true), ATRASO_MS);
    return () => clearTimeout(espera);
  });
</script>

<div class="carregando" role="status">
  {#if visivel}
    <p transition:fade={{ duration: duracao("media"), easing: curva }}>{texto}</p>
  {/if}
</div>

<style>
  .carregando {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    /* Por cima do visor (o contêiner do pdf.js e o foliate-view também são posicionados). */
    z-index: 1;
  }

  p {
    margin: 0;
    color: var(--suave);
  }
</style>
