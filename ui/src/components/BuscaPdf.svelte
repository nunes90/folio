<script lang="ts">
  import Icone from "./Icone.svelte";

  let {
    resultado = "",
    onBuscar,
    campo = $bindable(),
  }: {
    /** Texto do resultado ("3 de 12", "Nada encontrado"), anunciado por leitores de tela. */
    resultado?: string;
    /** `anterior` busca para trás; com o mesmo termo, avança para a próxima ocorrência. */
    onBuscar: (termo: string, anterior: boolean) => void;
    /** O campo de texto, para o pai dar foco (Ctrl+F). */
    campo?: HTMLInputElement;
  } = $props();

  let termo = $state("");

  function aoEnviar(e: SubmitEvent) {
    e.preventDefault();
    if (termo.trim()) onBuscar(termo, false);
  }

  function aoTeclar(e: KeyboardEvent) {
    // Shift+Enter busca para trás, como na maioria dos leitores.
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (termo.trim()) onBuscar(termo, true);
    }
  }
</script>

<form role="search" onsubmit={aoEnviar}>
  <input
    type="search"
    aria-label="Buscar no documento"
    placeholder="Buscar…"
    bind:value={termo}
    bind:this={campo}
    onkeydown={aoTeclar}
  />
  <button type="button" onclick={() => termo.trim() && onBuscar(termo, true)}>
    <Icone nome="acima" /><span class="rotulo">Anterior</span>
  </button>
  <button type="submit"><Icone nome="abaixo" /><span class="rotulo">Próxima</span></button>
  <span role="status">{resultado}</span>
</form>

<style>
  /* Encolhe com a janela: o campo cede espaço antes de o cabeçalho cortar botões. */
  form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  input {
    flex: 1 1 12rem;
    min-width: 5rem;
    width: 12rem;
  }

  span[role="status"] {
    min-width: 6rem;
  }

  :global(.estreita) span[role="status"] {
    min-width: 0;
  }
</style>
