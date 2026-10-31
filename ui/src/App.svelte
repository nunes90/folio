<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import Atalhos from "./components/Atalhos.svelte";
  import Sobre from "./components/Sobre.svelte";
  import Paleta from "./components/Paleta.svelte";
  import Avisos from "./components/Avisos.svelte";
  import Biblioteca from "./components/Biblioteca.svelte";
  import Confirmacao from "./components/Confirmacao.svelte";
  import EscolherColecoes from "./components/EscolherColecoes.svelte";
  import PedirNome from "./components/PedirNome.svelte";
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
    processoRecuperado,
    progressoDoLivro,
    listarSessoes,
    adicionarAColecao,
    apagarColecao,
    apagarLivro,
    criarColecao,
    listarColecoes,
    removerDaColecao,
    renomearColecao,
    type Colecao,
    definirFavorito,
    definirLido,
    definirParaLer,
    esvaziarLixeira,
    listarLixeira,
    moverParaLixeira,
    restaurarLivro,
    salvarProgresso,
    type Livro,
  } from "./lib/biblioteca";
  import { log } from "./lib/log";
  import { avisar, avisarSeDemorar, mensagensDaImportacao } from "./lib/avisos.svelte";
  import { ouvirArraste } from "./lib/arrastar";
  import { movimentoReduzido, sistema, temaEfetivo } from "./lib/ambiente.svelte";
  import { atualizarPreferencias, preferencias } from "./lib/preferencias.svelte";
  import { aplicarTema, resolverTema } from "./lib/temas";
  import { aplicarAnimacao } from "./lib/animacao";
  import { transicionar } from "./lib/transicao";
  import type { Comando, ComandosDoLeitor } from "./lib/comandos";
  import type { Filtro } from "./lib/filtro";
  import type { TemaEscolhido } from "./lib/temas";
  import type { Movimento } from "./lib/preferencias.svelte";
  import { SessaoDeLeitura } from "./lib/sessao.svelte";


  let livros = $state<Livro[]>([]);
  let aberto = $state<{
    livro: Livro;
    dados: ArrayBuffer;
    inicio?: string;
    /** Fim da sessão anterior (segundos desde 1970): "Da última vez (há 2 dias)…" (M22). */
    ultimaLeitura?: number;
  } | null>(null);
  /** A sessão de leitura do livro aberto (M20): começa no primeiro progresso do leitor. */
  let sessao: SessaoDeLeitura | null = null;
  let importando = $state(false);
  let ajudaAberta = $state(false);
  let sobreAberto = $state(false);
  let paletaAberta = $state(false);
  /** O que o leitor aberto oferece à paleta (índice, página, texto…); vazio na biblioteca. */
  let doLeitor = $state<ComandosDoLeitor>({ comandos: [] });
  /** A biblioteca na tela (para a paleta trocar de estante ou levar à busca). */
  let biblioteca = $state<ReturnType<typeof Biblioteca>>();
  /** Leitor de PDF, importado sob demanda (o pdf.js é grande) antes de a transição começar. */
  let LeitorPdf = $state<Component<any> | null>(null);
  let lixeira = $state<Livro[]>([]);
  /** O que espera confirmação: apagar um livro de vez ou esvaziar a lixeira. */
  let confirmar = $state<
    | { tipo: "apagar"; livro: Livro }
    | { tipo: "esvaziar" }
    | { tipo: "apagar-colecao"; colecao: Colecao }
    | null
  >(null);
  let colecoes = $state<Colecao[]>([]);
  /** Diálogo de nome: nova coleção ou renomear uma; `erro` vem do core (ex.: nome repetido). */
  let pedirNome = $state<{ colecao: Colecao | null; erro: string | null } | null>(null);
  /** Livro cujo diálogo "Adicionar à coleção…" está aberto (o id: a lista é recarregada). */
  let colecoesDe = $state<string | null>(null);
  const livroDasColecoes = $derived(livros.find((l) => l.id === colecoesDe) ?? null);
  /** Livro fechado por último: recebe o foco ao voltar para a biblioteca. */
  let ultimoAberto = $state<string>();
  const contexto = $derived(aberto ? aberto.livro.formato : "biblioteca");

  // F1 e Ctrl+K em qualquer tela (no EPUB, o Leitor reenvia à janela as teclas do capítulo).
  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "F1") {
      e.preventDefault();
      ajudaAberta = true;
    } else if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      // Não abre por cima de outro diálogo (confirmação, atalhos…).
      if (!document.querySelector("dialog[open]")) paletaAberta = true;
    }
  }

  const NOMES_TEMA: [TemaEscolhido, string][] = [
    ["sistema", "do sistema"],
    ["claro", "claro"],
    ["escuro", "escuro"],
    ["alto-contraste", "alto contraste"],
  ];
  const NOMES_MOVIMENTO: [Movimento, string][] = [
    ["sistema", "seguir o sistema"],
    ["reduzido", "sempre reduzir"],
  ];
  const ESTANTES: [Filtro, string][] = [
    ["todos", "Todos"],
    ["favoritos", "Favoritos"],
    ["lendo", "Lendo"],
    ["para-ler", "Para ler"],
    ["lidos", "Lidos"],
    ["autores", "Autores"],
    ["lixeira", "Lixeira"],
  ];

  /** O que a paleta oferece agora: depende da tela (biblioteca ou leitor). */
  const comandos = $derived.by((): Comando[] => {
    const lista: Comando[] = [];
    const naBiblioteca = !aberto;
    if (naBiblioteca) {
      if (!importando)
        lista.push({
          id: "importar",
          titulo: "Importar livros…",
          grupo: "Biblioteca",
          teclas: [["Ctrl", "O"]],
          executar: escolherEImportar,
        });
      lista.push({
        id: "buscar",
        titulo: "Buscar na biblioteca",
        grupo: "Biblioteca",
        teclas: [["Ctrl", "F"]],
        executar: () => biblioteca?.buscar(),
      });
      for (const [filtro, nome] of ESTANTES)
        lista.push({
          id: `estante-${filtro}`,
          titulo: `Estante: ${nome}`,
          grupo: "Estantes",
          executar: () => void biblioteca?.mostrar(filtro),
        });
      for (const colecao of colecoes)
        lista.push({
          id: `colecao-${colecao.id}`,
          titulo: `Coleção: ${colecao.nome}`,
          grupo: "Coleções",
          executar: () => void biblioteca?.mostrar(`colecao:${colecao.id}`),
        });
      lista.push({
        id: "nova-colecao",
        titulo: "Nova coleção…",
        grupo: "Coleções",
        executar: () => (pedirNome = { colecao: null, erro: null }),
      });
      if (lixeira.length)
        lista.push({
          id: "esvaziar",
          titulo: "Esvaziar lixeira…",
          grupo: "Lixeira",
          executar: () => (confirmar = { tipo: "esvaziar" }),
        });
    } else {
      lista.push({
        id: "voltar",
        titulo: "Voltar à biblioteca",
        grupo: "Leitura",
        executar: () => void fechar(),
      });
      lista.push(...doLeitor.comandos);
    }
    for (const [tema, nome] of NOMES_TEMA)
      lista.push({
        id: `tema-${tema}`,
        titulo: `Interface: ${nome}`,
        grupo: "Aparência",
        dica: preferencias.tema === tema ? "atual" : undefined,
        palavras: "tema cores",
        executar: () => atualizarPreferencias({ tema }),
      });
    for (const [movimento, nome] of NOMES_MOVIMENTO)
      lista.push({
        id: `movimento-${movimento}`,
        titulo: `Animações: ${nome}`,
        grupo: "Aparência",
        dica: preferencias.movimento === movimento ? "atual" : undefined,
        palavras: "movimento reduzir",
        executar: () => atualizarPreferencias({ movimento }),
      });
    lista.push({
      id: "atalhos",
      titulo: "Mostrar atalhos de teclado",
      grupo: "Ajuda",
      teclas: [["F1"]],
      executar: () => (ajudaAberta = true),
    });
    lista.push({
      id: "sobre",
      titulo: "Sobre o Folio",
      grupo: "Ajuda",
      palavras: "versão licença",
      executar: () => (sobreAberto = true),
    });
    // Livros por último: são muitos, e o nome do comando costuma ser o que se procura.
    if (naBiblioteca)
      for (const livro of livros)
        lista.push({
          id: `livro-${livro.id}`,
          titulo: `Abrir ${livro.titulo}`,
          grupo: livro.formato.toUpperCase(),
          dica: livro.autores.join(", ") || undefined,
          executar: () => void abrir(livro),
        });
    return lista;
  });


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
    // Depois de uma queda, volta à biblioteca: reabrir sozinho o livro poderia derrubar de novo.
    if (await processoRecuperado()) {
      avisar("O Folio parou de responder e recarregou. Sua leitura está salva: abra o livro para continuar.", "erro");
      return;
    }
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
      [livros, lixeira, colecoes] = await Promise.all([
        listarLivros(),
        listarLixeira(),
        listarColecoes(),
      ]);
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
      const [dados, progresso, sessoes] = await Promise.all([
        carregarLivro(livro),
        progressoDoLivro(livro.id),
        // Antes de a sessão nova começar: a mais recente é a da última leitura.
        listarSessoes(livro.id).catch(() => []),
        livro.formato === "pdf" && !LeitorPdf
          ? import("./components/LeitorPdf.svelte").then((m) => (LeitorPdf = m.default))
          : null,
      ]);
      await transicionar(livro.id, "abrir", () => {
        aberto = {
          livro,
          dados,
          inicio: progresso?.localizacao,
          ultimaLeitura: sessoes[0]?.fim,
        };
        sessao = new SessaoDeLeitura(livro.id);
      });
    } catch (e) {
      const texto = `Não foi possível abrir ${livro.titulo}: ${e}`;
      avisar(texto, "erro");
      log.warn(texto);
    }
  }

  function aoProgredir(localizacao: string, fracao: number) {
    if (!aberto) return;
    // Grava a cada mudança de página, sem esperar: é um único upsert no SQLite (menos de 1 ms),
    // e fechar a janela logo depois de virar a página não perde mais a última posição. (Uma
    // espera de 1 s perdia; interceptar o fechamento da janela arriscava deixá-la impossível
    // de fechar se o tratador não fosse chamado.) Os comandos rodam um de cada vez, na ordem.
    salvarProgresso(aberto.livro.id, { localizacao, fracao }).catch((e) =>
      log.warn(`falha ao salvar progresso: ${e}`),
    );
    sessao?.mover({ localizacao, fracao });
  }

  /** Tecla, clique ou rolagem com um livro aberto: a leitura continua (sessão). */
  function aoAgir() {
    sessao?.atividade();
  }

  let gerandoCapas = false;
  /**
   * PDFs cuja capa não saiu nesta sessão (ex.: com senha): não tenta de novo a cada importação.
   * Na próxima vez que o app abrir, tenta uma vez de novo.
   */
  const semCapa = new Set<string>();

  /** PDFs chegam sem capa: renderiza a primeira página com o pdf.js, um livro por vez. */
  async function gerarCapasDePdfs() {
    if (gerandoCapas) return;
    gerandoCapas = true;
    try {
      // Import dinâmico: o pdf.js só é carregado se houver PDF sem capa.
      let pdf: typeof import("./lib/pdf") | undefined;
      for (const livro of livros.filter((l) => l.formato === "pdf" && !l.capa && !semCapa.has(l.id))) {
        try {
          pdf ??= await import("./lib/pdf");
          const capa = await pdf.gerarCapa(await arquivoDoLivro(livro.id));
          const atualizado = await definirCapa(livro.id, capa);
          livros = livros.map((l) => (l.id === atualizado.id ? atualizado : l));
        } catch (e) {
          semCapa.add(livro.id);
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
      case "favorito": {
        const marcar = livro.favoritoEm === null;
        await executar(
          () => definirFavorito(livro.id, marcar),
          marcar ? `${t} está nos Favoritos.` : `${t} saiu dos Favoritos.`,
          `Não foi possível mudar ${t}`,
        );
        return;
      }
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
      case "colecoes":
        colecoesDe = livro.id;
        return;
      case "tirar-da-colecao":
        // Chega por onTirarDaColecao (a biblioteca sabe de qual coleção).
        return;
      case "apagar":
        // Irreversível: só depois de confirmar.
        confirmar = { tipo: "apagar", livro };
        return;
    }
  }

  /** Confirmar no diálogo de nome: cria ou renomeia; com erro, o diálogo fica aberto. */
  async function nomeConfirmado(nome: string) {
    const pedido = pedirNome;
    if (!pedido) return;
    try {
      if (pedido.colecao) {
        await renomearColecao(pedido.colecao.id, nome);
        avisar(`A coleção agora se chama “${nome.trim()}”.`);
      } else {
        const nova = await criarColecao(nome);
        avisar(`Coleção “${nova.nome}” criada.`);
      }
    } catch (e) {
      pedirNome = { ...pedido, erro: String(e) };
      return;
    }
    pedirNome = null;
    await recarregar();
  }

  async function alternarColecao(colecao: number, marcar: boolean) {
    const livro = livroDasColecoes;
    if (!livro) return;
    try {
      if (marcar) await adicionarAColecao(colecao, livro.id);
      else await removerDaColecao(colecao, livro.id);
    } catch (e) {
      avisar(`Não foi possível mudar as coleções de ${livro.titulo}: ${e}`, "erro");
    }
    await recarregar();
  }

  /** Cria a coleção e já põe o livro nela; devolve o erro (para o diálogo) ou null. */
  async function criarComLivro(nome: string): Promise<string | null> {
    const livro = livroDasColecoes;
    if (!livro) return null;
    try {
      const nova = await criarColecao(nome);
      await adicionarAColecao(nova.id, livro.id);
      avisar(`Coleção “${nova.nome}” criada com ${livro.titulo}.`);
    } catch (e) {
      return String(e);
    }
    await recarregar();
    return null;
  }

  async function tirarDaColecao(livro: Livro, colecao: number) {
    const nome = colecoes.find((c) => c.id === colecao)?.nome ?? "a coleção";
    await executar(
      () => removerDaColecao(colecao, livro.id),
      `${livro.titulo} saiu de “${nome}”.`,
      `Não foi possível tirar ${livro.titulo} da coleção`,
      {
        rotulo: "Desfazer",
        executar: () =>
          void executar(
            () => adicionarAColecao(colecao, livro.id),
            `${livro.titulo} voltou para “${nome}”.`,
            `Não foi possível devolver ${livro.titulo} à coleção`,
          ),
      },
    );
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
    } else if (pedido?.tipo === "apagar-colecao") {
      const { colecao } = pedido;
      await executar(
        () => apagarColecao(colecao.id),
        `A coleção “${colecao.nome}” foi apagada. Os livros continuam na biblioteca.`,
        `Não foi possível apagar a coleção “${colecao.nome}”`,
      );
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
    const id = aberto?.livro.id;
    void sessao?.encerrar();
    sessao = null;
    ultimoAberto = id;
    // A lista é recarregada antes, para a capa de destino já estar na tela nova.
    await recarregar();
    const voltar = () => {
      aberto = null;
      doLeitor = { comandos: [] };
    };
    if (id) await transicionar(id, "fechar", voltar);
    else voltar();
  }
</script>

<svelte:window onkeydown={aoTeclar} onkeydowncapture={aoAgir} onpointerdown={aoAgir} onwheel={aoAgir} />

<Atalhos {contexto} aberto={ajudaAberta} onFechar={() => (ajudaAberta = false)} />
<Sobre aberto={sobreAberto} onFechar={() => (sobreAberto = false)} />
<Paleta
  aberto={paletaAberta}
  {comandos}
  porTermo={aberto ? doLeitor.porTermo : undefined}
  textoDoCampo={!aberto
    ? "Buscar comando ou livro…"
    : aberto.livro.formato === "pdf"
      ? "Buscar comando ou número da página…"
      : "Buscar comando ou capítulo…"}
  onFechar={() => (paletaAberta = false)}
/>
<Avisos />

<Confirmacao
  aberto={confirmar !== null}
  titulo={confirmar?.tipo === "esvaziar"
    ? "Esvaziar a lixeira?"
    : confirmar?.tipo === "apagar-colecao"
      ? `Apagar a coleção “${confirmar.colecao.nome}”?`
      : `Apagar ${confirmar?.livro.titulo ?? ""} de vez?`}
  rotuloConfirmar={confirmar?.tipo === "esvaziar"
    ? "Esvaziar"
    : confirmar?.tipo === "apagar-colecao"
      ? "Apagar coleção"
      : "Apagar de vez"}
  onConfirmar={confirmado}
  onCancelar={() => (confirmar = null)}
>
  {#if confirmar?.tipo === "apagar-colecao"}
    <p>Só a coleção é apagada: os livros continuam na biblioteca e nas outras coleções.</p>
  {:else if confirmar?.tipo === "esvaziar"}
    <p>
      {lixeira.length === 1 ? "O livro da lixeira será apagado" : `Os ${lixeira.length} livros da lixeira serão apagados`}
      de vez, com o progresso de leitura. Não dá para desfazer.
    </p>
  {:else}
    <p>O livro e o progresso de leitura serão apagados de vez. Não dá para desfazer.</p>
  {/if}
  {#if confirmar?.tipo !== "apagar-colecao"}
    <p>Os arquivos originais, de onde os livros foram importados, não são afetados.</p>
  {/if}
</Confirmacao>

<PedirNome
  aberto={pedirNome !== null}
  titulo={pedirNome?.colecao ? "Renomear coleção" : "Nova coleção"}
  rotuloConfirmar={pedirNome?.colecao ? "Renomear" : "Criar"}
  valorInicial={pedirNome?.colecao?.nome ?? ""}
  erro={pedirNome?.erro ?? null}
  onConfirmar={nomeConfirmado}
  onCancelar={() => (pedirNome = null)}
/>

<EscolherColecoes
  aberto={livroDasColecoes !== null}
  titulo={livroDasColecoes?.titulo ?? ""}
  {colecoes}
  marcadas={livroDasColecoes?.colecoes ?? []}
  onAlternar={alternarColecao}
  onCriar={criarComLivro}
  onFechar={() => (colecoesDe = null)}
/>

{#if aberto?.livro.formato === "pdf"}
  <!-- Importado em abrir(), antes da transição: o pdf.js só é carregado quando um PDF é aberto. -->
  {#if LeitorPdf}
    <LeitorPdf
      dados={aberto.dados}
      livroId={aberto.livro.id}
      titulo={aberto.livro.titulo}
      inicio={aberto.inicio}
      ultimaLeitura={aberto.ultimaLeitura}
      onFechar={fechar}
      onProgresso={aoProgredir}
      onComandos={(c: ComandosDoLeitor) => (doLeitor = c)}
    />
  {/if}
{:else if aberto}
  <Leitor
    arquivo={new File([aberto.dados], `${aberto.livro.id}.epub`, { type: "application/epub+zip" })}
    livroId={aberto.livro.id}
    inicio={aberto.inicio}
    ultimaLeitura={aberto.ultimaLeitura}
    onFechar={fechar}
    onProgresso={aoProgredir}
    onComandos={(c) => (doLeitor = c)}
  />
{:else}
  <Biblioteca
    bind:this={biblioteca}
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
    {colecoes}
    onNovaColecao={() => (pedirNome = { colecao: null, erro: null })}
    onRenomearColecao={(colecao) => (pedirNome = { colecao, erro: null })}
    onApagarColecao={(colecao) => (confirmar = { tipo: "apagar-colecao", colecao })}
    onTirarDaColecao={tirarDaColecao}
  />
{/if}
