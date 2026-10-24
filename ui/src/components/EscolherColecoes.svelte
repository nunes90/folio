<script lang="ts">
  import type { Colecao } from "../lib/biblioteca";

  // "Adicionar à coleção…": uma caixa por coleção (marcar ou desmarcar já aplica) e um campo
  // para criar uma coleção nova, que já entra marcada. Concluir ou Esc fecham.
  let {
    aberto,
    titulo,
    colecoes,
    marcadas,
    onAlternar,
    onCriar,
    onFechar,
  }: {
    aberto: boolean;
    /** Título do livro. */
    titulo: string;
    colecoes: Colecao[];
    /** Ids das coleções em que o livro está. */
    marcadas: number[];
    onAlternar: (colecao: number, marcar: boolean) => void;
    /** Cria (e já adiciona); devolve a mensagem de erro, ou null se deu certo. */
    onCriar: (nome: string) => Promise<string | null>;
    onFechar: () => void;
  } = $props();

  let dialogo: HTMLDialogElement;
  let nova = $state("");
  let erro = $state<string | null>(null);

  $effect(() => {
    if (aberto && !dialogo.open) {
      nova = "";
      erro = null;
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true; // jsdom (testes) não tem showModal
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

  async function criar(e: SubmitEvent) {
    e.preventDefault();
    erro = await onCriar(nova);
    if (!erro) nova = "";
  }
</script>

<dialog class="modal" bind:this={dialogo} aria-labelledby="titulo-colecoes" onclose={onFechar}>
  <h2 id="titulo-colecoes">Coleções de {titulo}</h2>

  {#if colecoes.length}
    <fieldset>
      <legend class="so-leitor-de-tela">Coleções</legend>
      {#each colecoes as colecao (colecao.id)}
        <label class="opcao">
          <input
            type="checkbox"
            checked={marcadas.includes(colecao.id)}
            onchange={(e) => onAlternar(colecao.id, e.currentTarget.checked)}
          />
          {colecao.nome}
        </label>
      {/each}
    </fieldset>
  {:else}
    <p class="vazio">Ainda não há coleções. Crie a primeira abaixo.</p>
  {/if}

  <form onsubmit={criar}>
    <label for="nova-colecao">Nova coleção</label>
    <div class="linha">
      <input
        id="nova-colecao"
        bind:value={nova}
        autocomplete="off"
        aria-invalid={erro ? "true" : undefined}
        aria-describedby={erro ? "erro-nova-colecao" : undefined}
      />
      <button type="submit">Criar e adicionar</button>
    </div>
    <p id="erro-nova-colecao" class="erro" role="alert">{erro ?? ""}</p>
  </form>

  <div class="botoes">
    <button type="button" class="primario" onclick={fechar}>Concluir</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(28rem, 90vw);
  }

  h2 {
    margin-block: 0 0.75rem;
    font-size: 1.25rem;
  }

  fieldset {
    display: grid;
    gap: 0.15rem;
    max-height: 16rem;
    overflow-y: auto;
    margin: 0 0 1rem;
    padding: 0;
    border: 0;
  }

  .opcao {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.25rem;
    padding-inline: 0.4rem;
    border-radius: var(--raio);
  }

  .opcao:hover {
    background: var(--hover);
  }

  .vazio {
    color: var(--suave);
  }

  form label {
    font-weight: 600;
  }

  .linha {
    display: flex;
    gap: 0.5rem;
    margin-block-start: 0.3rem;
  }

  .linha input {
    flex: 1;
    min-width: 0;
    min-height: 2.25rem;
    padding-inline: 0.6rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    background: var(--card);
    color: var(--texto);
  }

  .linha input[aria-invalid="true"] {
    border-width: 2px;
  }

  button {
    border-radius: var(--raio);
  }

  .erro {
    margin: 0.3rem 0 0;
    font-size: 0.9rem;
  }

  .erro:empty {
    display: none;
  }

  .botoes {
    display: flex;
    justify-content: flex-end;
    margin-block-start: 1.25rem;
  }

  .primario {
    border-color: var(--destaque);
    background: var(--destaque);
    color: var(--sobre-destaque);
    font-weight: 600;
  }
</style>
