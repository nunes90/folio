<script lang="ts">
  // "Mais opções" no cabeçalho do leitor (M26a): o que não se usa em toda sessão sai da barra
  // e fica aqui (e na paleta, e no atalho de cada um). Padrão ARIA de menu: o botão abre; o
  // foco vai ao primeiro item; ↑↓/Home/End andam; Enter ou espaço escolhem; Esc fecha e devolve
  // o foco ao botão; Tab e um clique fora fecham. Itens de liga/desliga são menuitemcheckbox.
  import { tick } from "svelte";
  import { fade } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import Icone from "./Icone.svelte";

  export interface ItemMenuLeitor {
    id: string;
    nome: string;
    /** Liga/desliga: marcado ou não (sem o campo, é uma ação simples). */
    marcado?: boolean;
    /** A tecla, como aparece ("Ctrl+Shift+B") e para o aria-keyshortcuts ("Control+Shift+B"). */
    teclas?: string;
    atalho?: string;
    executar: () => void;
  }

  let { itens }: { itens: ItemMenuLeitor[] } = $props();

  let aberto = $state(false);
  let botao: HTMLButtonElement;
  let menu = $state<HTMLUListElement>();
  let raiz: HTMLDivElement;

  function itensDoMenu(): HTMLElement[] {
    return menu ? [...menu.querySelectorAll<HTMLElement>("[role^=menuitem]")] : [];
  }

  async function abrir() {
    aberto = true;
    await tick();
    itensDoMenu()[0]?.focus();
  }

  function fechar(devolverFoco: boolean) {
    aberto = false;
    if (devolverFoco) botao.focus();
  }

  function escolher(item: ItemMenuLeitor) {
    fechar(true);
    item.executar();
  }

  function aoTeclar(e: KeyboardEvent) {
    const todos = itensDoMenu();
    const i = todos.indexOf(document.activeElement as HTMLElement);
    const destinos: Record<string, () => number> = {
      ArrowDown: () => (i + 1) % todos.length,
      ArrowUp: () => (i - 1 + todos.length) % todos.length,
      Home: () => 0,
      End: () => todos.length - 1,
    };
    if (e.key === "Escape") {
      // Só fecha o menu: o Esc não chega à moldura (que sairia de um modo).
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
    } else if (e.key === "Tab") {
      fechar(false);
    } else if (destinos[e.key]) {
      e.preventDefault();
      todos[destinos[e.key]!()]?.focus();
    }
  }

  /** Clique fora do menu o fecha (sem roubar o foco de onde o clique foi). */
  function aoApontarFora(e: PointerEvent) {
    if (aberto && !raiz.contains(e.target as Node)) fechar(false);
  }
</script>

<svelte:window onpointerdown={aoApontarFora} />

<div class="menu-leitor" bind:this={raiz}>
  <button
    type="button"
    bind:this={botao}
    aria-haspopup="menu"
    aria-expanded={aberto}
    aria-controls={aberto ? "menu-leitor" : undefined}
    onclick={() => (aberto ? fechar(false) : void abrir())}
  >
    <Icone nome="reticencias" /><span class="rotulo">Mais opções</span>
  </button>
  {#if aberto}
    <ul
      bind:this={menu}
      id="menu-leitor"
      role="menu"
      aria-label="Mais opções"
      tabindex="-1"
      onkeydown={aoTeclar}
      transition:fade={{ duration: duracao("curta"), easing: curva }}
    >
      {#each itens as item (item.id)}
        <li role="none">
          <button
            type="button"
            role={item.marcado === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.marcado}
            aria-keyshortcuts={item.atalho}
            tabindex="-1"
            onclick={() => escolher(item)}
          >
            <span class="marca" aria-hidden="true">
              {#if item.marcado}<Icone nome="lido" />{/if}
            </span>
            <span class="nome">{item.nome}</span>
            {#if item.teclas}<span class="teclas" aria-hidden="true">{item.teclas}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .menu-leitor {
    position: relative;
  }

  /* Abre embaixo do botão, alinhado à direita (o botão fica no fim do cabeçalho). */
  ul {
    position: absolute;
    inset-block-start: calc(100% + 0.35rem);
    inset-inline-end: 0;
    z-index: 5;
    min-width: 17rem;
    margin: 0;
    padding: 0.3rem;
    list-style: none;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--card);
    box-shadow: var(--sombra);
  }

  :global([data-tema="alto-contraste"]) ul {
    border-color: var(--borda);
  }

  [role^="menuitem"] {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 0;
    border-radius: var(--raio);
    background: transparent;
    color: var(--texto);
    text-align: start;
    white-space: nowrap;
  }

  [role^="menuitem"]:hover,
  [role^="menuitem"]:focus-visible {
    background: var(--hover);
  }

  .marca {
    display: inline-grid;
    place-items: center;
    width: 1.1rem;
    color: var(--destaque);
  }

  .nome {
    flex: 1;
  }

  .teclas {
    color: var(--suave);
    font-size: 0.85rem;
  }
</style>
