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

  // Aba "Interface" do painel Aparência (M28b): as cores do app, as animações e as barras do
  // modo foco. O papel do livro é da aba Leitura (PainelPagina); só o alto contraste também vale
  // para a página do EPUB.
  const NOMES: Record<TemaEfetivo, string> = {
    claro: "Claro",
    escuro: "Escuro",
    "alto-contraste": "Alto contraste",
  };

  const OPCOES: { valor: TemaEscolhido; nome: string }[] = [
    { valor: "sistema", nome: "Do sistema" },
    ...(Object.keys(NOMES) as TemaEfetivo[]).map((t) => ({ valor: t, nome: NOMES[t] })),
  ];

  const MOVIMENTOS: { valor: Movimento; nome: string }[] = [
    { valor: "sistema", nome: "Como o sistema" },
    { valor: "reduzido", nome: "Sempre reduzidas" },
  ];
</script>

<div class="painel">
  <fieldset>
    <legend>Cores</legend>
    <div class="amostras">
      {#each OPCOES as opcao (opcao.valor)}
        {@const amostra = opcao.valor === "sistema" ? temaDoSistema : opcao.valor}
        <label>
          <input
            type="radio"
            name="tema"
            value={opcao.valor}
            checked={preferencias.tema === opcao.valor}
            onchange={() => onMudar({ tema: opcao.valor })}
          />
          <!-- Amostra decorativa: o nome do tema já está no rótulo. -->
          <span
            class="amostra"
            aria-hidden="true"
            style:background={amostra ? TEMAS[amostra].fundo : null}
            style:color={amostra ? TEMAS[amostra].texto : null}
            style:border-color={amostra ? TEMAS[amostra].borda : null}>Aa</span
          >
          {opcao.nome}
        </label>
      {/each}
    </div>
    {#if preferencias.tema === "sistema" && temaDoSistema}
      <p class="ajuda">Agora o sistema está no {NOMES[temaDoSistema].toLowerCase()}.</p>
    {/if}
  </fieldset>

  <fieldset>
    <legend>Animações</legend>
    <div class="segmentado">
      {#each MOVIMENTOS as m (m.valor)}
        <label>
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
    </div>
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
</div>

<style>
  .painel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    margin-block-end: 1rem;
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
    width: 100%;
    height: 2.25rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio-pequeno);
    font-weight: 600;
  }

  .descricao {
    display: block;
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
