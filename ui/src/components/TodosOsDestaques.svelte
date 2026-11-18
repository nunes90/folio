<script lang="ts">
  // A estante "Destaques" (M42b): os destaques de todos os livros, agrupados por livro, com a
  // busca da biblioteca (o termo vem de fora) e um filtro por motivo. Escolher um destaque abre o
  // livro nele. A lista é pedida ao core quando a estante aparece.
  import { onMount } from "svelte";
  import { listarTodosOsDestaques, type Destaque, type Livro, type MotivoDestaque } from "../lib/biblioteca";
  import { hexDaCor, MOTIVOS, nomeDaCor, nomeDoMotivo, resumo } from "../lib/destaques";
  import { agruparDestaques, resumoDaEstante } from "../lib/todosOsDestaques";
  import { log } from "../lib/log";

  let {
    livros,
    termo,
    onAbrir,
    onLimparBusca,
    carregar = listarTodosOsDestaques,
  }: {
    livros: Livro[];
    termo: string;
    onAbrir: (livro: Livro, destaque: Destaque) => void;
    onLimparBusca: () => void;
    /** De onde vêm os destaques (trocado nos testes). */
    carregar?: () => Promise<Destaque[]>;
  } = $props();

  let destaques = $state<Destaque[] | null>(null);
  let erro = $state<string | null>(null);
  let motivo = $state<MotivoDestaque | null>(null);
  const grupos = $derived(destaques ? agruparDestaques(destaques, livros, termo, motivo) : []);
  const algum = $derived(!!destaques && agruparDestaques(destaques, livros, "", null).length > 0);

  onMount(() => {
    carregar()
      .then((lista) => (destaques = lista))
      .catch((e) => {
        log.warn(`destaques da biblioteca: ${e}`);
        erro = `Não foi possível carregar os destaques: ${e}`;
      });
  });
</script>

<div class="cabeca"><h2>Destaques</h2></div>

{#if erro}
  <p role="alert">{erro}</p>
{:else if destaques && !algum}
  <div class="sem-resultado">
    <p>Nenhum destaque ainda. No leitor, selecione um trecho e escolha uma cor, ou use <kbd>Ctrl</kbd>+<kbd>D</kbd>.</p>
  </div>
{:else if destaques}
  <fieldset>
    <legend class="so-leitor-de-tela">Motivo</legend>
    <div class="segmentado motivos">
      <label>
        <input type="radio" name="motivo-destaques" checked={motivo === null} onchange={() => (motivo = null)} />
        Todos
      </label>
      {#each MOTIVOS as m (m.valor)}
        <label>
          <input
            type="radio"
            name="motivo-destaques"
            checked={motivo === m.valor}
            onchange={() => (motivo = m.valor)}
          />
          {m.nome}
        </label>
      {/each}
    </div>
  </fieldset>

  <p class="resumo" role="status">{resumoDaEstante(grupos)}</p>

  {#if !grupos.length}
    <div class="sem-resultado">
      {#if termo.trim()}
        <p>Nenhum destaque encontrado para “{termo.trim()}”.</p>
        <button type="button" onclick={onLimparBusca}>Limpar busca</button>
      {:else}
        <p>Nenhum destaque com esse motivo.</p>
      {/if}
    </div>
  {/if}

  {#each grupos as grupo (grupo.livro.id)}
    <section aria-labelledby="destaques-de-{grupo.livro.id}">
      <h3 id="destaques-de-{grupo.livro.id}">{grupo.livro.titulo}</h3>
      <ul>
        {#each grupo.destaques as d (d.id)}
          <li style:--cor-destaque={hexDaCor(d.cor)}>
            <button type="button" onclick={() => onAbrir(grupo.livro, d)}>
              <span class="texto">{resumo(d.trecho, 200)}</span>
              <span class="meta">
                {nomeDaCor(d.cor)}{d.motivo ? ` · ${nomeDoMotivo(d.motivo)}` : ""}{d.capitulo ? ` · ${d.capitulo}` : ""}
              </span>
              {#if d.nota}<span class="nota">{d.nota}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
{/if}

<style>
  .cabeca {
    margin-block-start: 1rem;
  }

  h2 {
    margin: 0;
  }

  .motivos {
    max-width: 28rem;
    margin-block: 0.75rem 0.25rem;
  }

  .resumo {
    margin: 0.25rem 0 0;
    color: var(--suave);
    font-size: 0.875rem;
  }

  section {
    max-width: 48rem;
    margin-block-start: 1.25rem;
  }

  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    gap: 0.25rem;
    border-block-end: 1px solid var(--divisoria);
  }

  /* Faixa com a cor do destaque (a cor também está escrita na linha de baixo). */
  li::before {
    content: "";
    flex: none;
    width: 4px;
    margin-block: 0.45rem;
    border-radius: 2px;
    background: var(--cor-destaque);
  }

  li button {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    padding: 0.5rem;
    border: 0;
    border-radius: var(--raio-pequeno);
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  li button:hover {
    background: var(--hover);
  }

  .meta {
    color: var(--suave);
    font-size: 0.8125rem;
  }

  .nota {
    padding-inline-start: 0.5rem;
    border-inline-start: 2px solid var(--divisoria);
    font-size: 0.875rem;
    white-space: pre-line;
  }

  .sem-resultado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin-block-start: 3rem;
    text-align: center;
  }

  .sem-resultado p {
    margin: 0;
    color: var(--suave);
  }

  kbd {
    padding: 0 0.25rem;
    border: 1px solid var(--borda);
    border-block-end-width: 2px;
    border-radius: var(--raio-pequeno);
    font: inherit;
    font-size: 0.85em;
    font-weight: 600;
  }
</style>
