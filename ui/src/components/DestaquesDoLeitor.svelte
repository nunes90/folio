<script lang="ts">
  // A barra sobre a seleção (ou sobre um destaque) e o diálogo da nota, iguais nos dois
  // leitores: tudo vem do ControleDestaques (lib/controleDestaques.svelte.ts).
  import type { ControleDestaques } from "../lib/controleDestaques.svelte";
  import BarraDestaque from "./BarraDestaque.svelte";
  import EditarNota from "./EditarNota.svelte";

  let { controle }: { controle: ControleDestaques } = $props();

  const barra = $derived(controle.barra);
</script>

{#if barra}
  <BarraDestaque
    x={barra.x}
    y={barra.y}
    abaixo={barra.abaixo}
    focar={barra.focar}
    corAtual={barra.destaque?.cor ?? null}
    onCor={(cor) => controle.escolherCor(cor)}
    onNota={() => controle.pedirNota()}
    onCopiar={() => controle.copiar()}
    onApagar={barra.destaque ? () => controle.apagar(barra.destaque!) : undefined}
    onFechar={() => controle.fecharBarra()}
  />
{/if}
<EditarNota
  aberto={controle.notaDe !== null}
  trecho={controle.notaDe?.trecho ?? ""}
  valorInicial={controle.notaDe?.nota ?? ""}
  onSalvar={(nota) => controle.salvarNota(nota)}
  onCancelar={() => controle.cancelarNota()}
/>
