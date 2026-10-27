<script lang="ts">
  // A pausa suave ao cumprir a meta da sessão (M20b): o que foi lido e o que fazer agora. Sem
  // alarme nem comemoração: um diálogo calmo, com "Continuar lendo" em foco (Enter ou Esc segue).
  import { nomeDaMeta, textoDoResumo, type Resumo } from "../lib/meta.svelte";

  let {
    resumo,
    onContinuar,
    onRepetir,
    onVoltar,
  }: {
    resumo: Resumo | null;
    onContinuar: () => void;
    onRepetir: () => void;
    onVoltar: () => void;
  } = $props();

  let dialogo: HTMLDialogElement;
  let continuar: HTMLButtonElement;
  /** O que fechou o diálogo (o Esc não diz: é "continuar"). */
  let escolha: (() => void) | null = null;

  $effect(() => {
    if (resumo && !dialogo.open) {
      escolha = null;
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true; // jsdom (testes) não tem showModal
      continuar.focus();
    } else if (!resumo && dialogo.open) {
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

  function escolher(acao: () => void) {
    escolha = acao;
    fechar();
  }
</script>

<dialog
  class="modal"
  bind:this={dialogo}
  aria-labelledby="titulo-meta"
  aria-describedby="texto-meta"
  onclose={() => (escolha ?? onContinuar)()}
>
  <h2 id="titulo-meta">Meta cumprida</h2>
  <p id="texto-meta">{resumo ? textoDoResumo(resumo) : ""}</p>
  <div class="botoes">
    <button type="button" onclick={() => escolher(onVoltar)}>Voltar à biblioteca</button>
    <button type="button" onclick={() => escolher(onRepetir)}>
      Mais {resumo ? nomeDaMeta(resumo.meta) : ""}
    </button>
    <button type="button" class="principal" bind:this={continuar} onclick={() => escolher(onContinuar)}>
      Continuar lendo
    </button>
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
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-block-start: 1.5rem;
  }

  .principal {
    font-weight: 600;
  }
</style>
