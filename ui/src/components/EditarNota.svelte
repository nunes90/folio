<script lang="ts">
  // Diálogo da nota de um destaque: o trecho (como citação) e um campo de texto. Salvar com o
  // campo vazio apaga a nota (o destaque fica). Ctrl+Enter salva, Esc cancela.
  import { resumo } from "../lib/destaques";

  let {
    aberto,
    trecho,
    valorInicial = "",
    onSalvar,
    onCancelar,
  }: {
    aberto: boolean;
    trecho: string;
    valorInicial?: string;
    onSalvar: (nota: string) => void;
    onCancelar: () => void;
  } = $props();

  let dialogo: HTMLDialogElement;
  let campo: HTMLTextAreaElement;
  let nota = $state("");
  /** Fechado por Salvar não conta como cancelar. */
  let salvando = false;

  $effect(() => {
    if (aberto && !dialogo.open) {
      nota = valorInicial;
      salvando = false;
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true; // jsdom (testes) não tem showModal
      campo.focus();
    } else if (!aberto && dialogo.open) {
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

  function salvar(e?: Event) {
    e?.preventDefault();
    salvando = true;
    onSalvar(nota);
    fechar();
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) salvar(e);
  }
</script>

<dialog
  class="modal"
  bind:this={dialogo}
  aria-labelledby="titulo-nota"
  onclose={() => !salvando && onCancelar()}
>
  <form onsubmit={salvar}>
    <h2 id="titulo-nota">Nota do destaque</h2>
    <blockquote>{resumo(trecho, 240)}</blockquote>
    <label for="campo-nota">Nota</label>
    <textarea
      id="campo-nota"
      bind:this={campo}
      bind:value={nota}
      rows="5"
      aria-describedby="dica-nota"
      onkeydown={aoTeclar}
    ></textarea>
    <p id="dica-nota" class="dica">Ctrl+Enter salva. Deixe vazio para apagar a nota.</p>
    <div class="botoes">
      <button type="button" onclick={fechar}>Cancelar</button>
      <button type="submit" class="primario">Salvar</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(32rem, 90vw);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  h2 {
    margin-block: 0 0.5rem;
    font-size: 1.25rem;
  }

  blockquote {
    margin: 0 0 0.75rem;
    padding-inline-start: 0.75rem;
    border-inline-start: 3px solid var(--destaque);
    color: var(--suave);
    font-style: italic;
  }

  label {
    font-weight: 600;
  }

  textarea {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    background: var(--card);
    color: var(--texto);
    font: inherit;
    resize: vertical;
  }

  .dica {
    margin: 0;
    color: var(--suave);
    font-size: 0.875rem;
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
