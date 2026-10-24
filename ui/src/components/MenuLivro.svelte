<script lang="ts">
  import { tick } from "svelte";
  import { fade } from "svelte/transition";
  import { curva, duracao } from "../lib/animacao";
  import type { Livro } from "../lib/biblioteca";
  import Icone from "./Icone.svelte";

  /** O que dá para fazer com um livro (quem recebe decide como, ex.: confirmar apagar). */
  export type AcaoLivro =
    | "favorito"
    | "para-ler"
    | "lido"
    | "colecoes"
    | "tirar-da-colecao"
    | "lixeira"
    | "restaurar"
    | "apagar";

  // Menu "Mais ações" de um livro, no padrão ARIA de menu: o botão ⋯ abre; o foco vai ao
  // primeiro item; ↑↓/Home/End andam; Enter escolhe; Esc e Tab fecham. Quem envolve controla
  // `aberto` (a biblioteca também o abre pela tecla Menu, Shift+F10 e clique direito).
  let {
    livro,
    aberto,
    onAlternar,
    onFechar,
    onAcao,
    naColecao = false,
  }: {
    livro: Livro;
    aberto: boolean;
    /** Na vista de uma coleção: oferece "Tirar desta coleção". */
    naColecao?: boolean;
    onAlternar: () => void;
    /** Fechar devolve o foco a quem abriu (decisão de quem envolve). */
    onFechar: () => void;
    onAcao: (acao: AcaoLivro) => void;
  } = $props();

  const itens = $derived.by(() => {
    if (livro.removidoEm !== null) {
      return [
        { acao: "restaurar" as const, nome: "Restaurar" },
        { acao: "apagar" as const, nome: "Apagar de vez…" },
      ];
    }
    const lista: { acao: AcaoLivro; nome: string }[] = [
      { acao: "favorito", nome: livro.favoritoEm !== null ? "Tirar dos favoritos" : "Favoritar" },
      {
        acao: "para-ler",
        nome: livro.paraLerEm !== null ? "Tirar de Para ler" : "Adicionar a Para ler",
      },
    ];
    // Lido pelo progresso (sem marca manual): já está em "Lidos"; não há o que marcar.
    if (livro.lidoEm !== null) lista.push({ acao: "lido", nome: "Desmarcar como lido" });
    else if (livro.situacao !== "concluido") lista.push({ acao: "lido", nome: "Marcar como lido" });
    lista.push({ acao: "colecoes", nome: "Adicionar à coleção…" });
    if (naColecao) lista.push({ acao: "tirar-da-colecao", nome: "Tirar desta coleção" });
    lista.push({ acao: "lixeira", nome: "Mover para a lixeira" });
    return lista;
  });

  const idMenu = $derived(`menu-livro-${livro.id}`);
  let menu = $state<HTMLUListElement>();

  function botoes(): HTMLButtonElement[] {
    return menu ? [...menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]")] : [];
  }

  // Ao abrir, o foco vai ao primeiro item.
  $effect(() => {
    if (!aberto) return;
    tick().then(() => botoes()[0]?.focus());
  });

  function aoTeclar(e: KeyboardEvent) {
    const todos = botoes();
    const i = todos.indexOf(document.activeElement as HTMLButtonElement);
    const destinos: Record<string, () => number> = {
      ArrowDown: () => (i + 1) % todos.length,
      ArrowUp: () => (i - 1 + todos.length) % todos.length,
      Home: () => 0,
      End: () => todos.length - 1,
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onFechar();
    } else if (e.key === "Tab") {
      onFechar();
    } else if (destinos[e.key]) {
      e.preventDefault();
      todos[destinos[e.key]!()]?.focus();
    }
  }

  function escolher(acao: AcaoLivro) {
    onFechar();
    onAcao(acao);
  }
</script>

<div class="menu-livro">
  <!-- Fora da ordem do Tab: no teclado, a tecla Menu ou Shift+F10 no livro abre o menu. -->
  <button
    type="button"
    class="mais"
    tabindex="-1"
    aria-label="Mais ações para {livro.titulo}"
    aria-haspopup="menu"
    aria-expanded={aberto}
    aria-controls={aberto ? idMenu : undefined}
    onclick={onAlternar}
  >
    <Icone nome="reticencias" />
  </button>
  {#if aberto}
    <ul
      bind:this={menu}
      id={idMenu}
      role="menu"
      aria-label="Ações para {livro.titulo}"
      tabindex="-1"
      onkeydown={aoTeclar}
      transition:fade={{ duration: duracao("curta"), easing: curva }}
    >
      {#each itens as item (item.acao)}
        <li role="none">
          <button type="button" role="menuitem" tabindex="-1" onclick={() => escolher(item.acao)}>
            {item.nome}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* Na linha de ações do card; o menu abre acima, alinhado à direita (o card fica no fim
     da página quando é a última linha da grade). */
  .menu-livro {
    position: relative;
  }

  .mais {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border-color: transparent;
    border-radius: var(--raio);
    background: transparent;
    color: var(--suave);
    font-size: 1.1rem;
  }

  .mais:hover {
    background: var(--hover);
    color: var(--texto);
  }

  :global([data-tema="alto-contraste"]) .mais {
    border-color: var(--borda);
  }

  .mais :global(svg) {
    stroke-width: 3.5;
  }

  ul {
    position: absolute;
    inset-block-end: calc(100% + 0.25rem);
    inset-inline-end: 0;
    z-index: 3;
    min-width: 13rem;
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

  [role="menuitem"] {
    display: block;
    width: 100%;
    padding: 0.45rem 0.7rem;
    border: 0;
    border-radius: var(--raio);
    background: transparent;
    color: var(--texto);
    text-align: start;
    white-space: nowrap;
  }

  [role="menuitem"]:hover,
  [role="menuitem"]:focus-visible {
    background: var(--hover);
  }
</style>
