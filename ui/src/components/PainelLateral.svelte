<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { fly } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import Icone from "./Icone.svelte";

  let {
    id,
    rotulo,
    aberto,
    lado,
    elemento = "aside",
    onFechar,
    children,
  }: {
    id: string;
    rotulo: string;
    aberto: boolean;
    /** De que lado da tela o painel fica (e de onde desliza). */
    lado: "inicio" | "fim";
    /** `nav` para navegação (índice); `aside` para o resto. */
    elemento?: "aside" | "nav";
    /** Botão de fechar no cabeçalho do painel. */
    onFechar?: () => void;
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
      <div class="cabecalho">
        <h2>{rotulo}</h2>
        {#if onFechar}
          <button type="button" class="fechar" aria-label="Fechar {rotulo}" onclick={onFechar}>
            <Icone nome="fechar" />
          </button>
        {/if}
      </div>
      {@render children()}
    </div>
  {/if}
</svelte:element>

<style>
  /* Painel flutuante: o elemento de fora só dá a margem em relação à janela; o cartão (fundo,
     borda, raio e sombra) é o conteúdo, que é quem desliza ao abrir e fechar. Assim o cartão
     sai inteiro, sem deixar uma moldura vazia para trás. */
  .painel {
    display: flex;
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    padding: 0.75rem;
  }

  .painel[hidden] {
    display: none;
  }

  .conteudo {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 0 0.75rem 0.75rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--painel);
    box-shadow: var(--sombra);
  }

  /* Alto contraste: sem sombra; a borda forte é o que separa o cartão. */
  :global([data-tema="alto-contraste"]) .conteudo {
    border-color: var(--borda);
  }

  /* Fica visível enquanto o conteúdo do painel rola. */
  .cabecalho {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-inline: -0.75rem;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
    background: var(--painel);
  }

  h2 {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--suave);
  }

  .fechar {
    display: inline-grid;
    place-items: center;
    min-width: 2rem;
    min-height: 2rem;
    padding: 0;
    border-color: transparent;
    border-radius: var(--raio);
    background: transparent;
    color: var(--suave);
  }

  .fechar:hover {
    background: var(--hover);
    color: var(--texto);
  }

  :global([data-tema="alto-contraste"]) .fechar {
    border-color: var(--borda);
  }
</style>
