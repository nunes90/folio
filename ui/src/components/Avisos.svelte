<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import { avisos, dispensar, DURACAO_AVISO_MS, type Aviso } from "../lib/avisos.svelte";
  import Icone from "./Icone.svelte";

  // As duas regiões existem sempre: leitores de tela só anunciam o que muda dentro de uma
  // região que já estava na página. Sucesso é educado (status); erro interrompe (alert).
  const sucessos = $derived(avisos.filter((a) => a.tipo !== "erro"));
  const erros = $derived(avisos.filter((a) => a.tipo === "erro"));

  /** Some sozinho depois de DURACAO_AVISO_MS, mas para enquanto o ponteiro ou o foco estão nele. */
  function temporizar(no: HTMLElement, aviso: Aviso) {
    // Erro fica até ser fechado; progresso some quando o trabalho termina.
    if (aviso.tipo !== "sucesso") return;
    let restante = DURACAO_AVISO_MS;
    let inicio = 0;
    let espera: ReturnType<typeof setTimeout> | undefined;
    // Ponteiro e foco contam separado: sair com o mouse não retoma se o foco ainda está lá.
    const pausas = new Set<string>();

    function correr() {
      inicio = Date.now();
      espera = setTimeout(() => dispensar(aviso.id), restante);
    }
    function pausar(motivo: string) {
      if (!pausas.size) {
        clearTimeout(espera);
        restante -= Date.now() - inicio;
      }
      pausas.add(motivo);
    }
    function retomar(motivo: string) {
      pausas.delete(motivo);
      if (!pausas.size) correr();
    }

    const eventos: [string, () => void][] = [
      ["mouseenter", () => pausar("ponteiro")],
      ["mouseleave", () => retomar("ponteiro")],
      ["focusin", () => pausar("foco")],
      ["focusout", () => retomar("foco")],
    ];
    for (const [nome, f] of eventos) no.addEventListener(nome, f);
    correr();
    return {
      destroy() {
        clearTimeout(espera);
        for (const [nome, f] of eventos) no.removeEventListener(nome, f);
      },
    };
  }
</script>

{#snippet lista(itens: Aviso[])}
  <ul>
    {#each itens as aviso (aviso.id)}
      <li
        class={aviso.tipo}
        use:temporizar={aviso}
        in:fly={{ y: 12, duration: duracao("media"), easing: curva }}
        out:fade={{ duration: duracao("curta"), easing: curva }}
      >
        <p>{aviso.texto}</p>
        <button type="button" aria-label="Fechar aviso" onclick={() => dispensar(aviso.id)}>
          <Icone nome="fechar" />
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

<section class="avisos" aria-label="Avisos">
  <div role="alert">{@render lista(erros)}</div>
  <div role="status">{@render lista(sucessos)}</div>
</section>

<style>
  /* Canto de baixo, por cima de tudo, sem bloquear cliques fora dos avisos. */
  .avisos {
    position: fixed;
    inset-block-end: 1rem;
    inset-inline-end: 1rem;
    z-index: 10;
    width: min(24rem, calc(100vw - 2rem));
    pointer-events: none;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  div + div ul:not(:empty) {
    margin-block-start: 0.5rem;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 0.5rem 0.65rem 0.9rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--card);
    color: var(--texto);
    box-shadow: var(--sombra);
    pointer-events: auto;
  }

  /* Erro: borda forte além do texto ("Não foi possível…"); a cor não é a única pista. */
  li.erro {
    border-color: var(--borda);
    border-inline-start-width: 4px;
  }

  :global([data-tema="alto-contraste"]) li {
    border-color: var(--borda);
  }

  p {
    flex: 1;
    margin: 0;
  }

  button {
    display: inline-grid;
    place-items: center;
    flex: none;
    min-width: 2rem;
    min-height: 2rem;
    padding: 0;
    border-color: transparent;
    border-radius: var(--raio);
    background: transparent;
    color: var(--suave);
  }

  button:hover {
    background: var(--hover);
    color: var(--texto);
  }
</style>
