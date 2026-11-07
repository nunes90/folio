<script lang="ts">
  import { PAGINAS, resolverPagina, type Pagina, type PaginaEfetiva } from "../lib/pagina";
  import type { ModoPdf, Preferencias } from "../lib/preferencias.svelte";
  import type { TemaEfetivo } from "../lib/temas";
  import type { EstiloVirada } from "../lib/virada";

  // A página, na aba Leitura do painel Aparência (M28b), igual nos dois formatos: o papel (mesmos
  // nomes e amostras; a implementação difere, ver lib/pagina.ts), a virada e, só no PDF, a
  // exibição.
  let {
    preferencias,
    onMudar,
    formato,
    interface: interface_,
  }: {
    preferencias: Preferencias;
    onMudar: (mudancas: Partial<Preferencias>) => void;
    formato: "epub" | "pdf";
    /** Tema efetivo da interface: diz o que a "Automática" está usando. */
    interface: TemaEfetivo;
  } = $props();

  const agora = $derived(resolverPagina("automatica", interface_));
  const PAGINAS_FIXAS = Object.entries(PAGINAS) as [PaginaEfetiva, (typeof PAGINAS)[PaginaEfetiva]][];

  /** A linha de ajuda sob as amostras: o que a escolhida faz. */
  const ajuda = $derived(
    preferencias.pagina === "automatica"
      ? `Automática: segue a interface (agora, ${PAGINAS[agora].nome.toLowerCase()}).`
      : `${PAGINAS[preferencias.pagina].nome}: ${PAGINAS[preferencias.pagina].descricao}.`,
  );

  const VIRADAS: { valor: EstiloVirada; nome: string }[] = [
    { valor: "nenhuma", nome: "Nenhuma" },
    { valor: "esmaecer", nome: "Esmaecer" },
    { valor: "deslizar", nome: "Deslizar" },
    { valor: "virar", nome: "Virar a folha" },
  ];

  const MODOS: { valor: ModoPdf; nome: string }[] = [
    { valor: "paginas", nome: "Página a página" },
    { valor: "rolagem", nome: "Rolagem contínua" },
  ];

  function escolher(pagina: Pagina) {
    onMudar({ pagina });
  }
</script>

{#snippet amostra(pagina: PaginaEfetiva)}
  <!-- Amostra decorativa: o nome já está no rótulo. -->
  <span
    class="amostra"
    style:background={PAGINAS[pagina].papel}
    style:color={PAGINAS[pagina].tinta}
    aria-hidden="true">Aa</span
  >
{/snippet}

<section class="painel" aria-labelledby="titulo-pagina">
  <h3 id="titulo-pagina">Página</h3>

  <fieldset>
    <legend>Cor da página</legend>
    <div class="amostras">
      <label>
        <input
          type="radio"
          name="pagina"
          value="automatica"
          checked={preferencias.pagina === "automatica"}
          onchange={() => escolher("automatica")}
        />
        {@render amostra(agora)}
        Automática
      </label>
      {#each PAGINAS_FIXAS as [valor, estilo] (valor)}
        <label>
          <input
            type="radio"
            name="pagina"
            value={valor}
            checked={preferencias.pagina === valor}
            onchange={() => escolher(valor)}
          />
          {@render amostra(valor)}
          {estilo.nome}
        </label>
      {/each}
    </div>
    <p class="ajuda">{ajuda}</p>
    {#if formato === "pdf"}
      <p class="ajuda">No PDF, a página é um desenho: as cores tingem ou invertem a página inteira.</p>
    {:else if interface_ === "alto-contraste"}
      <p class="ajuda">Com a interface em alto contraste, a página também fica em alto contraste.</p>
    {/if}
  </fieldset>

  {#if formato === "pdf"}
    <fieldset>
      <legend>Exibição</legend>
      <div class="segmentado">
        {#each MODOS as modo (modo.valor)}
          <label>
            <input
              type="radio"
              name="modo-pdf"
              value={modo.valor}
              checked={preferencias.modoPdf === modo.valor}
              onchange={() => onMudar({ modoPdf: modo.valor })}
            />
            {modo.nome}
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <fieldset>
    <legend>Virada de página</legend>
    <div class="segmentado">
      {#each VIRADAS as v (v.valor)}
        <label>
          <input
            type="radio"
            name="virada"
            value={v.valor}
            checked={preferencias.virada === v.valor}
            onchange={() => onMudar({ virada: v.valor })}
          />
          {v.nome}
        </label>
      {/each}
    </div>
    {#if preferencias.virada !== "nenhuma"}
      <p class="ajuda">A virada se repete centenas de vezes num livro: "Nenhuma" cansa menos.</p>
    {/if}
  </fieldset>
</section>

<style>
  .painel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    margin-block-end: 1.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .amostra {
    display: grid;
    place-items: center;
    width: 100%;
    height: 2.25rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio-pequeno);
    font-family: Georgia, serif;
    font-weight: 600;
  }
</style>
