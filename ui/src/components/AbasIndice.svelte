<script lang="ts" module>
  export type Aba = "indice" | "destaques" | "marcadores";
</script>

<script lang="ts">
  // Abas do painel da esquerda: "Índice", "Destaques" e "Marcadores" (M42a; como no Apple Books).
  // Padrão ARIA de abas: setas e Home/End trocam a aba (ativação automática), Tab vai para o
  // conteúdo.
  import type { Snippet } from "svelte";

  let {
    aba = $bindable("indice"),
    quantidade = 0,
    marcadores = 0,
    conteudoIndice,
    conteudoDestaques,
    conteudoMarcadores,
  }: {
    aba?: Aba;
    /** Quantos destaques o livro tem (no rótulo da aba). */
    quantidade?: number;
    /** Quantos marcadores o livro tem (no rótulo da aba). */
    marcadores?: number;
    conteudoIndice: Snippet;
    conteudoDestaques: Snippet;
    conteudoMarcadores: Snippet;
  } = $props();

  const ABAS: Aba[] = ["indice", "destaques", "marcadores"];
  const NOMES: Record<Aba, string> = { indice: "Índice", destaques: "Destaques", marcadores: "Marcadores" };
  const contagem = (a: Aba) => (a === "destaques" ? quantidade : a === "marcadores" ? marcadores : 0);
  const conteudo = (a: Aba) =>
    a === "indice" ? conteudoIndice : a === "destaques" ? conteudoDestaques : conteudoMarcadores;
  let botoes: Record<string, HTMLButtonElement> = {};

  function aoTeclar(e: KeyboardEvent) {
    const i = ABAS.indexOf(aba);
    const destino =
      e.key === "ArrowRight"
        ? ABAS[(i + 1) % ABAS.length]
        : e.key === "ArrowLeft"
          ? ABAS[(i - 1 + ABAS.length) % ABAS.length]
          : e.key === "Home"
            ? ABAS[0]
            : e.key === "End"
              ? ABAS[ABAS.length - 1]
              : undefined;
    if (!destino) return;
    e.preventDefault();
    aba = destino;
    botoes[destino]?.focus();
  }

  /** Mostra uma aba e leva o foco ao botão dela (paleta de comandos). */
  export function mostrar(destino: Aba) {
    aba = destino;
    botoes[destino]?.focus();
  }
</script>

<!-- As setas trocam a aba: tratadas na lista de abas, que as recebe dos botões. -->
<div class="abas" role="tablist" aria-label="Conteúdo do painel" tabindex="-1" onkeydown={aoTeclar}>
  {#each ABAS as a (a)}
    <button
      type="button"
      role="tab"
      id="aba-{a}"
      aria-selected={aba === a}
      aria-controls="painel-aba-{a}"
      aria-label={contagem(a) ? `${NOMES[a]} (${contagem(a)})` : NOMES[a]}
      tabindex={aba === a ? 0 : -1}
      bind:this={botoes[a]}
      onclick={() => (aba = a)}
    >
      {NOMES[a]}
    </button>
  {/each}
</div>

{#each ABAS as a (a)}
  <div id="painel-aba-{a}" role="tabpanel" aria-labelledby="aba-{a}" hidden={aba !== a}>
    {@render conteudo(a)()}
  </div>
{/each}

<style>
  .abas {
    display: flex;
    gap: 0.25rem;
    margin-block-end: 0.75rem;
    padding: 0.2rem;
    border-radius: var(--raio);
    background: var(--hover);
  }

  .abas:focus {
    outline: none;
  }

  /* Três abas no painel de 19,5 rem (M42a): cada uma do tamanho do nome, em letra um pouco menor.
     A contagem saiu da aba (não cabia): fica no nome acessível ("Destaques (3)") e nas listas. */
  [role="tab"] {
    flex: 1 1 auto;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    min-height: 2rem;
    padding: 0.25rem 0.3rem;
    font-size: 0.8125rem;
    white-space: nowrap;
    border: 1px solid transparent;
    border-radius: var(--raio-pequeno);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  /* Aba escolhida: fundo de cartão e texto forte (não só a cor). */
  [aria-selected="true"] {
    background: var(--card);
    font-weight: 600;
    box-shadow: 0 1px 2px rgb(0 0 0 / 15%);
  }

  :global([data-tema="alto-contraste"]) [aria-selected="true"] {
    border-color: var(--borda);
  }

</style>
