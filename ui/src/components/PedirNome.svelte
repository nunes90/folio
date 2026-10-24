<script lang="ts">
  // Diálogo com um campo de nome (nova coleção, renomear). O erro (ex.: nome repetido, vindo
  // do core) aparece ligado ao campo, e o diálogo continua aberto para corrigir.
  let {
    aberto,
    titulo,
    rotuloConfirmar,
    valorInicial = "",
    erro = null,
    onConfirmar,
    onCancelar,
  }: {
    aberto: boolean;
    titulo: string;
    rotuloConfirmar: string;
    valorInicial?: string;
    erro?: string | null;
    onConfirmar: (nome: string) => void;
    onCancelar: () => void;
  } = $props();

  let dialogo: HTMLDialogElement;
  let campo: HTMLInputElement;
  let nome = $state("");
  /** Fechado por Confirmar (o pai fecha ao dar certo) não conta como cancelar. */
  let fechandoPorCancelar = true;

  $effect(() => {
    if (aberto && !dialogo.open) {
      nome = valorInicial;
      fechandoPorCancelar = true;
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true; // jsdom (testes) não tem showModal
      campo.focus();
      campo.select();
    } else if (!aberto && dialogo.open) {
      fechandoPorCancelar = false;
      fechar();
    }
  });

  function fechar() {
    if (dialogo.close) dialogo.close();
    else {
      dialogo.open = false;
      dialogo.dispatchEvent(new Event("close"));
    }
  }

  function enviar(e: SubmitEvent) {
    e.preventDefault();
    onConfirmar(nome);
  }
</script>

<dialog
  class="modal"
  bind:this={dialogo}
  aria-labelledby="titulo-pedir-nome"
  onclose={() => fechandoPorCancelar && onCancelar()}
>
  <form onsubmit={enviar}>
    <h2 id="titulo-pedir-nome">{titulo}</h2>
    <label for="campo-nome">Nome</label>
    <input
      id="campo-nome"
      bind:this={campo}
      bind:value={nome}
      autocomplete="off"
      aria-invalid={erro ? "true" : undefined}
      aria-describedby={erro ? "erro-nome" : undefined}
    />
    <p id="erro-nome" class="erro" role="alert">{erro ?? ""}</p>
    <div class="botoes">
      <button type="button" onclick={fechar}>Cancelar</button>
      <button type="submit" class="primario">{rotuloConfirmar}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(26rem, 90vw);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  h2 {
    margin-block: 0 0.75rem;
    font-size: 1.25rem;
  }

  label {
    font-weight: 600;
  }

  input {
    min-height: 2.25rem;
    padding-inline: 0.6rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    background: var(--card);
    color: var(--texto);
  }

  input[aria-invalid="true"] {
    border-width: 2px;
  }

  /* Sem erro, não ocupa espaço (o elemento existe sempre para o alerta ser anunciado). */
  .erro {
    margin: 0;
    min-height: 0;
    font-size: 0.9rem;
  }

  .erro:empty {
    display: none;
  }

  .botoes {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-block-start: 1rem;
  }

  .botoes button {
    border-radius: var(--raio);
  }

  .primario {
    border-color: var(--destaque);
    background: var(--destaque);
    color: var(--sobre-destaque);
    font-weight: 600;
  }
</style>
