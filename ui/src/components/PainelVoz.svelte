<script lang="ts">
  import { onMount, tick } from "svelte";
  import { LIMITES, type Preferencias } from "../lib/preferencias.svelte";
  import {
    descreverVoz,
    idiomasDoModelo,
    idiomasInstalados,
    megabytes,
    porcentagem,
    vozEscolhida,
    vozNatural,
    type ModeloDeVoz,
  } from "../lib/vozNatural.svelte";

  // Aba "Voz" do painel Aparência, igual nos dois formatos (M27c, M27e): a velocidade; por idioma
  // com alguma voz baixada, usar a voz natural, a voz (do Kokoro ou leve, do Piper) e a amostra; e
  // os downloads: o Kokoro (inglês e português) e as vozes leves (uma por download, só inglês).
  let {
    preferencias,
    onMudar,
  }: {
    preferencias: Preferencias;
    onMudar: (mudancas: Partial<Preferencias>) => void;
  } = $props();

  const v = $derived(preferencias.velocidadeVoz);
  const textoVelocidade = $derived(v === 0 ? "normal" : v > 0 ? `+${v}` : `${v}`);
  const kokoro = $derived(vozNatural.kokoro);
  const leves = $derived(vozNatural.leves);
  const baixando = $derived(vozNatural.baixando);
  const idiomas = $derived(
    idiomasInstalados(vozNatural.modelos).map((i) => ({
      ...i,
      atual: vozEscolhida(vozNatural.modelos, preferencias, i.base)!,
    })),
  );
  /** O que o status diz ao leitor de tela sobre a amostra: só "Preparando a voz…", e só se demorar. */
  const statusAmostra = $derived(vozNatural.amostraAtual?.demorando ? "Preparando a voz…" : "");
  /** O modelo cuja remoção pede confirmação (no próprio lugar: o download é grande para refazer). */
  let confirmarRemocao = $state<string | null>(null);

  // O foco não se perde quando o botão em que ele estava some: "Baixar" vira a barra com
  // "Cancelar o download", que vira, no fim, o primeiro botão do bloco daquele modelo (ou a
  // primeira opção de voz, no Kokoro). Sem isso, o foco caía no body.
  let painel = $state<HTMLElement>();
  let focoNoDownload = false;
  let baixandoAntes: string | null = null;
  function focar(seletor: string) {
    tick().then(() => painel?.querySelector<HTMLElement>(seletor)?.focus());
  }
  function baixar(id: string) {
    focoNoDownload = true;
    vozNatural.baixar(id);
    focar(".baixando button");
  }
  $effect(() => {
    const agora = baixando?.modelo ?? null;
    if (baixandoAntes && !agora && focoNoDownload) {
      focoNoDownload = false;
      const m = vozNatural.modelos.find((x) => x.id === baixandoAntes);
      focar(
        m?.tipo === "kokoro" && m.instalado ? ".vozes input" : `[data-modelo="${baixandoAntes}"] button`,
      );
    }
    baixandoAntes = agora;
  });

  function remover(m: ModeloDeVoz) {
    confirmarRemocao = null;
    vozNatural.remover(m.id).then(() => focar(`[data-modelo="${m.id}"] button`));
  }

  onMount(() => {
    vozNatural.carregar().catch(() => {});
  });
</script>

