<script lang="ts">
  import { onMount } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import Biblioteca from "./components/Biblioteca.svelte";
  import Leitor from "./components/Leitor.svelte";
  import {
    arquivoDoLivro,
    caminhoInicial,
    carregarLivro,
    definirCapa,
    escolherArquivos,
    importarLivros,
    listarLivros,
    progressoDoLivro,
    salvarProgresso,
    type Livro,
    type Progresso,
  } from "./lib/biblioteca";
  import { log } from "./lib/log";
  import { movimentoReduzido, sistema, temaEfetivo } from "./lib/ambiente.svelte";
  import { atualizarPreferencias, preferencias } from "./lib/preferencias.svelte";
  import { aplicarTema, resolverTema } from "./lib/temas";

  /** Progresso só vai ao banco depois de um tempo sem virar página. */
  const ESPERA_PROGRESSO_MS = 1000;

  let livros = $state<Livro[]>([]);
  let aberto = $state<{ livro: Livro; dados: ArrayBuffer; inicio?: string } | null>(null);
  let importando = $state(false);
  let aviso = $state<string | null>(null);

  let pendente: { id: string; progresso: Progresso } | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  // Tema e movimento da interface: reagem às preferências e às mudanças do sistema.
  $effect(() => {
    aplicarTema(temaEfetivo());
    document.documentElement.dataset.movimento = movimentoReduzido() ? "reduzido" : "normal";
  });

  onMount(async () => {
    // Fora do Tauri (testes) não há biblioteca: fica a tela vazia.
    if (!isTauri()) return;
    await recarregar();
    gerarCapasDePdfs();
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
      gerarCapasDePdfs();
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
      const [dados, progresso] = await Promise.all([
        carregarLivro(livro),
        progressoDoLivro(livro.id),
      ]);
      aviso = null;
      aberto = { livro, dados, inicio: progresso?.localizacao };
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

  let gerandoCapas = false;

  /** PDFs chegam sem capa: renderiza a primeira página com o pdf.js, um livro por vez. */
  async function gerarCapasDePdfs() {
    if (gerandoCapas) return;
    gerandoCapas = true;
    try {
      // Import dinâmico: o pdf.js só é carregado se houver PDF sem capa.
      let pdf: typeof import("./lib/pdf") | undefined;
      for (const livro of livros.filter((l) => l.formato === "pdf" && !l.capa)) {
        try {
          pdf ??= await import("./lib/pdf");
          const capa = await pdf.gerarCapa(await arquivoDoLivro(livro.id));
          const atualizado = await definirCapa(livro.id, capa);
          livros = livros.map((l) => (l.id === atualizado.id ? atualizado : l));
        } catch (e) {
          log.warn(`falha ao gerar capa de ${livro.titulo}: ${e}`);
        }
      }
    } finally {
      gerandoCapas = false;
    }
  }

  async function fechar() {
    clearTimeout(temporizador);
    await gravarPendente();
    aberto = null;
    await recarregar();
  }
</script>

{#if aberto?.livro.formato === "pdf"}
  <!-- Import dinâmico: o pdf.js só é carregado quando um PDF é aberto. -->
  {#await import("./components/LeitorPdf.svelte") then { default: LeitorPdf }}
    <LeitorPdf
      dados={aberto.dados}
      titulo={aberto.livro.titulo}
      inicio={aberto.inicio}
      onFechar={fechar}
      onProgresso={aoProgredir}
    />
  {/await}
{:else if aberto}
  <Leitor
    arquivo={new File([aberto.dados], `${aberto.livro.id}.epub`, { type: "application/epub+zip" })}
    inicio={aberto.inicio}
    onFechar={fechar}
    onProgresso={aoProgredir}
  />
{:else}
  <Biblioteca
    {livros}
    {importando}
    {aviso}
    onAbrir={abrir}
    onImportar={escolherEImportar}
    {preferencias}
    onMudarPreferencias={atualizarPreferencias}
    temaDoSistema={resolverTema("sistema", sistema)}
  />
{/if}
