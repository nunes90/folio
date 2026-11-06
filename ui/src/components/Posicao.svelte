<script lang="ts">
  // Slider de posição no livro, igual nos dois formatos: arrastar (ou clicar na trilha) leva a
  // qualquer ponto; no teclado, ←/→ e ↑/↓ dão um passo, PageUp/PageDown um décimo, Home/End as
  // pontas. Ao arrastar com o ponteiro, um balão diz aonde se vai (a seção). No teclado, sem balão:
  // o leitor de tela ouve o mesmo pelo aria-valuetext, e texto que muda perto do foco derruba o
  // WebKitGTK com o Orca (CLAUDE.md, "Roteiro da voz com o Orca"). Só navega ao soltar (no teclado,
  // quando as teclas param), não a cada passo.
  import { untrack } from "svelte";
  import { valorPelaTecla } from "../lib/posicao";

  let {
    valor,
    min,
    max,
    passo,
    grande,
    rotulo,
    texto,
    rtl = false,
    onIr,
  }: {
    valor: number;
    min: number;
    max: number;
    /** Passo das setas; o do arrasto é sempre 1 (a menor unidade do valor). */
    passo: number;
    /** Passo de PageUp/PageDown. */
    grande: number;
    rotulo: string;
    /** O que se diz de um valor (aria-valuetext e o balão). */
    texto: (v: number) => string;
    /** Livro da direita para a esquerda: o começo fica à direita. */
    rtl?: boolean;
    onIr: (v: number) => void;
  } = $props();

  /** O valor escolhido e ainda não alcançado (arrastando, teclando ou esperando o livro chegar). */
  let local = $state<number | null>(null);
  const mostrado = $derived(Math.min(max, Math.max(min, local ?? valor)));
  const fracao = $derived(max > min ? (mostrado - min) / (max - min) : 0);

  let esperaTeclas: ReturnType<typeof setTimeout> | undefined;
  let esperaChegada: ReturnType<typeof setTimeout> | undefined;
  let indo = false;
  let arrastando = $state(false);

  function ir(v: number) {
    clearTimeout(esperaTeclas);
    local = v;
    indo = true;
    onIr(v);
    // Se o livro já estava ali (o valor não muda), o balão não fica para sempre.
    clearTimeout(esperaChegada);
    esperaChegada = setTimeout(soltar, 1500);
  }

  function soltar() {
    clearTimeout(esperaChegada);
    indo = false;
    local = null;
  }

  // O livro chegou (a posição mudou depois de ir): volta a mostrar a posição real.
  $effect(() => {
    void valor;
    untrack(() => indo && soltar());
  });

  function aoTeclar(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const v = valorPelaTecla(e.key, mostrado, { min, max, passo, grande, rtl });
    if (v === null) return;
    e.preventDefault();
    // Não deixa a tecla chegar ao leitor (as setas virariam a página).
    e.stopPropagation();
    clearTimeout(esperaChegada);
    indo = false;
    local = v;
    clearTimeout(esperaTeclas);
    esperaTeclas = setTimeout(() => ir(v), 350);
  }
</script>

<div class="posicao" style:--fracao={fracao} style:--lado={rtl ? 1 - fracao : fracao}>
  <input
    type="range"
    {min}
    {max}
    step="1"
    value={mostrado}
    dir={rtl ? "rtl" : "ltr"}
    aria-label={rotulo}
    aria-valuetext={texto(mostrado)}
    oninput={(e) => {
      clearTimeout(esperaChegada);
      indo = false;
      local = Number(e.currentTarget.value);
    }}
    onchange={(e) => {
      arrastando = false;
      ir(Number(e.currentTarget.value));
    }}
    onpointerdown={() => (arrastando = true)}
    onpointerup={() => (arrastando = false)}
    onkeydown={aoTeclar}
  />
  {#if arrastando && local !== null}
    <span class="balao" aria-hidden="true">{texto(mostrado)}</span>
  {/if}
</div>

<style>
  .posicao {
    --polegar: 1rem;
    /* Larga o bastante para arrastar com precisão; encolhe antes de o rodapé ficar compacto.
       Largura, e não flex-basis: o WebKitGTK mede o grupo pela largura padrão do controle (129 px). */
    width: 14rem;
    flex: 0 1 auto;
    min-width: 6rem;
    margin-inline: 0.25rem;
    position: relative;
    display: flex;
    align-items: center;
  }

  /* 1,5rem de altura: alvo de toque de 24 px (WCAG 2.5.8), com a trilha fina. */
  input {
    appearance: none;
    width: 100%;
    height: 1.5rem;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }

  input::-webkit-slider-runnable-track {
    height: 0.25rem;
    border-radius: 999px;
    background: linear-gradient(
      to right,
      var(--destaque) calc(var(--fracao) * 100%),
      var(--divisoria) calc(var(--fracao) * 100%)
    );
  }

  input[dir="rtl"]::-webkit-slider-runnable-track {
    background: linear-gradient(
      to left,
      var(--destaque) calc(var(--fracao) * 100%),
      var(--divisoria) calc(var(--fracao) * 100%)
    );
  }

  input::-webkit-slider-thumb {
    appearance: none;
    width: var(--polegar);
    height: var(--polegar);
    margin-top: calc((0.25rem - var(--polegar)) / 2);
    border: 2px solid var(--painel);
    border-radius: 50%;
    background: var(--destaque);
    box-shadow: 0 0 0 1px var(--destaque);
  }

  :global([data-tema="alto-contraste"]) input::-webkit-slider-runnable-track {
    outline: 1px solid var(--borda);
  }

  .balao {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    /* Em cima do polegar (no RTL, o começo fica à direita). */
    left: calc(var(--polegar) / 2 + var(--lado) * (100% - var(--polegar)));
    max-width: min(24rem, 90vw);
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--divisoria);
    border-radius: var(--raio);
    background: var(--card);
    box-shadow: var(--sombra);
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transform: translateX(-50%);
    pointer-events: none;
  }
</style>
