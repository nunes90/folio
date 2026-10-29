<script lang="ts">
  // Ícones em SVG (traço na cor do texto). Decorativos: o botão que os contém precisa de
  // um rótulo próprio (aria-label ou texto).
  const CAMINHOS = {
    fechar: "M6 6l12 12M18 6L6 18",
    indice: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
    aparencia: "M4 7V5h11v2M9.5 5v14M7 19h5M14 12v-1.5h7V12M17.5 10.5V19M16 19h3",
    voltar: "M15 18l-6-6 6-6",
    anterior: "M15 18l-6-6 6-6",
    proxima: "M9 18l6-6-6-6",
    acima: "M18 15l-6-6-6 6",
    abaixo: "M6 9l6 6 6-6",
    voz: "M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13",
    pausar: "M9 5v14M15 5v14",
    continuar: "M7 5l12 7-12 7z",
    parar: "M7 7h10v10H7z",
    largura: "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4",
    ideia: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0012 3z",
    foco: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
    nota: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
    copiar: "M9 9h10v11H9zM5 15V4h10",
    dividir: "M4 5h16v14H4zM12 5v14",
    fixar: "M9 4h6M10 4v6l-3 4h10l-3-4V4M12 14v6",
    exportar: "M12 4v11M8 11l4 4 4-4M5 19h14",
    destaque: "M4 20h7M14.5 4.5l5 5L11 18H6v-5z",
    duvida: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.2 9.2a3 3 0 015.6 1.3c0 2-2.8 2.5-2.8 4M12 17.5h.01",
    citar: "M6 8h4v4c0 2.5-1.5 4-4 5M14 8h4v4c0 2.5-1.5 4-4 5",
    revisar: "M4.5 10a8 8 0 0114.3-3.2M19.5 14a8 8 0 01-14.3 3.2M19 3.5v4h-4M5 20.5v-4h4",
    mais: "M12 5v14M5 12h14",
    buscar: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
    grade: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    marcador: "M6 4h12v16l-6-4-6 4z",
    lido: "M5 12.5l4.5 4.5L19 7",
    lixeira: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
    reticencias: "M5 12h.01M12 12h.01M19 12h.01",
    pasta: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
    pessoa: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0",
    estrela:
      "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
    livro: "M12 6.5C10.5 5.3 8.2 4.8 4 5v13c4.2-.2 6.5.3 8 1.5 1.5-1.2 3.8-1.7 8-1.5V5c-4.2-.2-6.5.3-8 1.5zM12 6.5v13",
  } as const;

  let {
    nome,
    preenchido = false,
  }: {
    nome: keyof typeof CAMINHOS;
    /** Forma cheia (ex.: estrela de favorito marcada); o traço continua. */
    preenchido?: boolean;
  } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  width="1em"
  height="1em"
  aria-hidden="true"
  focusable="false"
  fill={preenchido ? "currentColor" : "none"}
  stroke="currentColor"
  stroke-width="2.25"
  stroke-linejoin="round"
  stroke-linecap="round"
>
  <path d={CAMINHOS[nome]} />
</svg>
