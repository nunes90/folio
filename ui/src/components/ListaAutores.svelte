<script lang="ts">
  import { tick } from "svelte";
  import type { Autor } from "../lib/autores";

  // Lista de autores (área principal da biblioteca). Uma só parada de Tab: ↑↓, Home e End
  // andam, como nas estantes. `focar` (a chave de um autor) recebe o foco ao montar: é o
  // autor de onde se voltou.
  let {
    autores,
    focar,
    onEscolher,
  }: {
    autores: Autor[];
    focar?: string | null;
    onEscolher: (chave: string) => void;
  } = $props();

  let lista: HTMLUListElement;
  let ativo = $state(0);

  function botoes(): HTMLButtonElement[] {
    return [...lista.querySelectorAll<HTMLButtonElement>("button")];
  }

  function irPara(i: number) {
    ativo = Math.max(0, Math.min(i, autores.length - 1));
    botoes()[ativo]?.focus();
  }

  $effect(() => {
    if (focar === undefined || focar === null) return;
    const i = autores.findIndex((a) => a.chave === focar);
    if (i >= 0) tick().then(() => irPara(i));
  });

  // Se a lista encolher (busca), o índice ativo continua válido.
  $effect(() => {
    if (ativo >= autores.length) ativo = Math.max(0, autores.length - 1);
  });

  function aoTeclar(e: KeyboardEvent) {
    const destinos: Record<string, () => number> = {
      ArrowDown: () => ativo + 1,
      ArrowUp: () => ativo - 1,
      Home: () => 0,
      End: () => autores.length - 1,
    };
    const destino = destinos[e.key];
    if (!destino) return;
    e.preventDefault();
    irPara(destino());
  }
</script>

<!-- As setas são tratadas no <ul> (delegação): o evento sobe do botão focado. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul bind:this={lista} aria-label="Autores" onkeydown={aoTeclar}>
  {#each autores as autor, i (autor.chave)}
    <li>
      <button
        type="button"
        tabindex={i === ativo ? 0 : -1}
        onfocus={() => (ativo = i)}
        onclick={() => onEscolher(autor.chave)}
      >
        <span class="nome">{autor.nome}</span>
        <span class="quantidade">{autor.quantidade}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  ul {
    display: grid;
    gap: 0.15rem;
    max-width: 36rem;
    margin: 1rem 0 0;
    padding: 0;
    list-style: none;
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 2.5rem;
    padding: 0.4rem 0.75rem;
    border: 0;
    border-radius: var(--raio);
    background: transparent;
    color: var(--texto);
    text-align: start;
  }

  button:hover {
    background: var(--hover);
  }

  .nome {
    flex: 1;
  }

  .quantidade {
    font-variant-numeric: tabular-nums;
    color: var(--suave);
  }
</style>
