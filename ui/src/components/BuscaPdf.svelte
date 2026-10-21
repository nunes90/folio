<script lang="ts">
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
  <button type="button" onclick={() => termo.trim() && onBuscar(termo, true)}>Anterior</button>
  <button type="submit">Próxima</button>
  <span role="status">{resultado}</span>
</form>

<style>
  form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  span {
    min-width: 6rem;
  }
</style>
