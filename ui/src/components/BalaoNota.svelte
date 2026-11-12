<script lang="ts">
  // A nota de rodapé num balão sobre o texto (M35b): clicar na chamada da nota (ou Enter nela)
  // mostra a nota sem sair da página. Não é modal: o foco vem para o balão, e Esc, "Fechar" ou um
  // clique fora o fecham e devolvem o foco ao texto. "Ir até a nota" leva ao lugar dela no livro
  // (Alt+← volta).
  import { tick } from "svelte";
  import type { Nota } from "../lib/notas";

  let {
    nota,
    x,
    y,
    abaixo,
    onIr,
    onFechar,
  }: {
    nota: Nota;
    /** O centro e o topo (ou a base, com `abaixo`) da chamada da nota, na janela. */
    x: number;
    y: number;
    abaixo: boolean;
    onIr: () => void;
    onFechar: () => void;
  } = $props();

  const MARGEM = 8;
  let balao = $state<HTMLElement>();
  let largura = $state(0);
  const esquerda = $derived(
    Math.max(MARGEM, Math.min(x - largura / 2, window.innerWidth - largura - MARGEM)),
  );

  // Mede a largura ao abrir e quando a nota ou a posição mudam (centralizar sem sair da janela),
  // e o foco vem para o balão (o leitor de tela lê o título e a nota).
  $effect(() => {
    void nota;
    void x;
    largura = balao?.offsetWidth ?? 0;
    tick().then(() => balao?.focus());
  });

  function aoTeclar(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    // Só fecha o balão: o Esc não segue para a moldura (fecharia um painel ou o modo foco).
    e.preventDefault();
    e.stopPropagation();
    onFechar();
  }
</script>

<div
  class="balao-nota"
  class:abaixo
  role="dialog"
  aria-modal="false"
  aria-labelledby="titulo-nota"
  tabindex="-1"
  bind:this={balao}
  style:left="{esquerda}px"
  style:top="{y}px"
  onkeydown={aoTeclar}
>
  <h2 id="titulo-nota">{nota.titulo}</h2>
  <div class="texto">
    {#each nota.paragrafos as paragrafo, i (i)}
      <p>{paragrafo}</p>
    {/each}
  </div>
  <div class="botoes">
    <button type="button" onclick={onIr}>Ir até a nota</button>
    <button type="button" class="discreto" onclick={onFechar}>Fechar</button>
  </div>
</div>

<style>
  /* Flutua sobre o livro, acima da chamada da nota (ou abaixo, sem espaço), como a barra de destaque. */
  .balao-nota {
    position: fixed;
    z-index: 20;
    width: min(28rem, calc(100vw - 1rem));
    padding: 0.75rem 1rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    background: var(--card);
    box-shadow: var(--sombra);
    transform: translateY(calc(-100% - 0.5rem));
    animation: surgir var(--duracao-curta) var(--curva);
  }

  .balao-nota.abaixo {
    transform: translateY(0.5rem);
  }

  /* O foco vem ao balão ao abrir (também pelo mouse): a borda em destaque diz onde ele está, sem o
     contorno grosso do foco em volta do cartão inteiro. Os botões mantêm o foco visível de sempre. */
  .balao-nota:focus-visible {
    outline: none;
    border-color: var(--destaque);
  }

  :global([data-tema="alto-contraste"]) .balao-nota {
    border-color: var(--borda);
  }

  @keyframes surgir {
    from {
      opacity: 0;
    }
  }

  h2 {
    margin: 0 0 0.4rem;
    color: var(--suave);
    font-size: 0.875rem;
    font-weight: 600;
  }

  /* Nota longa: rola dentro do balão, sem cobrir a tela inteira. */
  .texto {
    max-height: 40vh;
    overflow-y: auto;
  }

  p {
    margin: 0 0 0.5rem;
    line-height: 1.5;
  }

  .botoes {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
</style>
