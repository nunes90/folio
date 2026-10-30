<script lang="ts">
  import { PAGINAS, resolverPagina, type Pagina, type PaginaEfetiva } from "../lib/pagina";
  import { LIMITES, type ModoPdf, type Preferencias } from "../lib/preferencias.svelte";
  import type { TemaEfetivo } from "../lib/temas";
  import type { EstiloVirada } from "../lib/virada";

  // Seção "Página" do painel Aparência, igual nos dois formatos: o papel (mesmos nomes e
  // amostras; a implementação difere, ver lib/pagina.ts), a virada, o modo foco e, só no PDF, a
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
  const v = $derived(preferencias.velocidadeVoz);
  const PAGINAS_FIXAS = Object.entries(PAGINAS) as [PaginaEfetiva, (typeof PAGINAS)[PaginaEfetiva]][];

  const VIRADAS: { valor: EstiloVirada; nome: string }[] = [
    { valor: "esmaecer", nome: "Esmaecer (sugerido)" },
    { valor: "deslizar", nome: "Deslizar" },
    { valor: "virar", nome: "Virar a folha" },
    { valor: "nenhuma", nome: "Nenhuma" },
  ];

  const MODOS: { valor: ModoPdf; nome: string; descricao: string }[] = [
    { valor: "paginas", nome: "Página a página", descricao: "como um livro (sugerido)" },
    { valor: "rolagem", nome: "Rolagem contínua", descricao: "todas as páginas em sequência" },
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

<div class="painel">
  <h2>Página</h2>

  <fieldset>
    <legend>Cor da página</legend>
    <label class="opcao">
      <input
        type="radio"
        name="pagina"
        value="automatica"
        checked={preferencias.pagina === "automatica"}
        onchange={() => escolher("automatica")}
      />
      {@render amostra(agora)}
      <span>
        Automática
        <span class="descricao">segue a interface (agora: {PAGINAS[agora].nome.toLowerCase()})</span>
      </span>
    </label>
    {#each PAGINAS_FIXAS as [valor, estilo] (valor)}
      <label class="opcao">
        <input
          type="radio"
          name="pagina"
          value={valor}
          checked={preferencias.pagina === valor}
          onchange={() => escolher(valor)}
        />
        {@render amostra(valor)}
        <span>
          {estilo.nome}
          <span class="descricao">{estilo.descricao}</span>
        </span>
      </label>
    {/each}
  </fieldset>

  <p class="nota">
    {#if formato === "pdf"}
      No PDF, a página é um desenho: as cores tingem ou invertem a página inteira, figuras
      inclusive. No EPUB, o texto se adapta de verdade.
    {:else}
      No EPUB, o texto e o fundo mudam de verdade. No PDF, que é um desenho, as mesmas cores
      tingem ou invertem a página.
    {/if}
  </p>
  {#if formato === "epub" && interface_ === "alto-contraste"}
    <p class="nota">
      Com a interface em alto contraste, a página do EPUB também fica em alto contraste.
    </p>
  {/if}

  <fieldset>
    <legend>Virada de página</legend>
    {#each VIRADAS as v (v.valor)}
      <label class="opcao">
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
  </fieldset>

  <fieldset>
    <legend>Modo foco</legend>
    <label class="opcao">
      <input
        type="checkbox"
        checked={preferencias.barrasSoPeloTeclado}
        onchange={(e) => onMudar({ barrasSoPeloTeclado: e.currentTarget.checked })}
      />
      <span>
        Mostrar as barras só pelo teclado
        <span class="descricao">com Tab; o ponteiro nas bordas não as revela</span>
      </span>
    </label>
  </fieldset>

  {#if formato === "pdf"}
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

    <!-- No EPUB, fica na seção Texto, que o PDF não tem. -->
    <div class="velocidade">
      <label for="pref-velocidade-voz">Velocidade da leitura em voz alta</label>
      <output for="pref-velocidade-voz">
        {v === 0 ? "normal" : v > 0 ? `+${v}` : v}
      </output>
      <input
        id="pref-velocidade-voz"
        type="range"
        min={LIMITES.velocidadeVoz.min}
        max={LIMITES.velocidadeVoz.max}
        step={LIMITES.velocidadeVoz.passo}
        value={v}
        oninput={(e) => onMudar({ velocidadeVoz: Number(e.currentTarget.value) })}
      />
    </div>
  {/if}
</div>

<style>
  .velocidade {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 0.5rem;
  }

  .velocidade input {
    grid-column: 1 / -1;
    width: 100%;
  }

  .painel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-block-end: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
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

  .descricao {
    display: block;
    color: var(--suave);
    font-size: 0.875rem;
  }

  .nota {
    margin: -0.25rem 0 0;
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
