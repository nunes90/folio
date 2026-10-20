<script lang="ts">
  import { onMount } from "svelte";
  import Leitor from "./components/Leitor.svelte";
  import { caminhoInicial, carregarLivro, escolherArquivo } from "./lib/livro";
  import { log } from "./lib/log";

  let arquivo = $state<File | null>(null);
  let erro = $state<string | null>(null);

  onMount(async () => {
    try {
      const caminho = await caminhoInicial();
      if (caminho) await abrir(caminho);
    } catch {
      // Fora do Tauri (testes) não há linha de comando: começa na tela inicial.
    }
  });

  async function abrir(caminho: string) {
    erro = null;
    try {
      arquivo = await carregarLivro(caminho);
    } catch (e) {
      erro = String(e);
      log.warn(`falha ao abrir ${caminho}: ${erro}`);
    }
  }

  async function escolherEAbrir() {
    const caminho = await escolherArquivo();
    if (caminho) await abrir(caminho);
  }
</script>

{#if arquivo}
  <Leitor {arquivo} onFechar={() => (arquivo = null)} />
{:else}
  <main>
    <h1>Leitor</h1>
    <p>Nenhum livro aberto ainda.</p>
    <button type="button" onclick={escolherEAbrir}>Abrir livro…</button>
    {#if erro}
      <p role="alert">{erro}</p>
    {/if}
  </main>
{/if}

<style>
  main {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.5rem;
    min-height: 100vh;
  }
</style>
