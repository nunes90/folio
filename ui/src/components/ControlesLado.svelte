<script lang="ts">
  // Os controles do lado (M25b), no rodapé da moldura, embaixo do lado: a seção, as páginas
  // e fechar. Iguais no EPUB e no PDF. O lado não tem barra própria: as duas áreas do livro
  // ficam com a mesma altura e paginam igual.
  import Icone from "./Icone.svelte";

  let {
    secao,
    posicao,
    onAnterior,
    onProxima,
    onFechar,
  }: {
    /** A seção em que o lado está (vazia antes de carregar). */
    secao: string;
    /** Onde o lado está: "45%" no EPUB, "12 de 300" no PDF. */
    posicao: string;
    onAnterior: () => void;
    onProxima: () => void;
    onFechar: () => void;
  } = $props();
</script>

<span class="secao" title={secao}>{secao || "Ao lado"}</span>
<div class="grupo-barra" role="group" aria-label="Páginas deste lado">
  <button type="button" aria-label="Página anterior deste lado" onclick={onAnterior}>
    <Icone nome="anterior" />
  </button>
  <span class="posicao">{posicao}</span>
  <button type="button" aria-label="Próxima página deste lado" onclick={onProxima}>
    <Icone nome="proxima" />
  </button>
</div>
<button type="button" aria-keyshortcuts="Control+Shift+L" onclick={onFechar}>
  <Icone nome="fechar" /><span class="rotulo">Fechar o lado</span>
</button>

<style>
  .secao {
    min-width: 0;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--suave);
  }

  .posicao {
    min-width: 3ch;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
