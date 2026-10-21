<script lang="ts">
  import { familiaCss } from "../lib/fontes";
  import {
    LIMITES,
    type Alinhamento,
    type Fonte,
    type Preferencias,
  } from "../lib/preferencias.svelte";

  let {
    preferencias,
    onMudar,
    onRestaurar,
  }: {
    preferencias: Preferencias;
    onMudar: (mudancas: Partial<Preferencias>) => void;
    onRestaurar: () => void;
  } = $props();

  const FONTES: { valor: Fonte; nome: string; descricao: string }[] = [
    { valor: "original", nome: "Do livro", descricao: "a fonte que o livro define" },
    { valor: "literata", nome: "Literata", descricao: "serifada, para leitura longa" },
    { valor: "atkinson", nome: "Atkinson Hyperlegible", descricao: "para baixa visão" },
    { valor: "lexend", nome: "Lexend", descricao: "para fluência de leitura" },
    { valor: "opendyslexic", nome: "OpenDyslexic", descricao: "para dislexia" },
  ];

  const ALINHAMENTOS: { valor: Alinhamento; nome: string }[] = [
    { valor: "original", nome: "Do livro" },
    { valor: "inicio", nome: "À esquerda" },
    { valor: "justificado", nome: "Justificado" },
  ];

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });
  const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  /** Controles deslizantes: texto visível e o que o leitor de tela anuncia. */
  const DESLIZANTES = [
    {
      campo: "tamanho",
      rotulo: "Tamanho do texto",
      formatar: (v: number) => porcento.format(v),
    },
    {
      campo: "entrelinha",
      rotulo: "Altura da linha",
      formatar: (v: number) => decimal.format(v),
    },
    {
      campo: "espacoLetras",
      rotulo: "Espaço entre letras",
      formatar: (v: number) => porcento.format(v),
    },
    {
      campo: "espacoPalavras",
      rotulo: "Espaço entre palavras",
      formatar: (v: number) => porcento.format(v),
    },
    {
      campo: "larguraMaxima",
      rotulo: "Largura máxima da coluna",
      formatar: (v: number) => `${v} px`,
    },
    {
      campo: "velocidadeVoz",
      rotulo: "Velocidade da leitura em voz alta",
      formatar: (v: number) => (v === 0 ? "normal" : v > 0 ? `+${v}` : `${v}`),
    },
  ] as const;
</script>

<div class="painel">
  <h2>Aparência do texto</h2>

  <fieldset>
    <legend>Fonte</legend>
    {#each FONTES as fonte (fonte.valor)}
      <label class="opcao">
        <input
          type="radio"
          name="fonte"
          value={fonte.valor}
          checked={preferencias.fonte === fonte.valor}
          onchange={() => onMudar({ fonte: fonte.valor })}
        />
        <span>
          <!-- Prévia: o nome aparece na própria fonte. -->
          <span
            class="nome"
            style:font-family={fonte.valor === "original" ? null : familiaCss(fonte.valor)}
            >{fonte.nome}</span
          >
          <span class="descricao">{fonte.descricao}</span>
        </span>
      </label>
    {/each}
  </fieldset>

  {#each DESLIZANTES as d (d.campo)}
    {@const valor = preferencias[d.campo]}
    {@const limite = LIMITES[d.campo]}
    <div class="deslizante">
      <label for="pref-{d.campo}">{d.rotulo}</label>
      <output for="pref-{d.campo}">{d.formatar(valor)}</output>
      <input
        id="pref-{d.campo}"
        type="range"
        min={limite.min}
        max={limite.max}
        step={limite.passo}
        value={valor}
        aria-valuetext={d.formatar(valor)}
        oninput={(e) => onMudar({ [d.campo]: Number(e.currentTarget.value) })}
      />
    </div>
  {/each}

  <fieldset>
    <legend>Colunas em janelas largas</legend>
    {#each [1, 2] as n (n)}
      <label class="opcao">
        <input
          type="radio"
          name="colunas"
          value={n}
          checked={preferencias.colunas === n}
          onchange={() => onMudar({ colunas: n })}
        />
        {n === 1 ? "Uma" : "Até duas"}
      </label>
    {/each}
  </fieldset>

  <fieldset>
    <legend>Alinhamento</legend>
    {#each ALINHAMENTOS as a (a.valor)}
      <label class="opcao">
        <input
          type="radio"
          name="alinhamento"
          value={a.valor}
          checked={preferencias.alinhamento === a.valor}
          onchange={() => onMudar({ alinhamento: a.valor })}
        />
        {a.nome}
      </label>
    {/each}
  </fieldset>

  <label class="opcao">
    <input
      type="checkbox"
      checked={preferencias.hifenizacao}
      onchange={(e) => onMudar({ hifenizacao: e.currentTarget.checked })}
    />
    Hifenizar palavras longas
  </label>

  <button type="button" class="restaurar" onclick={onRestaurar}>Restaurar o padrão</button>
</div>

<style>
  .painel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: 0.25rem;
  }

  legend {
    font-weight: 600;
  }

  .opcao {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
  }

  .nome {
    display: block;
    font-size: 1.1rem;
  }

  .descricao {
    font-size: 0.875rem;
    opacity: 0.8;
  }

  .deslizante {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem;
  }

  .deslizante input {
    grid-column: 1 / -1;
  }

  .restaurar {
    align-self: flex-start;
  }
</style>
