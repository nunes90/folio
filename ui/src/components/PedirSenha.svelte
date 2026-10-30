<script lang="ts">
  // PDF com senha de usuário (M26b): o pdf.js pede a senha (onPassword) antes de abrir. A senha
  // não é guardada: é pedida a cada vez que o PDF abre. Errada, o diálogo diz isso e pede de
  // novo; cancelar deixa o PDF fechado (o leitor diz que ele é protegido por senha).
  let {
    aberto,
    erradas = 0,
    onConfirmar,
    onCancelar,
  }: {
    aberto: boolean;
    /** Quantas senhas já foram recusadas (a cada uma, o campo esvazia e o alerta aparece). */
    erradas?: number;
    onConfirmar: (senha: string) => void;
    onCancelar: () => void;
  } = $props();

  let dialogo: HTMLDialogElement;
  let campo: HTMLInputElement;
  let senha = $state("");
  /** Fechado por Abrir (o pai fecha ao dar certo) não conta como cancelar. */
  let fechandoPorCancelar = true;

  $effect(() => {
    if (aberto && !dialogo.open) {
      senha = "";
      fechandoPorCancelar = true;
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true; // jsdom (testes) não tem showModal
      campo.focus();
    } else if (!aberto && dialogo.open) {
      fechandoPorCancelar = false;
      fechar();
    }
  });

  const incorreta = $derived(erradas > 0);

  // Senha errada (cada uma): o campo esvazia e volta a ter o foco.
  $effect(() => {
    if (aberto && erradas > 0) {
      senha = "";
      campo.focus();
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
    // O diálogo continua aberto até o pai fechá-lo (senha certa): Cancelar depois de uma
    // senha errada ainda é cancelar.
    onConfirmar(senha);
  }
</script>

<dialog
  class="modal"
  bind:this={dialogo}
  aria-labelledby="titulo-pedir-senha"
  aria-describedby="explica-senha"
  onclose={() => fechandoPorCancelar && onCancelar()}
>
  <form onsubmit={enviar}>
    <h2 id="titulo-pedir-senha">PDF protegido por senha</h2>
    <p id="explica-senha" class="explica">Digite a senha para abrir. Ela não fica guardada.</p>
    <label for="campo-senha">Senha</label>
    <input
      id="campo-senha"
      type="password"
      bind:this={campo}
      bind:value={senha}
      autocomplete="off"
      aria-invalid={incorreta ? "true" : undefined}
      aria-describedby={incorreta ? "erro-senha" : undefined}
    />
    <p id="erro-senha" class="erro" role="alert">{incorreta ? "Senha incorreta. Tente de novo." : ""}</p>
    <div class="botoes">
      <button type="button" onclick={fechar}>Cancelar</button>
      <button type="submit" class="primario">Abrir</button>
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

  .explica {
    margin: 0 0 0.5rem;
    color: var(--suave);
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
