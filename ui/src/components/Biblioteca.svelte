<script lang="ts">
  import { urlDaCapa, type Livro } from "../lib/biblioteca";

  let {
    livros,
    importando = false,
    aviso = null,
    onAbrir,
    onImportar,
  }: {
    livros: Livro[];
    importando?: boolean;
    /** Resultado da última importação ou erro, anunciado por leitores de tela. */
    aviso?: string | null;
    onAbrir: (livro: Livro) => void;
    onImportar: () => void;
  } = $props();

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

  function situacao(livro: Livro): string {
    if (livro.fracao == null) return "Não iniciado";
    // Sem isso, um livro recém-aberto apareceria como "0% lido", igual a não iniciado.
    if (livro.fracao > 0 && livro.fracao < 0.01) return "menos de 1% lido";
    return `${porcento.format(livro.fracao)} lido`;
  }

  /** Iniciais para a capa substituta (livros sem capa). */
  function iniciais(titulo: string): string {
    return titulo
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("");
  }
</script>

<main>
  <header>
    <h1>Biblioteca</h1>
    <button type="button" onclick={onImportar} disabled={importando}>
      {importando ? "Importando…" : "Importar livros…"}
    </button>
  </header>

  <!-- Sempre no DOM: regiões aria-live só anunciam mudanças em elementos que já existiam. -->
  <p class="aviso" role="status">{aviso ?? ""}</p>

  {#if livros.length === 0}
    <p class="vazia">Sua biblioteca está vazia. Importe um EPUB ou PDF para começar.</p>
  {:else}
    <ul>
      {#each livros as livro (livro.id)}
        {@const capa = urlDaCapa(livro)}
        <li>
          <button type="button" onclick={() => onAbrir(livro)}>
            {#if capa}
              <!-- alt vazio: o título logo abaixo já identifica o livro. -->
              <img src={capa} alt="" loading="lazy" />
            {:else}
              <span class="capa-substituta" aria-hidden="true">{iniciais(livro.titulo)}</span>
            {/if}
            <span class="titulo">{livro.titulo}</span>
            {#if livro.autores.length}
              <span class="autores">{livro.autores.join(", ")}</span>
            {/if}
            <span class="situacao">{situacao(livro)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    padding: 1rem 1.5rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .aviso:empty {
    margin: 0;
  }

  .vazia {
    margin-top: 3rem;
    text-align: center;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: 1.5rem;
    margin: 1rem 0 0;
    padding: 0;
    list-style: none;
  }

  li button {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    padding: 0.5rem;
    border: 0;
    border-radius: 0.5rem;
    background: none;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }

  li button:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  img,
  .capa-substituta {
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: 0.25rem;
    object-fit: cover;
    box-shadow: 0 0.1rem 0.4rem rgb(0 0 0 / 30%);
  }

  .capa-substituta {
    display: grid;
    place-items: center;
    font-size: 2rem;
    font-weight: 600;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .titulo {
    font-weight: 600;
  }

  .autores,
  .situacao {
    font-size: 0.875rem;
    opacity: 0.8;
  }
</style>
