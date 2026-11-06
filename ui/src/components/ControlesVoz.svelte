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

  let principal = $state<HTMLButtonElement>();
  /** "Parar leitura" some ao parar: o foco vai ao "Ler em voz alta", não ao body. */
  function parar() {
    onParar();
    principal?.focus();
  }
</script>

<!-- data-fim-rodape: com o lado aberto, a moldura alinha estes controles ao fim do rodapé. -->
<div class="voz" data-fim-rodape>
  <div class="grupo-sem-caixa" role="group" aria-label="Leitura em voz alta">
    <!-- Um botão só para ler, pausar e continuar: ao começar a ler, o foco fica nele (o botão que
         sumia levava o foco ao body, e o Orca anunciava a página por cima da voz). -->
    <button type="button" bind:this={principal} onclick={estado === "parado" ? onLer : onPausarOuRetomar}>
      {#if estado === "parado"}
        <Icone nome="voz" /><span class="rotulo">Ler em voz alta</span>
      {:else}
        <Icone nome={estado === "pausado" ? "continuar" : "pausar"} />
        <span class="rotulo">{estado === "pausado" ? "Continuar leitura" : "Pausar leitura"}</span>
      {/if}
    </button>
    {#if estado !== "parado"}
      <button type="button" onclick={parar}>
        <Icone nome="parar" /><span class="rotulo">Parar leitura</span>
      </button>
    {/if}
  </div>
</div>

<style>
  /* Controles de voz à esquerda; a navegação continua no centro. */
  .voz {
    display: flex;
    gap: 0.5rem;
    margin-inline-end: auto;
  }
</style>
