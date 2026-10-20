<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import Biblioteca from "./components/Biblioteca.svelte";
  import Leitor from "./components/Leitor.svelte";
  import {
    caminhoInicial,
    carregarLivro,
    escolherArquivos,
    importarLivros,
    listarLivros,
    progressoDoLivro,
    salvarProgresso,
    type Livro,
    type Progresso,
  } from "./lib/biblioteca";
  import { log } from "./lib/log";

  /** Progresso só vai ao banco depois de um tempo sem virar página. */
  const ESPERA_PROGRESSO_MS = 1000;

  let livros = $state<Livro[]>([]);
  let aberto = $state<{ livro: Livro; arquivo: File; inicio?: string } | null>(null);
  let importando = $state(false);
  let aviso = $state<string | null>(null);

  let pendente: { id: string; progresso: Progresso } | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    // Fora do Tauri (testes) não há biblioteca: fica a tela vazia.
    if (!isTauri()) return;
    await recarregar();
    const caminho = await caminhoInicial();
    if (caminho) {
      const { importados } = await importar([caminho]);
      if (importados[0]) await abrir(importados[0]);
    }
  });

  async function recarregar() {
    try {
      livros = await listarLivros();
    } catch (e) {
      aviso = `Não foi possível carregar a biblioteca: ${e}`;
    }
  }

  async function importar(caminhos: string[]) {
    importando = true;
    try {
      const resultado = await importarLivros(caminhos);
      const n = resultado.importados.length;
      const partes = [n === 1 ? "1 livro importado." : `${n} livros importados.`];
      for (const falha of resultado.falhas) {
        const nome = falha.caminho.split(/[\\/]/).pop();
        partes.push(`Não foi possível importar ${nome}: ${falha.erro}`);
      }
      aviso = partes.join(" ");
      await recarregar();
      return resultado;
    } finally {
      importando = false;
    }
  }

  async function escolherEImportar() {
    const caminhos = await escolherArquivos();
    if (caminhos.length) await importar(caminhos);
  }

  async function abrir(livro: Livro) {
    try {
      const [arquivo, progresso] = await Promise.all([
        carregarLivro(livro),
        progressoDoLivro(livro.id),
      ]);
      aviso = null;
      aberto = { livro, arquivo, inicio: progresso?.localizacao };
    } catch (e) {
      aviso = `Não foi possível abrir ${livro.titulo}: ${e}`;
      log.warn(aviso);
    }
  }

  function aoProgredir(localizacao: string, fracao: number) {
    if (!aberto) return;
    pendente = { id: aberto.livro.id, progresso: { localizacao, fracao } };
    clearTimeout(temporizador);
    temporizador = setTimeout(gravarPendente, ESPERA_PROGRESSO_MS);
  }

  async function gravarPendente() {
    if (!pendente) return;
    const { id, progresso } = pendente;
    pendente = null;
    try {
      await salvarProgresso(id, progresso);
    } catch (e) {
      log.warn(`falha ao salvar progresso: ${e}`);
    }
  }

  async function fechar() {
    clearTimeout(temporizador);
    await gravarPendente();
    aberto = null;
    await recarregar();
  }
</script>

{#if aberto}
  <Leitor
    arquivo={aberto.arquivo}
    inicio={aberto.inicio}
    onFechar={fechar}
    onProgresso={aoProgredir}
  />
{:else}
  <Biblioteca {livros} {importando} {aviso} onAbrir={abrir} onImportar={escolherEImportar} />
{/if}
