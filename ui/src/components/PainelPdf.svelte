<script lang="ts">
  import { PAGINAS_PDF, type PaginaPdf } from "../lib/paginaPdf";
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

  const PAGINAS = Object.entries(PAGINAS_PDF) as [PaginaPdf, (typeof PAGINAS_PDF)[PaginaPdf]][];
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

<fieldset>
  <legend>Página</legend>
  {#each PAGINAS as [valor, estilo] (valor)}
    <label class="opcao">
      <input
        type="radio"
        name="pagina-pdf"
        value={valor}
        checked={preferencias.paginaPdf === valor}
        onchange={() => onMudar({ paginaPdf: valor })}
      />
      <!-- Amostra: as cores que o branco e o preto da página assumem com este preset. -->
      <span class="amostra" style:background={estilo.papel} style:color={estilo.tinta} aria-hidden="true"
        >Aa</span
      >
      <span>
        {estilo.nome}
        <span class="descricao">{estilo.descricao}</span>
      </span>
    </label>
  {/each}
</fieldset>

<style>
  .amostra {
    display: grid;
    place-items: center;
    flex: none;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio-pequeno);
    font-family: Georgia, serif;
    font-weight: 600;
  }

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
