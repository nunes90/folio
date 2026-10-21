<script lang="ts">
  import { TEMAS, type TemaEfetivo, type TemaEscolhido } from "../lib/temas";
  import type { Movimento, Preferencias } from "../lib/preferencias.svelte";

  let {
    preferencias,
    onMudar,
    /** Tema que o sistema escolheria, para mostrar em "Do sistema". */
    temaDoSistema,
  }: {
    preferencias: Preferencias;
    onMudar: (mudancas: Partial<Preferencias>) => void;
    temaDoSistema?: TemaEfetivo;
  } = $props();

  const NOMES: Record<TemaEfetivo, string> = {
    claro: "Claro",
    escuro: "Escuro",
    sepia: "Sépia",
    "alto-contraste": "Alto contraste",
  };

  const OPCOES: { valor: TemaEscolhido; nome: string }[] = [
    { valor: "sistema", nome: "Do sistema" },
    ...(Object.keys(NOMES) as TemaEfetivo[]).map((t) => ({ valor: t, nome: NOMES[t] })),
  ];

  const MOVIMENTOS: { valor: Movimento; nome: string }[] = [
    { valor: "sistema", nome: "Seguir o sistema" },
    { valor: "reduzido", nome: "Sempre reduzir animações" },
  ];
</script>

<div class="painel">
  <h2>Tema e movimento</h2>

  <fieldset>
    <legend>Tema</legend>
    {#each OPCOES as opcao (opcao.valor)}
      {@const amostra = opcao.valor === "sistema" ? temaDoSistema : opcao.valor}
      <label class="opcao">
        <input
          type="radio"
          name="tema"
          value={opcao.valor}
          checked={preferencias.tema === opcao.valor}
          onchange={() => onMudar({ tema: opcao.valor })}
        />
        {#if amostra}
          <!-- Amostra decorativa: o nome do tema já está no rótulo. -->
          <span
            class="amostra"
            aria-hidden="true"
            style:background={TEMAS[amostra].fundo}
            style:color={TEMAS[amostra].texto}
            style:border-color={TEMAS[amostra].borda}>Aa</span
          >
        {/if}
        <span>
          {opcao.nome}
          {#if opcao.valor === "sistema" && temaDoSistema}
            <span class="agora">(agora: {NOMES[temaDoSistema].toLowerCase()})</span>
          {/if}
        </span>
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Animações</legend>
    {#each MOVIMENTOS as m (m.valor)}
      <label class="opcao">
        <input
          type="radio"
          name="movimento"
          value={m.valor}
          checked={preferencias.movimento === m.valor}
          onchange={() => onMudar({ movimento: m.valor })}
        />
        {m.nome}
      </label>
    {/each}
  </fieldset>
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
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 1.75rem;
    border: 1px solid;
    border-radius: 0.25rem;
    font-weight: 600;
  }

  .agora {
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
