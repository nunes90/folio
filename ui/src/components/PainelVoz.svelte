<script lang="ts">
  import { onMount, tick } from "svelte";
  import { LIMITES, type Preferencias } from "../lib/preferencias.svelte";
  import {
    descreverVoz,
    idiomasDoModelo,
    megabytes,
    porcentagem,
    vozEscolhida,
    vozNatural,
  } from "../lib/vozNatural.svelte";

  // Seção "Voz" do painel Aparência, igual nos dois formatos (M27c): a velocidade e a voz
  // natural (baixar; por idioma, usar em livros naquele idioma, a voz e a amostra; remover).
  let {
    preferencias,
    onMudar,
  }: {
    preferencias: Preferencias;
    onMudar: (mudancas: Partial<Preferencias>) => void;
  } = $props();

  const v = $derived(preferencias.velocidadeVoz);
  const textoVelocidade = $derived(v === 0 ? "normal" : v > 0 ? `+${v}` : `${v}`);
  const modelo = $derived(vozNatural.modelo);
  const baixando = $derived(vozNatural.baixando);
  const idiomas = $derived(
    modelo
      ? idiomasDoModelo(modelo).map((i) => ({ ...i, atual: vozEscolhida(modelo, preferencias, i.base) }))
      : [],
  );
  /**
   * O que o status diz ao leitor de tela sobre a amostra: só "Preparando a voz…", e só se a
   * geração demorar. Com o Orca ligado, anunciar o começo ("Tocando…") falava por cima da amostra.
   */
  const statusAmostra = $derived(vozNatural.amostraAtual?.demorando ? "Preparando a voz…" : "");
  /** Remover pede confirmação no próprio lugar (o download é grande para refazer por engano). */
  let confirmarRemocao = $state(false);

  // O foco não se perde quando o botão em que ele estava some: "Baixar" vira a barra com
  // "Cancelar o download", que vira as opções da voz (concluído) ou "Baixar" de novo (cancelado
  // ou falhou). Sem isso, o foco caía no body e o leitor de tela ficava sem saber onde estava.
  let painel = $state<HTMLElement>();
  let focoNoDownload = false;
  let estavaBaixando = false;
  function focar(seletor: string) {
    tick().then(() => painel?.querySelector<HTMLElement>(seletor)?.focus());
  }
  function baixar(id: string) {
    focoNoDownload = true;
    vozNatural.baixar(id);
    focar(".baixando button");
  }
  $effect(() => {
    const agora = baixando !== null;
    if (estavaBaixando && !agora && focoNoDownload) {
      focoNoDownload = false;
      focar(modelo?.instalado ? ".vozes input" : "button.primario");
    }
    estavaBaixando = agora;
  });

  onMount(() => {
    vozNatural.carregar().catch(() => {});
  });
</script>

<div class="painel" bind:this={painel}>
  <h2>Voz</h2>

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

  {#if modelo}
    <fieldset>
      <legend>Voz natural</legend>
      <p class="nota">
        Uma voz neural ({modelo.nome}) que roda no seu computador, sem internet depois de baixada.
        Para livros em {idiomas.map((i) => i.nome).join(" e ")}; os outros continuam com a voz do
        sistema.
      </p>

      {#if !vozNatural.espeak && !modelo.instalado}
        <p class="aviso" role="note">
          A voz natural precisa do <strong>espeak-ng</strong> para a pronúncia. Instale o pacote
          <code>espeak-ng</code> da sua distribuição e abra o Folio de novo.
        </p>
      {:else if baixando}
        <!-- De 10 em 10%: o Orca anuncia cada mudança da barra, mesmo com o foco em outro lugar. -->
        {@const pct = Math.floor(porcentagem(baixando) / 10) * 10}
        <div class="baixando">
          <!-- Nada no texto acessível muda durante o download (só o valor da barra), e o bloco não
               tem caixa própria: com o texto "X MB de 154 MB" mudando a cada 150 ms e o bloco
               terminando em barra + botão, o WebKitGTK travava e caía quando o Orca pedia os
               atributos de texto do grupo (sonda em e2e/, mesma família de quedas de
               atspi/rodar.sh). O tamanho total não muda: fica no rótulo. -->
          <label for="progresso-voz">Baixando a voz natural ({megabytes(baixando.total)})</label>
          <progress id="progresso-voz" max="100" value={pct} aria-valuetext="{pct}%">{pct}%</progress>
          <button
            type="button"
            onfocus={() => (focoNoDownload = true)}
            onblur={() => (focoNoDownload = false)}
            onclick={() => vozNatural.cancelar()}>Cancelar o download</button
          >
        </div>
      {:else if !modelo.instalado}
        <button type="button" class="primario" onclick={() => baixar(modelo.id)}>
          Baixar a voz natural ({megabytes(modelo.tamanho)})
        </button>
      {:else}
        {#if !vozNatural.espeak}
          <p class="aviso" role="note">
            O <strong>espeak-ng</strong> não foi encontrado: sem ele, a voz natural não fala.
            Instale o pacote <code>espeak-ng</code> da sua distribuição.
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
                      onchange={() => onMudar({ vozNatural: voz.id })}
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
            <!-- O nome não muda (só o ícone): com o foco no botão, o Orca anunciaria cada mudança
                 por cima da amostra. -->
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

        {#if confirmarRemocao}
          <div class="confirmar" role="group" aria-label="Remover a voz natural?">
            <p id="pergunta-remover-voz">
              Remover a voz natural? Para usá-la de novo, será preciso baixar outra vez.
            </p>
            <!-- A pergunta como descrição: o foco chega direto ao Cancelar, e o Orca só lia o botão. -->
            <button
              type="button"
              aria-describedby="pergunta-remover-voz"
              onclick={() => {
                confirmarRemocao = false;
                vozNatural.remover(modelo.id).then(() => focar("button.primario"));
              }}>Remover ({megabytes(modelo.tamanho)})</button
            >
            <!-- Como no Confirmacao.svelte: o foco vai ao que não apaga nada. -->
            <button
              type="button"
              class="cancelar-remocao"
              aria-describedby="pergunta-remover-voz"
              onclick={() => {
                confirmarRemocao = false;
                focar(".remover");
              }}>Cancelar</button
            >
          </div>
        {:else}
          <button
            type="button"
            class="remover"
            onclick={() => {
              confirmarRemocao = true;
              focar(".cancelar-remocao");
            }}
          >
            Remover a voz natural…
          </button>
        {/if}
        <!-- Por último de propósito: com o botão "Remover…" como o último objeto do grupo, o WebKitGTK
             travava e caía quando o Orca, ao focá-lo, pedia os atributos de texto do grupo naquela
             posição (com o Orca de verdade; a mesma família de quedas de e2e/atspi/rodar.sh). -->
        <p class="so-leitor-de-tela" role="status">{statusAmostra}</p>
      {/if}
    </fieldset>
  {/if}
</div>

<style>
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
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--borda);
    border-radius: 0.25rem;
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

  .nota {
    margin: 0;
    color: var(--suave);
    font-size: 0.875rem;
  }

  .aviso {
    margin: 0;
    font-size: 0.875rem;
  }

  /* A ação principal da seção, na cor de destaque (contraste testado em temas.ts). */
  .primario {
    border-color: var(--destaque);
    background: var(--destaque);
    color: var(--sobre-destaque);
    font-weight: 600;
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