{#snippet progresso(m: ModeloDeVoz)}
  {@const b = baixando!}
  {@const pct = Math.floor(porcentagem(b) / 10) * 10}
  <!-- Sem caixa própria e com o rótulo fixo (só o valor da barra muda, de 10 em 10%): ver
       docs/leitor-de-tela.md. -->
  <div class="baixando">
    <label for="progresso-voz-{m.id}">Baixando {m.tipo === "piper" ? m.vozes[0]?.nome : "a voz natural"} ({megabytes(b.total)})</label>
    <progress id="progresso-voz-{m.id}" max="100" value={pct} aria-valuetext="{pct}%">{pct}%</progress>
    <button
      type="button"
      onfocus={() => (focoNoDownload = true)}
      onblur={() => (focoNoDownload = false)}
      onclick={() => vozNatural.cancelar()}>Cancelar o download</button
    >
  </div>
{/snippet}

{#snippet removerComConfirmacao(m: ModeloDeVoz, rotulo: string)}
  {#if confirmarRemocao === m.id}
    <div class="confirmar" role="group" aria-label="{rotulo}?">
      <p id="pergunta-remover-{m.id}">
        {rotulo}? Para usá-la de novo, será preciso baixar outra vez.
      </p>
      <button type="button" aria-describedby="pergunta-remover-{m.id}" onclick={() => remover(m)}
        >Remover ({megabytes(m.tamanho)})</button
      >
      <!-- Como no Confirmacao.svelte: o foco vai ao que não apaga nada. -->
      <button
        type="button"
        class="cancelar-remocao"
        aria-describedby="pergunta-remover-{m.id}"
        onclick={() => {
          confirmarRemocao = null;
          focar(`[data-modelo="${m.id}"] .remover`);
        }}>Cancelar</button
      >
    </div>
  {:else}
    <button
      type="button"
      class="remover discreto"
      disabled={baixando !== null}
      onclick={() => {
        confirmarRemocao = m.id;
        focar(`[data-modelo="${m.id}"] .cancelar-remocao`);
      }}
    >
      {rotulo}…
    </button>
  {/if}
{/snippet}

<div class="painel" bind:this={painel}>
  <div class="velocidade">
    <label for="pref-velocidade-voz">Velocidade da leitura em voz alta</label>
    <output for="pref-velocidade-voz">{textoVelocidade}</output>
    <input
      id="pref-velocidade-voz"
      type="range"
      min={LIMITES.velocidadeVoz.min}
      max={LIMITES.velocidadeVoz.max}
      step={LIMITES.velocidadeVoz.passo}
      value={v}
      aria-valuetext={textoVelocidade}
      oninput={(e) => onMudar({ velocidadeVoz: Number(e.currentTarget.value) })}
    />
  </div>

  {#if idiomas.length && !vozNatural.espeak}
    <p class="aviso" role="note">
      O <strong>espeak-ng</strong> não foi encontrado: sem ele, a voz natural não fala. Instale o
      pacote <code>espeak-ng</code> da sua distribuição.
    </p>
  {/if}

  {#each idiomas as idioma (idioma.base)}
    {@const atual = idioma.atual}
    {@const amostra = vozNatural.amostraAtual}
    {@const desta = amostra?.voz === atual.id ? amostra.fase : null}
    <fieldset class="vozes">
      <legend>Livros em {idioma.nome}</legend>
      <label class="opcao">
        <input
          type="checkbox"
          checked={preferencias[idioma.pref]}
          onchange={(e) => onMudar({ [idioma.pref]: e.currentTarget.checked })}
        />
        Usar a voz natural em livros em {idioma.nome}
      </label>
      {#if idioma.vozes.length > 1}
        <div role="radiogroup" aria-label="Voz em {idioma.nome}" class="radios">
          {#each idioma.vozes as voz (voz.id)}
            <label class="opcao">
              <input
                type="radio"
                name="voz-natural-{idioma.base}"
                value={voz.id}
                checked={atual.id === voz.id}
                onchange={() => onMudar({ [idioma.escolha]: voz.id })}
              />
              <span>
                {voz.nome}
                <span class="descricao">{descreverVoz(voz)}</span>
              </span>
            </label>
          {/each}
        </div>
      {:else}
        <p class="voz-unica">
          Voz: {atual.nome} <span class="descricao">{descreverVoz(atual)}</span>
        </p>
      {/if}
      <!-- O nome não muda (só o ícone). -->
      <button
        type="button"
        class="amostra"
        class:ativa={desta !== null}
        aria-busy={desta === "preparando"}
        onclick={() => vozNatural.amostra(atual.id)}
      >
        {#if desta === "preparando"}
          <span class="girando" aria-hidden="true"></span>
        {:else if desta === "tocando"}
          <span class="ondas" aria-hidden="true"><i></i><i></i><i></i></span>
        {/if}
        Ouvir amostra ({atual.nome})
      </button>
    </fieldset>
  {/each}

  {#if kokoro}
    <fieldset data-modelo={kokoro.id}>
      <legend>Voz natural</legend>
      <p class="nota">
        Uma voz neural ({kokoro.nome}) que roda no seu computador, sem internet depois de baixada.
        Para livros em {idiomasDoModelo(kokoro).join(" e ")}; os outros continuam com a voz do
        sistema.
      </p>
      {#if !vozNatural.espeak && !kokoro.instalado}
        <p class="aviso" role="note">
          A voz natural precisa do <strong>espeak-ng</strong> para a pronúncia. Instale o pacote
          <code>espeak-ng</code> da sua distribuição e abra o Folio de novo.
        </p>
      {:else if baixando?.modelo === kokoro.id}
        {@render progresso(kokoro)}
      {:else if !kokoro.instalado}
        <button
          type="button"
          class="primario"
          disabled={baixando !== null}
          onclick={() => baixar(kokoro.id)}
        >
          Baixar a voz natural ({megabytes(kokoro.tamanho)})
        </button>
      {:else}
        {@render removerComConfirmacao(kokoro, "Remover a voz natural")}
      {/if}
    </fieldset>
  {/if}

  {#if leves.length && vozNatural.espeak}
    <fieldset>
      <legend>Vozes leves</legend>
      <p class="nota">
        Vozes do Piper, uma por download: mais leves e bem mais rápidas que a voz natural, para
        computadores mais simples. Só em inglês.
      </p>
      <ul class="leves">
        {#each leves as m (m.id)}
          {@const voz = m.vozes[0]}
          <li data-modelo={m.id}>
            <span class="nome-leve">
              {voz?.nome}
              <span class="descricao">{voz ? descreverVoz(voz) : ""}</span>
            </span>
            {#if baixando?.modelo === m.id}
              {@render progresso(m)}
            {:else if !m.instalado}
              <button type="button" disabled={baixando !== null} onclick={() => baixar(m.id)}>
                Baixar ({megabytes(m.tamanho)})
              </button>
            {:else}
              {@render removerComConfirmacao(m, `Remover ${voz?.nome}`)}
            {/if}
          </li>
        {/each}
      </ul>
    </fieldset>
  {/if}

  <!-- Por último: um objeto focável não fica no fim de um grupo com texto (docs/leitor-de-tela.md). -->
  <p class="so-leitor-de-tela" role="status">{statusAmostra}</p>
</div>

<style>
  .painel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-block-end: 1rem;
  }

  .velocidade {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 0.5rem;
  }

  .velocidade input {
    grid-column: 1 / -1;
    width: 100%;
  }

  /* Sem caixa própria (ver o comentário no bloco): rótulo, barra e botão entram no fieldset. */
  .baixando {
    display: contents;
  }

  .baixando progress {
    width: 100%;
  }

  fieldset {
    align-items: flex-start;
    gap: 0.5rem;
  }

  fieldset > * {
    align-self: stretch;
  }

  fieldset > button {
    align-self: flex-start;
  }

  .vozes,
  .radios {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .vozes > button {
    align-self: flex-start;
    margin-block-start: 0.25rem;
  }

  .voz-unica {
    margin: 0;
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

  .nota {
    margin: 0;
    color: var(--suave);
    font-size: 0.875rem;
  }

  .aviso {
    margin: 0;
    font-size: 0.875rem;
  }


  .amostra {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .amostra.ativa {
    border-color: var(--destaque);
    background: var(--destaque-suave);
  }

  /* Indicadores decorativos; sem animação com movimento reduzido (--duracao-* zeradas). */
  .girando {
    width: 0.9em;
    height: 0.9em;
    border: 2px solid currentColor;
    border-inline-end-color: transparent;
    border-radius: 50%;
    animation: girar 800ms linear infinite;
  }

  .ondas {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 0.9em;
  }

  .ondas i {
    width: 3px;
    height: 100%;
    background: var(--destaque);
    border-radius: 1px;
    transform-origin: bottom;
    animation: onda 700ms ease-in-out infinite alternate;
  }

  .ondas i:nth-child(2) {
    animation-delay: -230ms;
  }

  .ondas i:nth-child(3) {
    animation-delay: -460ms;
  }

  @keyframes girar {
    to {
      transform: rotate(1turn);
    }
  }

  @keyframes onda {
    from {
      transform: scaleY(0.3);
    }
  }


  .leves {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .leves li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem 0.75rem;
  }

  .nome-leve {
    flex: 1 1 8rem;
  }

  .leves .baixando progress {
    flex-basis: 100%;
  }

  .confirmar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .confirmar p {
    flex-basis: 100%;
    margin: 0;
    font-size: 0.875rem;
  }
</style>
