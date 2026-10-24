<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import Atalhos from "./components/Atalhos.svelte";
  import Avisos from "./components/Avisos.svelte";
  import Biblioteca from "./components/Biblioteca.svelte";
  import Confirmacao from "./components/Confirmacao.svelte";
  import type { AcaoLivro } from "./components/MenuLivro.svelte";
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
    apagarLivro,
    definirLido,
    definirParaLer,
    esvaziarLixeira,
    listarLixeira,
    moverParaLixeira,
    restaurarLivro,
    salvarProgresso,
    type Livro,
    type Progresso,
  } from "./lib/biblioteca";
  import { log } from "./lib/log";
  import { avisar, avisarSeDemorar, mensagensDaImportacao } from "./lib/avisos.svelte";
  import { ouvirArraste } from "./lib/arrastar";
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
  let lixeira = $state<Livro[]>([]);
  /** O que espera confirmação: apagar um livro de vez ou esvaziar a lixeira. */
  let confirmar = $state<{ tipo: "apagar"; livro: Livro } | { tipo: "esvaziar" } | null>(null);
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

  let pendente: { id: string; progresso: Progresso } | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  // Tema e movimento da interface: reagem às preferências e às mudanças do sistema.
  $effect(() => {
    aplicarTema(temaEfetivo());
    const reduzido = movimentoReduzido();
    document.documentElement.dataset.movimento = reduzido ? "reduzido" : "normal";
    aplicarAnimacao(reduzido);
  });

  // Arrastar arquivos para a janela importa, mas só com a biblioteca na tela (lendo, não).
  let arrastando = $state(false);
  onMount(() => {
    if (!isTauri()) return;
    let pararDeOuvir: (() => void) | undefined;
    ouvirArraste({
      entrar: () => (arrastando = !aberto),
      sair: () => (arrastando = false),
      soltar: (caminhos) => {
        if (!aberto) importar(caminhos);
      },
    })
      .then((f) => (pararDeOuvir = f))
      .catch((e) => log.warn(`arrastar para importar indisponível: ${e}`));
    return () => pararDeOuvir?.();
  });

  onMount(async () => {
    // Fora do Tauri (testes) não há biblioteca: fica a tela vazia.
    if (!isTauri()) return;
    await recarregar();
    gerarCapasDePdfs();
    const caminho = await caminhoInicial();
    if (caminho) {
      // Aberto pelo sistema ("Abrir com"): abre o livro mesmo que já estivesse na biblioteca.
      const r = await importar([caminho]);
      const livro = r.importados[0] ?? r.jaExistentes[0] ?? r.restaurados[0];
      if (livro) await abrir(livro);
    }
  });

  async function recarregar() {
    try {
      [livros, lixeira] = await Promise.all([listarLivros(), listarLixeira()]);
    } catch (e) {
      avisar(`Não foi possível carregar a biblioteca: ${e}`, "erro");
    }
  }

  async function importar(caminhos: string[]) {
    importando = true;
    try {
      const n = caminhos.length;
      const resultado = await avisarSeDemorar(
        importarLivros(caminhos),
        n === 1 ? "Importando 1 livro…" : `Importando ${n} livros…`,
      );
      for (const { texto, tipo } of mensagensDaImportacao(resultado)) avisar(texto, tipo);
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
      await transicionar(livro.id, "abrir", () => {
        aberto = { livro, dados, inicio: progresso?.localizacao };
      });
    } catch (e) {
      const texto = `Não foi possível abrir ${livro.titulo}: ${e}`;
      avisar(texto, "erro");
      log.warn(texto);
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

  /**
   * Faz `trabalho`, recarrega a biblioteca e avisa. `sucesso` é o texto do aviso (com uma
   * ação opcional, ex.: Desfazer); um erro vira aviso de erro com `falha` como começo.
   */
  async function executar(
    trabalho: () => Promise<unknown>,
    sucesso: string,
    falha: string,
    acao?: { rotulo: string; executar: () => void },
  ): Promise<boolean> {
    try {
      await trabalho();
    } catch (e) {
      const texto = `${falha}: ${e}`;
      avisar(texto, "erro");
      log.warn(texto);
      return false;
    }
    await recarregar();
    avisar(sucesso, "sucesso", acao);
    return true;
  }

  /** O livro que recebe o foco quando `livro` sai da lista em que está (o seguinte ou o anterior). */
  function vizinhoDe(livro: Livro, lista: Livro[]): string | undefined {
    const i = lista.findIndex((l) => l.id === livro.id);
    return (lista[i + 1] ?? lista[i - 1])?.id;
  }

  async function aoAcao(livro: Livro, acao: AcaoLivro) {
    const t = livro.titulo;
    switch (acao) {
      case "para-ler": {
        const marcar = livro.paraLerEm === null;
        await executar(
          () => definirParaLer(livro.id, marcar),
          marcar ? `${t} está em Para ler.` : `${t} saiu de Para ler.`,
          `Não foi possível mudar ${t}`,
        );
        return;
      }
      case "lido": {
        const marcar = livro.lidoEm === null;
        await executar(
          () => definirLido(livro.id, marcar),
          marcar ? `${t} foi marcado como lido.` : `${t} não está mais marcado como lido.`,
          `Não foi possível mudar ${t}`,
        );
        return;
      }
      case "lixeira": {
        const vizinho = vizinhoDe(livro, livros);
        // Sem confirmação: dá para desfazer pelo aviso ou restaurar pela Lixeira.
        const ok = await executar(
          () => moverParaLixeira(livro.id),
          `${t} foi para a lixeira.`,
          `Não foi possível mover ${t} para a lixeira`,
          {
            rotulo: "Desfazer",
            executar: () =>
              void executar(
                () => restaurarLivro(livro.id),
                `${t} voltou para a estante.`,
                `Não foi possível restaurar ${t}`,
              ),
          },
        );
        if (ok) ultimoAberto = vizinho;
        return;
      }
      case "restaurar": {
        const vizinho = vizinhoDe(livro, lixeira);
        const ok = await executar(
          () => restaurarLivro(livro.id),
          `${t} voltou para a estante.`,
          `Não foi possível restaurar ${t}`,
        );
        if (ok) ultimoAberto = vizinho;
        return;
      }
      case "apagar":
        // Irreversível: só depois de confirmar.
        confirmar = { tipo: "apagar", livro };
        return;
    }
  }

  async function confirmado() {
    const pedido = confirmar;
    confirmar = null;
    if (pedido?.tipo === "apagar") {
      const { livro } = pedido;
      const vizinho = vizinhoDe(livro, lixeira);
      const ok = await executar(
        () => apagarLivro(livro.id),
        `${livro.titulo} foi apagado de vez.`,
        `Não foi possível apagar ${livro.titulo}`,
      );
      if (ok) ultimoAberto = vizinho;
    } else if (pedido?.tipo === "esvaziar") {
      const n = lixeira.length;
      await executar(
        () => esvaziarLixeira(),
        n === 1 ? "1 livro apagado de vez." : `${n} livros apagados de vez.`,
        "Não foi possível esvaziar a lixeira",
      );
    }
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
<Avisos />

<Confirmacao
  aberto={confirmar !== null}
  titulo={confirmar?.tipo === "esvaziar"
    ? "Esvaziar a lixeira?"
    : `Apagar ${confirmar?.livro.titulo ?? ""} de vez?`}
  rotuloConfirmar={confirmar?.tipo === "esvaziar" ? "Esvaziar" : "Apagar de vez"}
  onConfirmar={confirmado}
  onCancelar={() => (confirmar = null)}
>
  {#if confirmar?.tipo === "esvaziar"}
    <p>
      {lixeira.length === 1 ? "O livro da lixeira será apagado" : `Os ${lixeira.length} livros da lixeira serão apagados`}
      de vez, com o progresso de leitura. Não dá para desfazer.
    </p>
  {:else}
    <p>O livro e o progresso de leitura serão apagados de vez. Não dá para desfazer.</p>
  {/if}
  <p>Os arquivos originais, de onde os livros foram importados, não são afetados.</p>
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
    {arrastando}
    onAbrir={abrir}
    onImportar={escolherEImportar}
    {preferencias}
    onMudarPreferencias={atualizarPreferencias}
    temaDoSistema={resolverTema("sistema", sistema)}
    focarLivro={ultimoAberto}
    {lixeira}
    onAcao={aoAcao}
    onEsvaziar={() => (confirmar = { tipo: "esvaziar" })}
  />
{/if}
