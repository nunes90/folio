<script lang="ts">
  // Os controles do lado (M25b/M25c), no rodapé da moldura, embaixo do lado: os mesmos do
  // principal (menos a voz), passados como `children`, e "Fechar o lado". Sem textos que mudam
  // de tamanho a cada página (o nome da seção fazia os controles pularem de lugar). O lado não
  // tem barra própria: as duas áreas do livro ficam com a mesma altura.
  import type { Snippet } from "svelte";
  import Icone from "./Icone.svelte";

  let { onFechar, children }: { onFechar: () => void; children: Snippet } = $props();
</script>

{@render children()}
<button type="button" aria-keyshortcuts="Control+Shift+L" onclick={onFechar} data-fim-rodape>
  <Icone nome="fechar" /><span class="rotulo">Fechar o lado</span>
</button>
