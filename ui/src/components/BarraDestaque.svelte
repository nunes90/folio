<script lang="ts">
  // Barra sobre o trecho selecionado (ou sobre um destaque clicado): as cores, Nota, Copiar e,
  // num destaque que já existe, Apagar. Padrão ARIA de toolbar: uma parada de Tab, setas
  // entre os botões, Esc fecha. Aberta pelo mouse, não rouba o foco (a seleção continua);
  // aberta pelo teclado (Ctrl+D), o foco vai para a primeira cor.
  import { tick } from "svelte";
  import type { CorDestaque } from "../lib/biblioteca";
  import { CORES_DESTAQUE } from "../lib/destaques";
  import Icone from "./Icone.svelte";

  let {
    x,
    y,
    abaixo = false,
    corAtual = null,
    focar = false,
    onCor,
    onNota,
    onCopiar,
    onApagar,
    onFechar,
  }: {
    /** Centro do trecho, em coordenadas da janela. */
    x: number;
    /** Topo do trecho (ou a base, com `abaixo`), em coordenadas da janela. */
    y: number;
    /** Sem espaço acima do trecho: a barra fica embaixo. */
    abaixo?: boolean;
    /** Cor do destaque existente (marcada com aria-pressed); null numa seleção nova. */
    corAtual?: CorDestaque | null;
    /** Leva o foco à barra ao abrir (aberta pelo teclado). */
    focar?: boolean;
    onCor: (cor: CorDestaque) => void;
    onNota: () => void;
    onCopiar: () => void;
    /** Só num destaque existente. */
    onApagar?: () => void;
    onFechar: () => void;
  } = $props();

  let barra = $state<HTMLDivElement>();
  let largura = $state(0);
  let ativo = $state(0);
  const MARGEM = 8;

  // Centralizada no trecho, sem sair da janela.
  const esquerda = $derived(
    Math.max(MARGEM, Math.min(x - largura / 2, window.innerWidth - largura - MARGEM)),
  );

  function botoes(): HTMLButtonElement[] {
    return barra ? [...barra.querySelectorAll<HTMLButtonElement>("button")] : [];
  }

  function focarBotao(i: number) {
    const todos = botoes();
    if (!todos.length) return;
    ativo = (i + todos.length) % todos.length;
    todos[ativo]!.focus();
  }

  // Mede a largura ao abrir e quando a posição muda (centralizar sem sair da janela).
  $effect(() => {
    void x;
    largura = barra?.offsetWidth ?? 0;
  });

  $effect(() => {
    if (!focar) return;
    tick().then(() => focarBotao(0));
  });

  function aoTeclar(e: KeyboardEvent) {
    const n = botoes().length;
    if (e.key === "ArrowRight") focarBotao(ativo + 1);
    else if (e.key === "ArrowLeft") focarBotao(ativo - 1);
    else if (e.key === "Home") focarBotao(0);
    else if (e.key === "End") focarBotao(n - 1);
    else if (e.key === "Escape") onFechar();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div
  class="barra-destaque"
  role="toolbar"
  aria-label="Destaque"
  tabindex="-1"
  bind:this={barra}
  style:left="{esquerda}px"
  style:top="{y}px"
  class:abaixo
  onkeydown={aoTeclar}
>
  {#each CORES_DESTAQUE as cor, i (cor.valor)}
    <button
      type="button"
      class="cor"
      aria-label={cor.nome}
      aria-pressed={corAtual ? corAtual === cor.valor : undefined}
      title={cor.nome}
      tabindex={i === ativo ? 0 : -1}
      style:--amostra={cor.hex}
      onclick={() => onCor(cor.valor)}
    ></button>
  {/each}
  <span class="separador" aria-hidden="true"></span>
  <button
    type="button"
    tabindex={ativo === CORES_DESTAQUE.length ? 0 : -1}
    onclick={onNota}
  >
    <Icone nome="nota" /><span class="rotulo">Nota</span>
  </button>
  <button
    type="button"
    tabindex={ativo === CORES_DESTAQUE.length + 1 ? 0 : -1}
    onclick={onCopiar}
  >
    <Icone nome="copiar" /><span class="rotulo">Copiar</span>
  </button>
  {#if onApagar}
    <button
      type="button"
      tabindex={ativo === CORES_DESTAQUE.length + 2 ? 0 : -1}
      onclick={onApagar}
    >
      <Icone nome="lixeira" /><span class="rotulo">Apagar</span>
    </button>
  {/if}
</div>

<style>
  /* Flutua sobre o livro, acima do trecho (ou abaixo, sem espaço). */
  .barra-destaque {
    position: fixed;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--card);
    box-shadow: var(--sombra);
    transform: translateY(calc(-100% - 0.5rem));
    animation: surgir var(--duracao-curta) var(--curva);
  }

  .barra-destaque.abaixo {
    transform: translateY(0.5rem);
  }

  :global([data-tema="alto-contraste"]) .barra-destaque {
    border-color: var(--borda);
  }

  @keyframes surgir {
    from {
      opacity: 0;
    }
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.55rem;
    border-color: transparent;
    border-radius: var(--raio);
    background: transparent;
    white-space: nowrap;
  }

  button:hover {
    background: var(--hover);
  }

  /* Amostra redonda; marcada (a cor atual) com anel e não só com a cor. */
  .cor {
    width: 2rem;
    min-width: 2rem;
    height: 2rem;
    min-height: 2rem;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 50%;
    background: var(--amostra);
    background-clip: content-box;
  }

  .cor:hover {
    background: var(--amostra);
    background-clip: content-box;
    border-color: var(--divisoria);
  }

  .cor[aria-pressed="true"] {
    border-color: var(--texto);
    padding: 2px;
  }

  .separador {
    width: 1px;
    align-self: stretch;
    margin-inline: 0.15rem;
    background: var(--divisoria);
  }
</style>
