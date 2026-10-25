<script lang="ts" module>
  export type Aba = "indice" | "destaques";
</script>

<script lang="ts">
  // Abas do painel da esquerda: "Índice" e "Destaques" (como no Apple Books). Padrão ARIA de
  // abas: setas e Home/End trocam a aba (ativação automática), Tab vai para o conteúdo.
  import type { Snippet } from "svelte";

  let {
    aba = $bindable("indice"),
    quantidade = 0,
    conteudoIndice,
    conteudoDestaques,
  }: {
    aba?: Aba;
    /** Quantos destaques o livro tem (no rótulo da aba). */
    quantidade?: number;
    conteudoIndice: Snippet;
    conteudoDestaques: Snippet;
  } = $props();

  const ABAS: Aba[] = ["indice", "destaques"];
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

<div class="abas" role="tablist" aria-label="Conteúdo do painel" tabindex="-1" onkeydown={aoTeclar}>
  <button
    type="button"
    role="tab"
    id="aba-indice"
    aria-selected={aba === "indice"}
    aria-controls="painel-aba-indice"
    tabindex={aba === "indice" ? 0 : -1}
    bind:this={botoes.indice}
    onclick={() => (aba = "indice")}
  >
    Índice
  </button>
  <button
    type="button"
    role="tab"
    id="aba-destaques"
    aria-selected={aba === "destaques"}
    aria-controls="painel-aba-destaques"
    aria-label={quantidade ? `Destaques (${quantidade})` : "Destaques"}
    tabindex={aba === "destaques" ? 0 : -1}
    bind:this={botoes.destaques}
    onclick={() => (aba = "destaques")}
  >
    Destaques{#if quantidade}<span class="contagem">{quantidade}</span>{/if}
  </button>
</div>

<div id="painel-aba-indice" role="tabpanel" aria-labelledby="aba-indice" hidden={aba !== "indice"}>
  {@render conteudoIndice()}
</div>
<div
  id="painel-aba-destaques"
  role="tabpanel"
  aria-labelledby="aba-destaques"
  hidden={aba !== "destaques"}
>
  {@render conteudoDestaques()}
</div>

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

  [role="tab"] {
    flex: 1;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    gap: 0.35rem;
    min-height: 2rem;
    padding: 0.25rem 0.5rem;
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

  .contagem {
    min-width: 1.25rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--destaque-suave);
    color: var(--destaque);
    font-size: 0.75rem;
    font-weight: 600;
  }
</style>
