<script lang="ts">
  // A busca do PDF, no cabeçalho. Em janela estreita (M28c), o campo fixo empurrava os botões para
  // fora da barra: vira um botão de lupa que abre a busca por cima do cabeçalho (Esc ou ✕ fecham e
  // devolvem o foco à lupa).
  import { tick } from "svelte";
  import Icone from "./Icone.svelte";
  import { sistema } from "../lib/ambiente.svelte";

  let {
    resultado = "",
    onBuscar,
    campo = $bindable(),
  }: {
    /** Texto do resultado ("3 de 12", "Nada encontrado"), anunciado por leitores de tela. */
    resultado?: string;
    /** `anterior` busca para trás; com o mesmo termo, avança para a próxima ocorrência. */
    onBuscar: (termo: string, anterior: boolean) => void;
    /** O campo de texto, para o pai dar foco (Ctrl+F). */
    campo?: HTMLInputElement;
  } = $props();

  let termo = $state("");
  const compacta = $derived(sistema.estreita);
  let aberta = $state(false);
  let lupa = $state<HTMLButtonElement>();

  /** Mostra a busca (na janela estreita, abre por cima do cabeçalho) e leva o foco ao campo. */
  export async function abrir() {
    aberta = true;
    await tick();
    campo?.focus();
    campo?.select();
  }

  async function fechar() {
    aberta = false;
    await tick();
    lupa?.focus();
  }

  function aoEnviar(e: SubmitEvent) {
    e.preventDefault();
    if (termo.trim()) onBuscar(termo, false);
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "Escape" && compacta && aberta) {
      // Só fecha a busca: o Esc não segue para a moldura (fecharia um painel ou o modo foco).
      e.preventDefault();
      e.stopPropagation();
      void fechar();
      return;
    }
    // Shift+Enter busca para trás, como na maioria dos leitores.
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (termo.trim()) onBuscar(termo, true);
    }
  }
</script>

{#if compacta}
  <button
    type="button"
    bind:this={lupa}
    aria-expanded={aberta}
    aria-keyshortcuts="Control+F"
    onclick={() => (aberta ? fechar() : abrir())}
  >
    <Icone nome="buscar" /><span class="rotulo">Buscar no documento</span>
  </button>
{/if}
{#if !compacta || aberta}
<form role="search" class:sobre={compacta} onsubmit={aoEnviar}>
  <input
    type="search"
    aria-label="Buscar no documento"
    placeholder="Buscar…"
    bind:value={termo}
    bind:this={campo}
    onkeydown={aoTeclar}
  />
  <button type="button" onclick={() => termo.trim() && onBuscar(termo, true)}>
    <Icone nome="acima" /><span class="rotulo">Anterior</span>
  </button>
  <button type="submit"><Icone nome="abaixo" /><span class="rotulo">Próxima</span></button>
  <span role="status">{resultado}</span>
  {#if compacta}
    <button type="button" onclick={fechar}>
      <Icone nome="fechar" /><span class="rotulo">Fechar a busca</span>
    </button>
  {/if}
</form>
{/if}

<style>
  /* Encolhe com a janela: o campo cede espaço antes de o cabeçalho cortar botões. */
  form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  input {
    flex: 1 1 12rem;
    min-width: 5rem;
    width: 12rem;
  }

  span[role="status"] {
    min-width: 6rem;
  }

  /* Na janela estreita, aberta: por cima do cabeçalho inteiro (que é position: relative). */
  form.sobre {
    position: absolute;
    inset: 0;
    z-index: 3;
    padding-inline: 0.4rem;
    background: var(--painel);
  }

  form.sobre input {
    width: auto;
  }

  :global(.estreita) span[role="status"] {
    min-width: 0;
  }
</style>
