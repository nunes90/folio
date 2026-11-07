<script lang="ts" generics="T extends string">
  // Abas (M28), o mesmo visual e o mesmo teclado em toda a interface: padrão ARIA de abas, com
  // setas e Home/End trocando a aba (ativação automática) e Tab indo ao conteúdo.
  import type { Snippet } from "svelte";

  let {
    abas,
    aba = $bindable(),
    rotulo,
    prefixo,
    conteudo,
  }: {
    abas: { id: T; nome: string }[];
    aba: T;
    /** Nome do conjunto de abas, para o leitor de tela. */
    rotulo: string;
    /** Prefixo dos ids (únicos na página). */
    prefixo: string;
    /** O conteúdo de uma aba. */
    conteudo: Snippet<[T]>;
  } = $props();

  let botoes: Record<string, HTMLButtonElement> = {};

  function aoTeclar(e: KeyboardEvent) {
    const i = abas.findIndex((a) => a.id === aba);
    const n = abas.length;
    const destino =
      e.key === "ArrowRight"
        ? abas[(i + 1) % n]
        : e.key === "ArrowLeft"
          ? abas[(i - 1 + n) % n]
          : e.key === "Home"
            ? abas[0]
            : e.key === "End"
              ? abas[n - 1]
              : undefined;
    if (!destino) return;
    e.preventDefault();
    aba = destino.id;
    botoes[destino.id]?.focus();
  }

  /** Mostra uma aba e leva o foco ao botão dela (paleta de comandos). */
  export function mostrar(destino: T) {
    aba = destino;
    botoes[destino]?.focus();
  }
</script>

<div class="abas" role="tablist" aria-label={rotulo} tabindex="-1" onkeydown={aoTeclar}>
  {#each abas as a (a.id)}
    <button
      type="button"
      role="tab"
      id="{prefixo}-aba-{a.id}"
      aria-selected={aba === a.id}
      aria-controls="{prefixo}-painel-{a.id}"
      tabindex={aba === a.id ? 0 : -1}
      bind:this={botoes[a.id]}
      onclick={() => (aba = a.id)}
    >
      {a.nome}
    </button>
  {/each}
</div>

{#each abas as a (a.id)}
  <div
    id="{prefixo}-painel-{a.id}"
    role="tabpanel"
    aria-labelledby="{prefixo}-aba-{a.id}"
    hidden={aba !== a.id}
  >
    {#if aba === a.id}
      {@render conteudo(a.id)}
    {/if}
  </div>
{/each}

<style>
  .abas {
    display: flex;
    gap: 0.25rem;
    margin-block-end: 1rem;
    padding: 0.2rem;
    border-radius: var(--raio);
    background: var(--hover);
  }

  .abas:focus {
    outline: none;
  }

  /* Do tamanho do nome (com a sobra repartida): abas iguais cortavam "Interface" num painel estreito. */
  [role="tab"] {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 2rem;
    padding: 0.25rem 0.4rem;
    border: 1px solid transparent;
    border-radius: var(--raio-pequeno);
    background: transparent;
    color: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Aba escolhida: fundo de cartão e texto forte (não só a cor). */
  [aria-selected="true"],
  [aria-selected="true"]:hover:not(:disabled) {
    background: var(--card);
    font-weight: 600;
    box-shadow: 0 1px 2px rgb(0 0 0 / 15%);
  }

  :global([data-tema="alto-contraste"]) [aria-selected="true"] {
    border-color: var(--borda);
  }
</style>
