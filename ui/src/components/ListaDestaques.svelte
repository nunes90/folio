<script lang="ts">
  // Destaques do livro, na ordem de leitura (aba "Destaques" do índice). Cada um: o trecho
  // (leva até ele), a cor e o motivo em palavras e o capítulo, a nota; o motivo (seletor) e os
  // botões Nota e Apagar. Filtro por motivo (M18), e o exportar segue o filtro.
  import type { Destaque, MotivoDestaque } from "../lib/biblioteca";
  import { hexDaCor, MOTIVOS, nomeDaCor, nomeDoMotivo, resumo } from "../lib/destaques";
  import Icone from "./Icone.svelte";

  let {
    destaques,
    onIr,
    onNota,
    onApagar,
    onMotivo,
    onExportar,
  }: {
    destaques: Destaque[];
    onIr: (destaque: Destaque) => void;
    onNota: (destaque: Destaque) => void;
    onApagar: (destaque: Destaque) => void;
    onMotivo?: (destaque: Destaque, motivo: MotivoDestaque | null) => void;
    /** Exporta todos (null) ou só os do motivo filtrado. */
    onExportar?: (motivo: MotivoDestaque | null) => void;
  } = $props();

  let filtro = $state<MotivoDestaque | null>(null);
  const visiveis = $derived(filtro ? destaques.filter((d) => d.motivo === filtro) : destaques);
  const contagem = (m: MotivoDestaque) => destaques.filter((d) => d.motivo === m).length;
  const rotuloExportar = $derived(
    filtro
      ? `Exportar só ${MOTIVOS.find((m) => m.valor === filtro)!.exportar}…`
      : "Exportar em Markdown…",
  );
</script>

{#if destaques.length}
  <div class="filtro" role="group" aria-label="Filtrar por motivo">
    <button type="button" aria-pressed={filtro === null} onclick={() => (filtro = null)}>
      Todos <span class="contagem">{destaques.length}</span>
    </button>
    {#each MOTIVOS as m (m.valor)}
      <button type="button" aria-pressed={filtro === m.valor} onclick={() => (filtro = m.valor)}>
        <Icone nome={m.valor} />{m.nome} <span class="contagem">{contagem(m.valor)}</span>
      </button>
    {/each}
  </div>
  {#if onExportar && visiveis.length}
    <button type="button" class="exportar" onclick={() => onExportar(filtro)}>
      <Icone nome="exportar" /><span>{rotuloExportar}</span>
    </button>
  {/if}
  {#if !visiveis.length}
    <p class="vazio">Nenhum destaque com esse motivo.</p>
  {/if}
  <ul aria-label="Destaques" hidden={!visiveis.length}>
    {#each visiveis as destaque (destaque.id)}
      <li style:--cor-destaque={hexDaCor(destaque.cor)}>
        <button type="button" class="trecho" onclick={() => onIr(destaque)}>
          <span class="texto">{resumo(destaque.trecho, 160)}</span>
          <span class="meta">
            {nomeDaCor(destaque.cor)}{destaque.motivo ? ` · ${nomeDoMotivo(destaque.motivo)}` : ""}{destaque.capitulo ? ` · ${destaque.capitulo}` : ""}
          </span>
          {#if destaque.nota}<span class="nota">{destaque.nota}</span>{/if}
        </button>
        <div class="acoes">
          {#if onMotivo}
            <select
              aria-label="Motivo: {resumo(destaque.trecho, 40)}"
              title="Motivo"
              value={destaque.motivo ?? ""}
              onchange={(e) =>
                onMotivo(destaque, (e.currentTarget.value || null) as MotivoDestaque | null)}
            >
              <option value="">Sem motivo</option>
              {#each MOTIVOS as m (m.valor)}<option value={m.valor}>{m.nome}</option>{/each}
            </select>
          {/if}
          <button
            type="button"
            aria-label="{destaque.nota ? 'Editar nota' : 'Adicionar nota'}: {resumo(destaque.trecho, 40)}"
            title={destaque.nota ? "Editar nota" : "Adicionar nota"}
            onclick={() => onNota(destaque)}
          >
            <Icone nome="nota" />
          </button>
          <button
            type="button"
            aria-label="Apagar destaque: {resumo(destaque.trecho, 40)}"
            title="Apagar destaque"
            onclick={() => onApagar(destaque)}
          >
            <Icone nome="lixeira" />
          </button>
        </div>
      </li>
    {/each}
  </ul>
{:else}
  <p class="vazio">
    Nenhum destaque ainda. Selecione um trecho e escolha uma cor, ou use <kbd>Ctrl</kbd>+<kbd
      >D</kbd
    > com o trecho selecionado.
  </p>
{/if}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    padding-block: 0.15rem;
    border-block-end: 1px solid var(--divisoria);
  }

  /* Faixa com a cor do destaque (a cor também está escrita na linha de baixo). */
  li::before {
    content: "";
    flex: none;
    width: 4px;
    margin-block: 0.45rem;
    align-self: stretch;
    border-radius: 2px;
    background: var(--cor-destaque);
  }

  button {
    border: 0;
    border-radius: var(--raio-pequeno);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  button:hover {
    background: var(--hover);
  }

  .trecho {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    padding: 0.4rem 0.5rem;
    text-align: start;
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

  .acoes {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  select {
    max-width: 6.5rem;
    padding: 0.15rem 0.25rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio-pequeno);
    background: var(--card);
    color: var(--texto);
    font: inherit;
    font-size: 0.8125rem;
  }

  .filtro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-block-end: 0.5rem;
  }

  .filtro button {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--divisoria);
    border-radius: 999px;
    font-size: 0.8125rem;
  }

  /* Filtro escolhido: fundo de destaque e texto forte (não só a cor). */
  .filtro button[aria-pressed="true"] {
    border-color: var(--destaque);
    background: var(--destaque-suave);
    color: var(--destaque);
    font-weight: 600;
  }

  .contagem {
    color: var(--suave);
    font-variant-numeric: tabular-nums;
  }

  .acoes button {
    display: inline-flex;
    padding: 0.4rem;
  }

  .exportar {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-block-end: 0.5rem;
    padding: 0.35rem 0.6rem;
  }

  .vazio {
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
