<script lang="ts">
  // Destaque fixado ao lado do texto (M25a): o trecho inteiro, a cor e o motivo em palavras, o
  // capítulo e a nota, para ler outro ponto do livro com ele à vista. Igual no EPUB e no PDF;
  // a MolduraLeitor põe os cartões numa coluna à direita do livro (numa janela que não tem
  // largura para ela, numa faixa embaixo dele).
  import { fly } from "svelte/transition";
  import type { Destaque } from "../lib/biblioteca";
  import { curva, duracao } from "../lib/animacao";
  import { hexDaCor, nomeDaCor, nomeDoMotivo } from "../lib/destaques";
  import Icone from "./Icone.svelte";

  let {
    destaque,
    onIr,
    onNota,
    onDesafixar,
    onAbrirAoLado,
  }: {
    destaque: Destaque;
    onIr: () => void;
    onNota: () => void;
    onDesafixar: () => void;
    /** Abre o trecho no lado novo, para lê-lo em volta (M25b). */
    onAbrirAoLado?: () => void;
  } = $props();
</script>

<aside
  class="cartao"
  aria-labelledby="titulo-fixado-{destaque.id}"
  style:--cor-destaque={hexDaCor(destaque.cor)}
  transition:fly={{ x: 16, duration: duracao("media"), easing: curva }}
>
  <h2 id="titulo-fixado-{destaque.id}">Fixado</h2>
  <blockquote>{destaque.trecho}</blockquote>
  <p class="meta">
    {nomeDaCor(destaque.cor)}{destaque.motivo ? ` · ${nomeDoMotivo(destaque.motivo)}` : ""}{destaque.capitulo
      ? ` · ${destaque.capitulo}`
      : ""}
  </p>
  {#if destaque.nota}<p class="nota">{destaque.nota}</p>{/if}
  <div class="botoes">
    <button type="button" onclick={onIr}>
      <Icone nome="proxima" /><span class="rotulo">Ir até lá</span>
    </button>
    {#if onAbrirAoLado}
      <button type="button" onclick={onAbrirAoLado}>
        <Icone nome="largura" /><span class="rotulo">Abrir ao lado</span>
      </button>
    {/if}
    <button type="button" onclick={onNota}>
      <Icone nome="nota" /><span class="rotulo">{destaque.nota ? "Editar nota" : "Nota"}</span>
    </button>
    <button type="button" onclick={onDesafixar}>
      <Icone nome="fechar" /><span class="rotulo">Desafixar</span>
    </button>
  </div>
</aside>

<style>
  .cartao {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: none;
    box-sizing: border-box;
    width: 18rem;
    max-width: 100%;
    padding: 0.85rem 1rem;
    overflow: auto;
    background: var(--painel);
    color: var(--texto);
    border: 1px solid var(--divisoria);
    border-radius: var(--raio-grande);
    box-shadow: var(--sombra);
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    color: var(--suave);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  blockquote {
    margin: 0;
    padding-inline-start: 0.75rem;
    border-inline-start: 4px solid var(--cor-destaque);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
  }

  .meta {
    font-size: 0.85rem;
    color: var(--suave);
  }

  .nota {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .botoes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  /* Alto contraste: a borda forte é o que separa o cartão (como nos painéis). */
  :global([data-tema="alto-contraste"]) .cartao {
    border-color: var(--borda);
  }
</style>
