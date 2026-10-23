<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { fly } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";

  let {
    id,
    rotulo,
    aberto,
    lado,
    elemento = "aside",
    children,
  }: {
    id: string;
    rotulo: string;
    aberto: boolean;
    /** De que lado da tela o painel fica (e de onde desliza). */
    lado: "inicio" | "fim";
    /** `nav` para navegação (índice); `aside` para o resto. */
    elemento?: "aside" | "nav";
    children: Snippet;
  } = $props();

  // O elemento externo existe sempre (é o alvo do aria-controls do botão); o conteúdo entra
  // e sai com a animação. Enquanto ela roda, o painel não pode ficar `hidden`.
  let saindo = $state(false);
  // Só o valor inicial (untrack): a partir daí, o efeito abaixo acompanha as mudanças.
  let estavaAberto = untrack(() => aberto);
  $effect.pre(() => {
    if (estavaAberto && !aberto) saindo = true;
    estavaAberto = aberto;
  });
</script>

<svelte:element
  this={elemento}
  {id}
  aria-label={rotulo}
  class="painel {lado}"
  tabindex="-1"
  hidden={!aberto && !saindo}
>
  {#if aberto}
    <div
      class="conteudo"
      transition:fly={{ x: lado === "inicio" ? -24 : 24, duration: duracao("media"), easing: curva }}
      onoutroend={() => (saindo = false)}
    >
      {@render children()}
    </div>
  {/if}
</svelte:element>

<style>
  .painel {
    overflow-y: auto;
    border-color: color-mix(in srgb, currentColor 15%, transparent);
    border-style: solid;
    border-width: 0;
  }

  .painel[hidden] {
    display: none;
  }

  .inicio {
    border-inline-end-width: 1px;
  }

  .fim {
    border-inline-start-width: 1px;
  }

  .conteudo {
    padding: 0.75rem;
  }
</style>
