<script lang="ts">
  import Icone from "./Icone.svelte";

  let {
    pagina,
    total,
    zoom,
    onIrPara,
    onZoomMenos,
    onZoomMais,
    onAjustarLargura,
  }: {
    pagina: number;
    total: number;
    /** Escala atual (1 = 100%). */
    zoom: number;
    onIrPara: (pagina: number) => void;
    onZoomMenos: () => void;
    onZoomMais: () => void;
    onAjustarLargura: () => void;
  } = $props();

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

  function aoMudarPagina(e: Event) {
    const campo = e.currentTarget as HTMLInputElement;
    const n = Number(campo.value);
    if (Number.isInteger(n) && n >= 1 && n <= total) onIrPara(n);
    else campo.value = String(pagina);
  }
</script>

<div class="barra">
  <div class="grupo grupo-barra" role="group" aria-label="Páginas">
    <button type="button" onclick={() => onIrPara(pagina - 1)} disabled={pagina <= 1}>
      <Icone nome="anterior" /><span class="rotulo">Página anterior</span>
    </button>
    <label>
      Página
      <!-- Largura dos dígitos do total: mudar de página não mexe nos controles. -->
      <input
        type="number"
        min="1"
        max={total}
        value={pagina}
        onchange={aoMudarPagina}
        style:width="calc({String(total).length}ch + 2rem)"
      />
      de {total}
    </label>
    <button type="button" onclick={() => onIrPara(pagina + 1)} disabled={pagina >= total}>
      <Icone nome="proxima" /><span class="rotulo">Próxima página</span>
    </button>
  </div>

  <div class="grupo grupo-barra" role="group" aria-label="Zoom">
    <button type="button" onclick={onZoomMenos} aria-label="Diminuir zoom">−</button>
    <output aria-live="polite">{porcento.format(zoom)}</output>
    <button type="button" onclick={onZoomMais} aria-label="Aumentar zoom">+</button>
    <button type="button" onclick={onAjustarLargura}>
      <Icone nome="largura" /><span class="rotulo">Ajustar à largura</span>
    </button>
  </div>
</div>

<style>
  /* Sem quebrar: no rodapé, não caber passa os botões a só ícones; quebra só no modo compacto. */
  .barra {
    display: flex;
    flex-wrap: nowrap;
    justify-content: center;
    gap: 1.5rem;
  }

  :global(.estreita) .barra {
    gap: 0.75rem;
  }

  :global(.rodape-compacto) .barra {
    flex-wrap: wrap;
  }

  .grupo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  input,
  output,
  label {
    font-variant-numeric: tabular-nums;
  }

  /* "1.000%" é o mais largo: o zoom não empurra os botões ao mudar. */
  output {
    min-width: 6ch;
    text-align: center;
  }
</style>
