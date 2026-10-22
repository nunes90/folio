<script lang="ts">
  import type { ModoPdf, Preferencias } from "../lib/preferencias.svelte";

  let {
    preferencias,
    onMudar,
  }: {
    preferencias: Preferencias;
    onMudar: (mudancas: Partial<Preferencias>) => void;
  } = $props();

  const MODOS: { valor: ModoPdf; nome: string; descricao: string }[] = [
    { valor: "paginas", nome: "Página a página", descricao: "como um livro (sugerido)" },
    { valor: "rolagem", nome: "Rolagem contínua", descricao: "todas as páginas em sequência" },
  ];
</script>

<fieldset>
  <legend>Exibição do PDF</legend>
  {#each MODOS as modo (modo.valor)}
    <label class="opcao">
      <input
        type="radio"
        name="modo-pdf"
        value={modo.valor}
        checked={preferencias.modoPdf === modo.valor}
        onchange={() => onMudar({ modoPdf: modo.valor })}
      />
      <span>
        {modo.nome}
        <span class="descricao">{modo.descricao}</span>
      </span>
    </label>
  {/each}
</fieldset>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 0 1rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--borda);
    border-radius: 0.25rem;
  }

  legend {
    font-weight: 600;
  }

  .opcao {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.25rem;
  }

  .descricao {
    display: block;
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
