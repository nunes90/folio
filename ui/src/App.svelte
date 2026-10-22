<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import Atalhos from "./components/Atalhos.svelte";
  import Biblioteca from "./components/Biblioteca.svelte";
  import Confirmacao from "./components/Confirmacao.svelte";
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
    removerLivro,
    salvarProgresso,
    type Livro,
    type Progresso,
  } from "./lib/biblioteca";
  import { log } from "./lib/log";
  import { movimentoReduzido, sistema, temaEfetivo } from "./lib/ambiente.svelte";
  import { atualizarPreferencias, preferencias } from "./lib/preferencias.svelte";
  import { aplicarTema, resolverTema } from "./lib/temas";
  import { aplicarAnimacao } from "./lib/animacao";
  import { transicionar } from "./lib/transicao";

  /** Progresso só vai ao banco depois de um tempo sem virar página. */
  const ESPERA_PROGRESSO_MS = 1000;

  let livros = $state<Livro[]>([]);
  let aberto = $state<{ livro: Livro; dados: ArrayBuffer; inicio?: string } | null>(null);
  let importando = $state(false);
  let ajudaAberta = $state(false);
  /** Leitor de PDF, importado sob demanda (o pdf.js é grande) antes de a transição começar. */
  let LeitorPdf = $state<Component<any> | null>(null);
  /** Livro esperando confirmação de remoção. */
  let aRemover = $state<Livro | null>(null);
  /** Livro fechado por último: recebe o foco ao voltar para a biblioteca. */
  let ultimoAberto = $state<string>();
  const contexto = $derived(aberto ? aberto.livro.formato : "biblioteca");

  // F1 em qualquer tela (no EPUB, o Leitor reenvia à janela as teclas do capítulo).
  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "F1") {
      e.preventDefault();
      ajudaAberta = true;
    }
  }
  let aviso = $state<string | null>(null);

  let pendente: { id: string; progresso: Progresso } | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  // Tema e movimento da interface: reagem às preferências e às mudanças do sistema.
  $effect(() => {
    aplicarTema(temaEfetivo());
    const reduzido = movimentoReduzido();
    document.documentElement.dataset.movimento = reduzido ? "reduzido" : "normal";
    aplicarAnimacao(reduzido);
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
      // Tudo o que é lento acontece antes da transição: durante ela a tela fica congelada.
      const [dados, progresso] = await Promise.all([
        carregarLivro(livro),
        progressoDoLivro(livro.id),
        livro.formato === "pdf" && !LeitorPdf
          ? import("./components/LeitorPdf.svelte").then((m) => (LeitorPdf = m.default))
          : null,
      ]);
      aviso = null;
      await transicionar(livro.id, "abrir", () => {
        aberto = { livro, dados, inicio: progresso?.localizacao };
      });
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

  async function remover(livro: Livro) {
    // O foco vai para o vizinho (o seguinte ou, se era o último, o anterior).
    const i = livros.findIndex((l) => l.id === livro.id);
    const vizinho = livros[i + 1] ?? livros[i - 1];
    try {
      await removerLivro(livro.id);
      aviso = `${livro.titulo} foi removido da biblioteca.`;
    } catch (e) {
      aviso = `Não foi possível remover ${livro.titulo}: ${e}`;
      log.warn(aviso);
      return;
    }
    await recarregar();
    ultimoAberto = vizinho?.id;
  }

  async function fechar() {
    clearTimeout(temporizador);
    await gravarPendente();
    const id = aberto?.livro.id;
    ultimoAberto = id;
    // A lista é recarregada antes, para a capa de destino já estar na tela nova.
    await recarregar();
    const voltar = () => {
      aberto = null;
    };
    if (id) await transicionar(id, "fechar", voltar);
    else voltar();
  }
</script>

<svelte:window onkeydown={aoTeclar} />

<Atalhos {contexto} aberto={ajudaAberta} onFechar={() => (ajudaAberta = false)} />

<Confirmacao
  aberto={aRemover !== null}
  titulo="Remover {aRemover?.titulo ?? ''} da biblioteca?"
  rotuloConfirmar="Remover"
  onConfirmar={() => {
    const livro = aRemover;
    aRemover = null;
    if (livro) remover(livro);
  }}
  onCancelar={() => (aRemover = null)}
>
  <p>O arquivo original, de onde o livro foi importado, não é afetado.</p>
  <p>O progresso de leitura deste livro será perdido.</p>
</Confirmacao>

{#if aberto?.livro.formato === "pdf"}
  <!-- Importado em abrir(), antes da transição: o pdf.js só é carregado quando um PDF é aberto. -->
  {#if LeitorPdf}
    <LeitorPdf
      dados={aberto.dados}
      titulo={aberto.livro.titulo}
      inicio={aberto.inicio}
      onFechar={fechar}
      onProgresso={aoProgredir}
    />
  {/if}
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
    focarLivro={ultimoAberto}
    onRemover={(livro) => (aRemover = livro)}
  />
{/if}
