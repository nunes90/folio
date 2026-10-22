<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    aberto,
    titulo,
    rotuloConfirmar,
    onConfirmar,
    onCancelar,
    children,
  }: {
    aberto: boolean;
    titulo: string;
    rotuloConfirmar: string;
    onConfirmar: () => void;
    onCancelar: () => void;
    /** Texto explicando a consequência da ação. */
    children: Snippet;
  } = $props();

  let dialogo: HTMLDialogElement;
  let cancelar: HTMLButtonElement;
  /** Evita chamar onCancelar quando o fechamento veio do botão de confirmar. */
  let confirmado = false;

  // <dialog> modal: prende o foco, fecha com Esc e devolve o foco a quem o abriu.
  $effect(() => {
    if (aberto && !dialogo.open) {
      confirmado = false;
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true; // jsdom (testes) não tem showModal
      // Foco em Cancelar: um Enter distraído não confirma uma ação destrutiva.
      cancelar.focus();
    } else if (!aberto && dialogo.open) {
      fechar();
    }
  });

  /** Fecha como o navegador: o evento "close" avisa o pai (jsdom não tem close()). */
  function fechar() {
    if (dialogo.close) {
      dialogo.close();
    } else {
      dialogo.open = false;
      dialogo.dispatchEvent(new Event("close"));
    }
  }

  function confirmar() {
    confirmado = true;
    fechar();
    onConfirmar();
  }
</script>

<dialog
  class="modal"
  bind:this={dialogo}
  aria-labelledby="titulo-confirmacao"
  aria-describedby="texto-confirmacao"
  onclose={() => !confirmado && onCancelar()}
>
  <h2 id="titulo-confirmacao">{titulo}</h2>
  <div id="texto-confirmacao">{@render children()}</div>
  <div class="botoes">
    <button type="button" bind:this={cancelar} onclick={fechar}>Cancelar</button>
    <button type="button" class="perigo" onclick={confirmar}>{rotuloConfirmar}</button>
  </div>
</dialog>

<style>
  /* Aparência e animação comuns em app.css (dialog.modal). */
  dialog {
    max-width: min(32rem, 90vw);
  }

  h2 {
    margin-block-start: 0;
    font-size: 1.25rem;
  }

  .botoes {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-block-start: 1.5rem;
  }

  .perigo {
    font-weight: 600;
  }
</style>
