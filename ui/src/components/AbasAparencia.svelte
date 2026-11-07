<script lang="ts">
  // O painel Aparência em três abas (M28b): Leitura (a página e o texto, com a prévia ao vivo),
  // Voz e Interface. Cada intenção no seu lugar, em vez de uma coluna longa. Na biblioteca não há
  // página: só Voz e Interface.
  import { untrack, type Snippet } from "svelte";
  import Abas from "./Abas.svelte";
  import { abaAparencia, abaValida, type AbaAparencia } from "../lib/aparencia.svelte";

  let {
    prefixo,
    leitura,
    voz,
    aparenciaDoApp,
  }: {
    prefixo: string;
    leitura?: Snippet;
    voz: Snippet;
    /** A aba Interface (as cores e as animações do app). */
    aparenciaDoApp: Snippet;
  } = $props();

  const abas = $derived(
    [
      ...(leitura ? [{ id: "leitura" as const, nome: "Leitura" }] : []),
      { id: "voz" as const, nome: "Voz" },
      { id: "interface" as const, nome: "Interface" },
    ] satisfies { id: AbaAparencia; nome: string }[],
  );

  let aba = $state<AbaAparencia>(
    untrack(() =>
      abaValida(abaAparencia.atual, leitura ? ["leitura", "voz", "interface"] : ["voz", "interface"]),
    ),
  );
  // Só a escolha de quem usa é lembrada: abrir na biblioteca (sem a Leitura) não a muda.
  let primeira = true;
  $effect(() => {
    const atual = aba;
    if (!primeira) abaAparencia.atual = atual;
    primeira = false;
  });
</script>

<Abas {abas} bind:aba rotulo="Seções da aparência" {prefixo}>
  {#snippet conteudo(id)}
    {#if id === "leitura"}
      {@render leitura?.()}
    {:else if id === "voz"}
      {@render voz()}
    {:else}
      {@render aparenciaDoApp()}
    {/if}
  {/snippet}
</Abas>
