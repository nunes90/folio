<script lang="ts">
  // Os controles da leitura em voz alta no rodapé, iguais no EPUB e no PDF (M23).
  import Icone from "./Icone.svelte";
  import type { EstadoVoz } from "../lib/voz";

  let {
    estado,
    onLer,
    onPausarOuRetomar,
    onParar,
  }: {
    estado: EstadoVoz;
    onLer: () => void;
    onPausarOuRetomar: () => void;
    onParar: () => void;
  } = $props();
</script>

<!-- data-fim-rodape: com o lado aberto, a moldura alinha estes controles ao fim do rodapé. -->
<div class="voz" role="group" aria-label="Leitura em voz alta" data-fim-rodape>
  {#if estado === "parado"}
    <button type="button" onclick={onLer}>
      <Icone nome="voz" /><span class="rotulo">Ler em voz alta</span>
    </button>
  {:else}
    <button type="button" onclick={onPausarOuRetomar}>
      <Icone nome={estado === "pausado" ? "continuar" : "pausar"} />
      <span class="rotulo">{estado === "pausado" ? "Continuar leitura" : "Pausar leitura"}</span>
    </button>
    <button type="button" onclick={onParar}>
      <Icone nome="parar" /><span class="rotulo">Parar leitura</span>
    </button>
  {/if}
</div>

<style>
  /* Controles de voz à esquerda; a navegação continua no centro. */
  .voz {
    display: flex;
    gap: 0.5rem;
    margin-inline-end: auto;
  }
</style>
