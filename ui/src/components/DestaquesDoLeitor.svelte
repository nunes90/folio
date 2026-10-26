<script lang="ts">
  // A barra sobre a seleção (ou sobre um destaque) e o diálogo da nota, iguais nos dois
  // leitores: tudo vem do ControleDestaques (lib/controleDestaques.svelte.ts).
  import type { ControleDestaques, MudancaDeTrecho } from "../lib/controleDestaques.svelte";
  import BarraDestaque from "./BarraDestaque.svelte";
  import EditarNota from "./EditarNota.svelte";

  let {
    controle,
    onOuvir,
    onTrecho,
  }: {
    controle: ControleDestaques;
    /** Ouvir a partir do trecho da barra (leitor com voz). */
    onOuvir?: () => void;
    /** Trocar de frase ou mudar o tamanho do trecho (modo frase). */
    onTrecho?: (mudanca: MudancaDeTrecho) => void;
  } = $props();

  const barra = $derived(controle.barra);
</script>

{#if barra}
  <BarraDestaque
    x={barra.x}
    y={barra.y}
    abaixo={barra.abaixo}
    focar={barra.focar}
    corAtual={barra.destaque?.cor ?? null}
    motivoAtual={barra.destaque?.motivo ?? null}
    onMotivo={(motivo) => controle.escolherMotivo(motivo)}
    onCor={(cor) => controle.escolherCor(cor)}
    onNota={() => controle.pedirNota()}
    onCopiar={() => controle.copiar()}
    {onOuvir}
    {onTrecho}
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
