<script lang="ts">
  // "Sobre o Folio" (M26e): a versão, a licença e o aviso de que não há garantia, que a GPL pede
  // em programas interativos. Pela paleta (Ctrl+K).
  import pacote from "../../package.json";

  let { aberto, onFechar }: { aberto: boolean; onFechar: () => void } = $props();

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

<dialog class="modal" bind:this={dialogo} aria-labelledby="titulo-sobre" onclose={onFechar}>
  <h2 id="titulo-sobre">Folio</h2>
  <p class="versao">Versão {pacote.version}</p>
  <p>Leitor de EPUB e PDF para Linux, feito para ser lido de qualquer jeito: com o teclado, com leitor de tela, em voz alta.</p>
  <p>Copyright © 2026 nunes90.</p>
  <p>
    O Folio é software livre: você pode redistribuí-lo e modificá-lo sob os termos da GNU General
    Public License, versão 3 ou (a seu critério) qualquer versão posterior.
  </p>
  <p>
    <strong>O Folio vem sem nenhuma garantia</strong>, nem mesmo a de ser comercializável ou adequado
    a um fim específico. Os detalhes estão na licença, no arquivo LICENSE.
  </p>
  <p>Inclui componentes de terceiros, listados no arquivo THIRD-PARTY-NOTICES.md.</p>
  <p>Código-fonte: <span class="endereco">https://github.com/nunes90/folio</span></p>
  <form method="dialog">
    <button type="submit">Fechar</button>
  </form>
</dialog>

<style>
  /* Aparência e animação comuns em app.css (dialog.modal). */
  dialog {
    max-width: min(32rem, 90vw);
  }

  h2 {
    margin-block: 0 0.1rem;
  }

  p {
    margin-block: 0 0.6rem;
  }

  .versao {
    color: var(--suave);
  }

  .endereco {
    overflow-wrap: anywhere;
  }

  form {
    margin-block-start: 1rem;
    text-align: end;
  }
</style>
