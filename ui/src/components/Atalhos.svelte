<script lang="ts">
  import { NOMES_CONTEXTO, porGrupo, type Atalho, type Contexto } from "../lib/atalhos";

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
      anuncio = "";
      // showModal não existe no jsdom (testes); lá basta marcar como aberto.
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true;
    } else if (!aberto && dialogo.open) {
      dialogo.close();
    }
  });

  /** "Ctrl+K ou F1: Ação": o texto da linha junta as teclas sem espaço ("←ou →"). */
  const anunciar = (atalho: Atalho) =>
    `${atalho.teclas.map((combinacao) => combinacao.join("+")).join(" ou ")}: ${atalho.acao}`;

  // Setas de atalho em atalho. O Orca não lê a linha de tabela que recebe o foco: o texto vai ao anúncio.
  let anuncio = $state("");

  function aoTeclar(e: KeyboardEvent) {
    const linhas = [...dialogo.querySelectorAll<HTMLTableRowElement>("tbody tr")];
    const i = linhas.indexOf(document.activeElement as HTMLTableRowElement);
    const destino =
      e.key === "ArrowDown"
        ? linhas[i + 1]
        : e.key === "ArrowUp"
          ? linhas[i - 1]
          : e.key === "Home"
            ? linhas[0]
            : e.key === "End"
              ? linhas.at(-1)
              : undefined;
    if (!destino) return;
    e.preventDefault();
    destino.focus();
    anuncio = destino.dataset.anuncio ?? "";
  }
</script>

<!-- As setas andam pelas linhas da tabela: tratadas no diálogo, que as recebe dos filhos. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog class="modal" bind:this={dialogo} aria-labelledby="titulo-atalhos" onclose={onFechar} onkeydown={aoTeclar}>
  <!-- role="document" dentro da interface role="application": o Orca lê com as setas. O foco vai ao título, e não
       ao documento: ao foco no próprio documento, o Orca não diz nada. -->
  <div role="document">
  <!-- svelte-ignore a11y_autofocus -->
  <h2 id="titulo-atalhos" tabindex="-1" autofocus>Atalhos de teclado</h2>
  <p class="contexto">{NOMES_CONTEXTO[contexto]}</p>
  <!-- Um grupo por tabela (M26a): Navegação, Leitura, Marcar, Comparar, Livros, Geral. -->
  {#each porGrupo(contexto) as { grupo, atalhos } (grupo)}
    <table>
      <caption>{grupo}</caption>
      <thead>
        <tr>
          <th scope="col">Teclas</th>
          <th scope="col">Ação</th>
        </tr>
      </thead>
      <tbody>
        {#each atalhos as atalho (atalho.acao)}
          <tr tabindex="-1" data-anuncio={anunciar(atalho)}>
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
  {/each}
  </div>
  <p class="so-leitor-de-tela" role="status">{anuncio}</p>
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
    margin-block: 0 0.25rem;
  }

  .contexto {
    margin-block: 0 1rem;
    color: var(--suave);
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  table + table {
    margin-block-start: 1.25rem;
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
