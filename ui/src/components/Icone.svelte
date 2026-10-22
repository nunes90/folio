<script lang="ts">
  // Ícones em SVG (traço na cor do texto). Decorativos: o botão que os contém precisa de
  // um rótulo próprio (aria-label ou texto).
  const CAMINHOS = {
    fechar: "M6 6l12 12M18 6L6 18",
  } as const;

  let { nome }: { nome: keyof typeof CAMINHOS } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  width="1em"
  height="1em"
  aria-hidden="true"
  focusable="false"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  stroke-linecap="round"
>
  <path d={CAMINHOS[nome]} />
</svg>
