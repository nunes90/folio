<script lang="ts">
  import { ATALHOS, NOMES_CONTEXTO, type Contexto } from "../lib/atalhos";

  let {
    contexto,
    aberto,
    onFechar,
  }: {
    contexto: Contexto;
    aberto: boolean;
    onFechar: () => void;
  } = $props();

  let dialogo: HTMLDialogElement;

  // <dialog> modal: prende o foco dentro, fecha com Esc e devolve o foco a quem o abriu.
  $effect(() => {
    if (aberto && !dialogo.open) {
      // showModal não existe no jsdom (testes); lá basta marcar como aberto.
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true;
    } else if (!aberto && dialogo.open) {
      dialogo.close();
    }
  });
</script>

<dialog class="modal" bind:this={dialogo} aria-labelledby="titulo-atalhos" onclose={onFechar}>
  <h2 id="titulo-atalhos">Atalhos de teclado</h2>
  <table>
    <caption>{NOMES_CONTEXTO[contexto]}</caption>
    <thead>
      <tr>
        <th scope="col">Teclas</th>
        <th scope="col">Ação</th>
      </tr>
    </thead>
    <tbody>
      {#each ATALHOS[contexto] as atalho (atalho.acao)}
        <tr>
          <td>
            {#each atalho.teclas as combinacao, i (i)}
              {#if i > 0}<span class="ou">ou</span>{/if}
              {#each combinacao as tecla, j (j)}
                {#if j > 0}+{/if}<kbd>{tecla}</kbd>
              {/each}
            {/each}
          </td>
          <td>{atalho.acao}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <form method="dialog">
    <button type="submit">Fechar</button>
  </form>
</dialog>

<style>
  /* Aparência e animação comuns em app.css (dialog.modal). */
  dialog {
    max-width: min(40rem, 90vw);
  }

  h2 {
    margin-block-start: 0;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  caption {
    text-align: start;
    font-weight: 600;
    padding-block-end: 0.5rem;
  }

  th,
  td {
    padding: 0.4rem 0.5rem;
    border-block-end: 1px solid var(--borda);
    text-align: start;
    vertical-align: top;
  }

  /* Tecla física: borda de baixo mais grossa, como a tecla vista de lado. */
  kbd {
    display: inline-block;
    min-width: 1.6rem;
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--borda);
    border-block-end-width: 2px;
    border-radius: var(--raio-pequeno);
    background: var(--card);
    font: inherit;
    font-size: 0.875em;
    font-weight: 600;
    text-align: center;
  }

  /* Margem em vez de espaços no texto: o Svelte remove espaços nas pontas. */
  .ou {
    margin-inline: 0.4rem;
    color: var(--suave);
  }

  form {
    margin-block-start: 1rem;
    text-align: end;
  }
</style>
