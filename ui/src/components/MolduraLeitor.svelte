<script lang="ts">
  import { onMount, tick, untrack, type Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import { sistema } from "../lib/ambiente.svelte";
  import { cartoesEmbaixo } from "../lib/destaques";
  import { escala } from "../lib/escala.svelte";
  import Icone from "./Icone.svelte";
  import PainelLateral from "./PainelLateral.svelte";
  import ResumoDaMeta from "./ResumoDaMeta.svelte";
  import CartaoContinuacao from "./CartaoContinuacao.svelte";
  import { textoDaContinuacao, type Continuacao } from "../lib/continuacao";
  import {
    duracaoPorExtenso,
    nomeDoFocoPlanejado,
    type Meta,
    type MetaDaSessao,
  } from "../lib/meta.svelte";
  import { ATRIBUTO_AREA, ATRIBUTO_TELA } from "../lib/transicao";
  import { preferencias } from "../lib/preferencias.svelte";
  import { animarVirada, cancelarVirada, quadrosDaVirada, type Sentido } from "../lib/virada";
  import { curva, duracao } from "../lib/animacao";

  // Estrutura comum aos leitores de EPUB e PDF: os mesmos botões nos mesmos lugares, os mesmos
  // painéis com as mesmas animações e os mesmos anúncios. Cada formato só preenche as áreas.
  let {
    titulo,
    anuncio = "",
    progresso = 0,
    indiceAberto = $bindable(true),
    aparenciaAberta = $bindable(false),
    modoFoco = $bindable(false),
    umaIdeia = $bindable(false),
    escOcupado = false,
    meta,
    saidaDoFoco,
    estimativa,
    continuacao = null,
    onContinuar,
    onFechar,
    acoes,
    indice,
    aparencia,
    rodape,
    fixado,
    lado,
    rodapeLado,
    onAlternarLado,
    children,
  }: {
    titulo: string;
    /** Texto para leitores de tela (região aria-live), ex.: "Seção: Capítulo 3". */
    anuncio?: string;
    /** Fração lida (0 a 1), mostrada numa barra fina sob o cabeçalho. */
    progresso?: number;
    indiceAberto?: boolean;
    aparenciaAberta?: boolean;
    /** Modo foco: só o livro na tela; as barras aparecem por cima quando chamadas. */
    modoFoco?: boolean;
    /** Uma ideia por vez (M19): só o bloco atual em evidência. O leitor faz o resto. */
    umaIdeia?: boolean;
    /** O Esc é de outra coisa no leitor (ex.: a barra de destaque aberta): não sai da uma ideia. */
    escOcupado?: boolean;
    /** Meta da sessão (M20b): indicador no rodapé e a pausa ao cumprir. O leitor a move. */
    meta?: MetaDaSessao;
    /** Saída planejada do modo foco (M20c): conta como uma meta; ao cumprir, o foco acaba. */
    saidaDoFoco?: MetaDaSessao;
    /** Quanto falta no ritmo de quem lê (M21), ex.: "~12 min no capítulo". */
    estimativa?: string;
    /** "Onde você parou" (M22): aparece quando o leitor o dá, ao reabrir o livro. */
    continuacao?: Continuacao | null;
    /** O cartão fechou pelo botão ou pelo Esc: o leitor mostra o ponto (ex.: fazendo-o piscar). */
    onContinuar?: () => void;
    onFechar: () => void;
    /** Ações próprias do formato no cabeçalho (ex.: busca do PDF). */
    acoes?: Snippet;
    indice: Snippet;
    aparencia: Snippet;
    rodape: Snippet;
    /** Destaques fixados ao lado do texto (M25a): numa coluna à direita; fora do modo foco. */
    fixado?: Snippet;
    /**
     * Outro ponto do livro ao lado do principal (M25b): o livro se divide em dois, lado a lado
     * (também na janela estreita: um em cima do outro confundia qual era qual). Fora do modo foco.
     */
    lado?: Snippet;
    /**
     * Os controles do lado (seção, páginas, fechar), no rodapé, à direita: o lado não tem barra
     * própria, para as duas áreas terem a mesma altura (e paginarem igual).
     */
    rodapeLado?: Snippet;
    /** Abre o lado no ponto em que o livro está, ou o fecha (botão e Ctrl+Shift+L). */
    onAlternarLado?: () => void;
    /** O conteúdo do livro. */
    children: Snippet;
  } = $props();

  let tituloEl: HTMLHeadingElement;
  let areaEl: HTMLDivElement;
  let botaoIndice: HTMLButtonElement;
  let botaoAparencia: HTMLButtonElement;

  // Janela estreita: os painéis cobrem o livro (que não muda de tamanho nem é repaginado),
  // um de cada vez, com um véu por trás. O índice começa fechado para o livro aparecer.
  const estreita = $derived(sistema.estreita);
  if (untrack(() => sistema.estreita)) indiceAberto = false;
  $effect.pre(() => {
    if (estreita && untrack(() => indiceAberto && aparenciaAberta)) indiceAberto = false;
  });
  const cobrindo = $derived(estreita && (indiceAberto || aparenciaAberta));

  // Destaques fixados (M25a): ao lado do livro ou, sem largura para a coluna, embaixo dele.
  let molduraEl: HTMLDivElement;
  let larguraMoldura = $state(0);
  const remPx = $derived.by(() => {
    void escala.fator; // a letra da interface acompanha a escala do sistema
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  });
  const embaixo = $derived.by(() => {
    if (!fixado || modoFoco) return false;
    // Na janela estreita, os painéis cobrem o livro: não tiram largura dele.
    const paineis = estreita ? 0 : (indiceAberto ? 19.5 : 0) + (aparenciaAberta ? 21.5 : 0);
    // Com o lado aberto, o livro se divide em dois.
    const lados = lado ? 2 : 1;
    return cartoesEmbaixo(larguraMoldura, remPx, paineis, lados);
  });

  async function alternar(painel: "indice" | "aparencia") {
    const abrir = painel === "indice" ? !indiceAberto : !aparenciaAberta;
    // Abrir um painel (pela barra revelada) sai do modo foco: ele não cabe sobre as barras.
    if (abrir && modoFoco) sairDoFoco(false);
    if (painel === "indice") indiceAberto = abrir;
    else aparenciaAberta = abrir;
    if (!estreita || !abrir) return;
    if (painel === "indice") aparenciaAberta = false;
    else indiceAberto = false;
    // O painel cobre o livro: o foco vai para ele (Esc ou o véu fecham e o devolvem).
    await tick();
    document.getElementById(painel)?.focus();
  }

  /** Abre um painel (se fechado) e leva o foco a ele (paleta de comandos). */
  export async function mostrarPainel(painel: "indice" | "aparencia") {
    if (modoFoco) sairDoFoco(false);
    const aberto = painel === "indice" ? indiceAberto : aparenciaAberta;
    if (!aberto) await alternar(painel);
    await tick();
    document.getElementById(painel)?.focus();
  }

  /** Fecha o painel que cobre o livro e devolve o foco ao botão que o abriu. */
  function fecharPainel() {
    if (aparenciaAberta) {
      aparenciaAberta = false;
      botaoAparencia.focus();
    } else if (indiceAberto) {
      indiceAberto = false;
      botaoIndice.focus();
    }
  }

  /** Botão de fechar dos painéis: fecha e devolve o foco ao botão da barra. */
  function fecharIndice() {
    indiceAberto = false;
    botaoIndice.focus();
  }

  function fecharAparencia() {
    aparenciaAberta = false;
    botaoAparencia.focus();
  }

  // Modo foco: o cabeçalho e o rodapé saem do grid e ficam por cima do livro, escondidos
  // (transform + opacity). O livro cresce uma vez, ao entrar e ao sair; revelar as barras não
  // o repagina. Elas continuam no DOM e no Tab: o foco nelas as revela (nada só no ponteiro).
  // Com o ponteiro, as faixas finas nas bordas (sensores) as revelam, e elas somem um pouco
  // depois de o ponteiro sair. Os painéis abertos fecham ao entrar e voltam ao sair.
  let focoNasBarras = $state(false);
  let ponteiroNasBarras = $state(false);
  const revelada = $derived(modoFoco && (focoNasBarras || ponteiroNasBarras));
  let anuncioFoco = $state("");
  let paineisAntes: { indice: boolean; aparencia: boolean } | null = null;
  let esconder: ReturnType<typeof setTimeout> | undefined;
  /** Quanto as barras esperam, depois de o ponteiro sair, para sumir. */
  const ESPERA_ESCONDER_MS = 700;

  /** Entra ou sai do modo foco (botão, Ctrl+Shift+F e paleta de comandos). */
  export function alternarFoco() {
    if (modoFoco) {
      sairDoFoco();
      return;
    }
    paineisAntes = { indice: indiceAberto, aparencia: aparenciaAberta };
    indiceAberto = false;
    aparenciaAberta = false;
    modoFoco = true;
    ponteiroNasBarras = false;
    anuncioFoco = "Modo foco ativado. Esc para sair.";
    // O foco estava numa barra que vai sumir (ex.: o botão): passa para o livro.
    const foco = document.activeElement;
    if (foco instanceof HTMLElement && foco.closest(".moldura > header, .moldura > footer")) {
      focoNasBarras = false;
      areaEl.focus({ preventScroll: true });
    }
  }

  /**
   * Modo foco com saída planejada ("por 10 min", "até o fim do capítulo"); `null` tira a saída
   * e fica no foco. Entra no foco se preciso.
   */
  export function focarPor(saida: Meta | null) {
    if (!modoFoco) alternarFoco();
    saidaDoFoco?.definir(saida);
    anuncioFoco = saida
      ? `Modo foco ${nomeDoFocoPlanejado(saida)}. Esc sai antes.`
      : "Modo foco sem hora para sair.";
  }

  // A saída planejada se cumpriu: o foco acaba sozinho, sem diálogo (só o anúncio).
  $effect(() => {
    const cumprida = saidaDoFoco?.resumo;
    if (!cumprida) return;
    untrack(() => {
      if (modoFoco) sairDoFoco();
      anuncioFoco = `Modo foco encerrado como planejado, depois de ${duracaoPorExtenso(cumprida.segundos)} de leitura.`;
      saidaDoFoco?.definir(null);
    });
  });

  /** Sai do modo foco; `restaurar` reabre os painéis que estavam abertos ao entrar. */
  function sairDoFoco(restaurar = true) {
    saidaDoFoco?.definir(null);
    modoFoco = false;
    clearTimeout(esconder);
    ponteiroNasBarras = false;
    if (restaurar && paineisAntes) {
      indiceAberto = paineisAntes.indice;
      aparenciaAberta = paineisAntes.aparencia;
    }
    paineisAntes = null;
    anuncioFoco = "Modo foco desativado.";
  }

  /** Liga ou desliga a uma ideia por vez (botão, Ctrl+Shift+B e paleta de comandos). */
  export function alternarUmaIdeia() {
    umaIdeia = !umaIdeia;
    anuncioFoco = umaIdeia
      ? "Uma ideia por vez ativada: seta para baixo e para cima passam de bloco. Esc sai."
      : "Uma ideia por vez desativada.";
  }

  function aoEntrarNasBarras() {
    clearTimeout(esconder);
    // Com "barras só pelo teclado", o ponteiro não revela nada: nem as faixas (que nem existem)
    // nem a beira do cabeçalho e do rodapé escondidos, que o mouse acerta ao entrar na janela
    // pela borda.
    if (modoFoco && !preferencias.barrasSoPeloTeclado) ponteiroNasBarras = true;
  }

  // Ao voltar para a janela (no Hyprland, basta o mouse entrar nela), o navegador devolve o
  // foco ao elemento que o tinha, com um novo `focusin`. Se era um botão das barras, elas
  // reapareciam sem ninguém ter pedido. Esse foco devolvido não revela; um Tab, sim.
  let voltandoAJanela = false;
  function aoSairDaJanela() {
    voltandoAJanela = true;
  }
  function aoVoltarAJanela() {
    setTimeout(() => (voltandoAJanela = false));
  }

  function aoSairDasBarras() {
    clearTimeout(esconder);
    esconder = setTimeout(() => (ponteiroNasBarras = false), ESPERA_ESCONDER_MS);
  }

  function aoFocarBarra() {
    if (voltandoAJanela && modoFoco) return;
    focoNasBarras = true;
  }

  function aoDesfocarBarra(e: FocusEvent) {
    const destino = e.relatedTarget;
    const nasBarras =
      destino instanceof Element && !!destino.closest(".moldura > header, .moldura > footer");
    if (!nasBarras) focoNasBarras = false;
  }

  // Os avisos (Avisos.svelte) ficam acima do rodapé enquanto um livro está aberto: a altura
  // real dele vai para --rodape-leitor (em janela estreita, o rodapé quebra em duas linhas).
  // No modo foco, com o rodapé escondido, os avisos descem até a borda.
  let rodapeEl: HTMLElement;
  function publicarRodape() {
    const altura = modoFoco && !revelada ? 0 : rodapeEl.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--rodape-leitor", `${altura}px`);
  }
  $effect(() => {
    void modoFoco;
    void revelada;
    publicarRodape();
  });
  // O relógio da meta: um tique por segundo (só conta com a janela à vista e com atividade
  // recente, ver lib/meta.svelte.ts). Teclas, cliques e a roda contam como atividade.
  onMount(() => {
    const contagens = [meta, saidaDoFoco].filter((m) => m !== undefined);
    if (!contagens.length) return;
    const relogio = setInterval(() => {
      const visivel = document.visibilityState === "visible";
      for (const m of contagens) m.tique(visivel);
    }, 1000);
    const agir = () => contagens.forEach((m) => m.atividade());
    const opcoes = { capture: true, passive: true };
    for (const tipo of ["keydown", "pointerdown", "wheel"]) window.addEventListener(tipo, agir, opcoes);
    return () => {
      clearInterval(relogio);
      for (const tipo of ["keydown", "pointerdown", "wheel"])
        window.removeEventListener(tipo, agir, opcoes);
    };
  });

  onMount(() => {
    const observador =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => publicarRodape());
    observador?.observe(rodapeEl);
    // A largura da moldura decide onde ficam os destaques fixados (`embaixo`).
    const largura =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => (larguraMoldura = molduraEl.clientWidth));
    largura?.observe(molduraEl);
    return () => {
      observador?.disconnect();
      largura?.disconnect();
      clearTimeout(esconder);
      document.documentElement.style.removeProperty("--rodape-leitor");
    };
  });

  // "Onde você parou" (M22): aparece quando o leitor termina de montá-lo, some com "Continuar
  // lendo", com Esc ou ao virar a página, e volta pela paleta (mostrarContinuacao).
  let continuacaoAberta = $state(false);
  $effect(() => {
    const c = continuacao;
    if (c) untrack(() => mostrarContinuacao());
  });

  /** Mostra o cartão de novo (paleta) e o anuncia. */
  export function mostrarContinuacao() {
    if (!continuacao) return;
    continuacaoAberta = true;
    anuncioFoco = textoDaContinuacao(continuacao);
  }

  /** Fecha o cartão pelo botão ou pelo Esc: o foco vai para o livro e o ponto é mostrado. */
  function fecharContinuacao() {
    continuacaoAberta = false;
    areaEl.focus({ preventScroll: true });
    onContinuar?.();
  }

  /** Leva o foco ao título: o leitor de tela anuncia qual livro foi aberto. */
  export function focarTitulo() {
    tituloEl.focus();
  }

  /**
   * Navega com a animação de virada escolhida nas preferências: igual para EPUB e PDF.
   * `sentido` é o lado de onde a página nova vem; `navegar` só deve terminar quando a página
   * nova estiver pronta (no PDF, renderizada). Estilo Apple, nada pesado durante o
   * movimento: a área fica invisível enquanto isso (é o primeiro quadro de toda virada) e a
   * animação começa com a thread livre. A virada anterior é cancelada antes: os leitores
   * medem a área do livro e ela não pode estar transformada.
   */
  export async function virarPagina(sentido: Sentido, navegar: () => unknown): Promise<void> {
    cancelarVirada();
    // Virar a página é seguir lendo: o "onde você parou" já cumpriu o papel.
    continuacaoAberta = false;
    const animar = duracao("curta") > 0 && quadrosDaVirada(preferencias.virada, sentido) !== null;
    if (animar) areaEl.style.opacity = "0";
    try {
      await navegar();
    } finally {
      // Volta ao normal na mesma tarefa em que a animação começa: não há quadro intermediário.
      if (animar) areaEl.style.opacity = "";
    }
    animarVirada(areaEl, preferencias.virada, sentido);
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      alternarFoco();
      return;
    }
    if (onAlternarLado && e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      onAlternarLado();
      return;
    }
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      alternarUmaIdeia();
      return;
    }
    if (e.key !== "Escape") return;
    // O cartão de "onde você parou" fica por cima do livro: o Esc o fecha primeiro.
    if (continuacaoAberta) {
      e.preventDefault();
      fecharContinuacao();
      return;
    }
    // No modo foco não há painel aberto: o Esc sai dele.
    if (modoFoco) {
      e.preventDefault();
      sairDoFoco();
      return;
    }
    const foco = document.activeElement;
    // Painel cobrindo o livro (janela estreita): o Esc sempre o fecha.
    if (cobrindo) {
      e.preventDefault();
      fecharPainel();
      return;
    }
    // Fecha o painel em que o foco está; senão, o de aparência (o que costuma cobrir o livro).
    if (indiceAberto && foco?.closest("#indice")) {
      e.preventDefault();
      indiceAberto = false;
      botaoIndice.focus();
    } else if (aparenciaAberta) {
      e.preventDefault();
      const estavaDentro = !!foco?.closest("#aparencia");
      aparenciaAberta = false;
      // O foco estava no painel, que some: devolve ao botão que o abriu.
      if (estavaDentro) botaoAparencia.focus();
    } else if (umaIdeia && !escOcupado) {
      // Por último: o Esc fecha antes o que estiver aberto.
      e.preventDefault();
      alternarUmaIdeia();
    }
  }
</script>

<svelte:window onkeydown={aoTeclar} onblur={aoSairDaJanela} onfocus={aoVoltarAJanela} />

<div
  class="moldura"
  class:estreita
  class:foco={modoFoco}
  class:fixados-embaixo={embaixo}
  class:com-lado={!!lado && !modoFoco}
  bind:this={molduraEl}
  class:revelada
  {...{ [ATRIBUTO_TELA]: "" }}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header
    onfocusin={aoFocarBarra}
    onfocusout={aoDesfocarBarra}
    onpointerenter={aoEntrarNasBarras}
    onpointerleave={aoSairDasBarras}
  >
    <div class="lado inicio">
      <button
        type="button"
        bind:this={botaoIndice}
        aria-expanded={indiceAberto}
        aria-controls="indice"
        onclick={() => alternar("indice")}
      >
        <Icone nome="indice" /><span class="rotulo">Índice</span>
      </button>
    </div>
    <h1 tabindex="-1" bind:this={tituloEl}>{titulo}</h1>
    <div class="lado fim">
      {@render acoes?.()}
      {#if onAlternarLado}
        <button
          type="button"
          aria-pressed={!!lado}
          aria-keyshortcuts="Control+Shift+L"
          onclick={onAlternarLado}
        >
          <Icone nome="dividir" /><span class="rotulo">Abrir ao lado</span>
        </button>
      {/if}
      <button
        type="button"
        aria-pressed={umaIdeia}
        aria-keyshortcuts="Control+Shift+B"
        onclick={alternarUmaIdeia}
      >
        <Icone nome="ideia" /><span class="rotulo">Uma ideia por vez</span>
      </button>
      <button
        type="button"
        aria-pressed={modoFoco}
        aria-keyshortcuts="Control+Shift+F"
        onclick={alternarFoco}
      >
        <Icone nome="foco" /><span class="rotulo">Modo foco</span>
      </button>
      <button
        type="button"
        bind:this={botaoAparencia}
        aria-expanded={aparenciaAberta}
        aria-controls="aparencia"
        onclick={() => alternar("aparencia")}
      >
        <Icone nome="aparencia" /><span class="rotulo">Aparência</span>
      </button>
      <button type="button" onclick={onFechar}>
        <Icone nome="voltar" /><span class="rotulo">Voltar à biblioteca</span>
      </button>
    </div>
    <!-- Decorativa: a porcentagem lida está no rodapé, como texto. -->
    <div class="progresso-leitura" aria-hidden="true">
      <span style:transform="scaleX({Math.min(1, Math.max(0, progresso))})"></span>
    </div>
  </header>

  <div class="area-indice">
    <PainelLateral
      id="indice"
      rotulo="Índice"
      aberto={indiceAberto}
      lado="inicio"
      elemento="nav"
      onFechar={fecharIndice}
    >
      {@render indice()}
    </PainelLateral>
  </div>

  <!-- Destino (e origem, ao fechar) da capa na transição com a biblioteca (lib/transicao.ts). -->
  <!-- tabindex -1: recebe o foco ao entrar no modo foco pelo botão (a barra some). -->
  <div class="conteudo" tabindex="-1" bind:this={areaEl} {...{ [ATRIBUTO_AREA]: "" }}>
    {@render children()}
  </div>

  {#if modoFoco}
    <!-- Faixas nas bordas: o ponteiro nelas revela as barras (no teclado, o Tab as revela).
         Com "barras só pelo teclado" nas preferências, não há faixas. -->
    {#if !preferencias.barrasSoPeloTeclado}
      <div class="sensor topo" aria-hidden="true" onpointerenter={aoEntrarNasBarras}></div>
      <div class="sensor base" aria-hidden="true" onpointerenter={aoEntrarNasBarras}></div>
    {/if}
    <!-- Decorativo: a porcentagem lida continua no rodapé, como texto; a saída planejada foi
         anunciada ao entrar. -->
    <span class="progresso-canto" aria-hidden="true">
      {Math.round(progresso * 100)}%{#if saidaDoFoco?.meta}&ensp;·&ensp;foco: {saidaDoFoco.texto}{/if}
    </span>
  {/if}

  {#if lado && !modoFoco}
    <div class="area-lado">{@render lado()}</div>
  {/if}

  {#if fixado && !modoFoco}
    <div class="area-fixado">{@render fixado()}</div>
  {/if}

  {#if continuacaoAberta && continuacao}
    <div class="area-continuacao">
      <CartaoContinuacao {continuacao} onFechar={fecharContinuacao} />
    </div>
  {/if}

  {#if cobrindo}
    <!-- Só para o mouse: no teclado, Esc fecha o painel. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="veu"
      aria-hidden="true"
      onclick={fecharPainel}
      transition:fade={{ duration: duracao("media"), easing: curva }}
    ></div>
  {/if}

  <div class="area-aparencia">
    <PainelLateral
      id="aparencia"
      rotulo="Aparência"
      aberto={aparenciaAberta}
      lado="fim"
      onFechar={fecharAparencia}
    >
      {@render aparencia()}
    </PainelLateral>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <footer
    bind:this={rodapeEl}
    onfocusin={aoFocarBarra}
    onfocusout={aoDesfocarBarra}
    onpointerenter={aoEntrarNasBarras}
    onpointerleave={aoSairDasBarras}
  >
    <!-- Sem o lado, só agrupa (display: contents); com ele, fica embaixo do livro principal. -->
    <div class="rodape-principal">
      {@render rodape()}
      {#if estimativa}
        <span class="estimativa">{estimativa}</span>
      {/if}
      {#if meta?.meta}
        <div class="meta" role="group" aria-label="Meta da sessão">
          <span class="texto-meta">Meta: {meta.texto}</span>
          <!-- Decorativa: o texto ao lado diz o mesmo. -->
          <span class="barra-meta" aria-hidden="true">
            <span style:transform="scaleX({meta.progresso})"></span>
          </span>
          <button type="button" class="tirar-meta" aria-label="Tirar a meta da sessão" onclick={() => meta.definir(null)}>
            <Icone nome="fechar" />
          </button>
        </div>
      {/if}
    </div>
    {#if lado && rodapeLado && !modoFoco}
      <div class="rodape-lado" role="group" aria-label="Ao lado">{@render rodapeLado()}</div>
    {/if}
  </footer>

  {#if meta}
    <ResumoDaMeta
      resumo={meta.resumo}
      onContinuar={() => meta.continuar()}
      onRepetir={() => meta.repetir()}
      onVoltar={() => {
        meta.continuar();
        onFechar();
      }}
    />
  {/if}

  <p class="so-leitor-de-tela" aria-live="polite">{anuncio}</p>
  <p class="so-leitor-de-tela" aria-live="polite">{anuncioFoco}</p>
</div>

<style>
  .moldura {
    display: grid;
    /* A 3ª coluna é o lado (M25b): sem largura até ele abrir (.com-lado). */
    grid-template-columns: auto minmax(0, 1fr) 0 auto auto;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "topo topo topo topo topo"
      "indice conteudo lado fixado aparencia"
      "rodape rodape rodape rodape rodape";
    height: 100vh;
    background: var(--app);
    /* clip, não hidden: nada aqui é rolável, nem pelo teclado. No WebKitGTK, as setas rolavam
       a página inteira pela sobra das barras escondidas do modo foco (transform conta como
       conteúdo) e rolariam um contêiner com overflow: hidden. */
    overflow: clip;
  }

  /* Título centralizado quando cabe: as laterais dividem o resto por igual, mas nunca ficam
     menores que o próprio conteúdo (no PDF, a busca deixa o lado direito mais largo). */
  header {
    grid-area: topo;
    position: relative;
    display: grid;
    grid-template-columns: minmax(min-content, 1fr) minmax(3rem, auto) minmax(min-content, 1fr);
    align-items: center;
    gap: 0.75rem;
    padding: 0.35rem 0.75rem;
    background: var(--painel);
    border-block-end: 1px solid var(--divisoria);
  }

  .lado {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .lado.fim {
    justify-content: flex-end;
  }

  /* Botões das barras: sem borda, fundo só sob o ponteiro (no alto contraste, com borda). */
  header :global(button),
  footer :global(button) {
    flex-shrink: 0;
    justify-content: center;
    white-space: nowrap;
    min-width: 2.25rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.6rem;
    border-color: transparent;
    border-radius: var(--raio);
    background: transparent;
  }

  header :global(button:hover:not(:disabled)),
  footer :global(button:hover:not(:disabled)) {
    background: var(--hover);
  }

  :global([data-tema="alto-contraste"]) :is(header, footer) :global(button) {
    border-color: var(--borda);
  }

  .progresso-leitura {
    position: absolute;
    inset: auto 0 -1px;
    height: 3px;
  }

  .progresso-leitura span {
    display: block;
    height: 100%;
    background: var(--destaque);
    transform-origin: left;
    transition: transform var(--duracao-media) var(--curva);
  }

  h1 {
    min-width: 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .area-indice,
  .area-aparencia {
    display: flex;
    min-height: 0;
  }

  .area-indice {
    grid-area: indice;
  }

  .area-aparencia {
    grid-area: aparencia;
  }

  /* Destaques fixados (M25a): uma coluna de cartões entre o livro e a Aparência. */
  .area-fixado {
    grid-area: fixado;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    padding: 0.75rem;
    overflow-y: auto;
  }

  /* Sem largura para a coluna (o livro ficaria estreito demais): os cartões vão para uma
     faixa embaixo do livro, lado a lado, sem cobrir o texto. */
  /* Sem largura para a coluna (o livro ficaria estreito demais; ver `cartoesEmbaixo`): os
     cartões vão para uma faixa embaixo do livro, lado a lado, sem cobrir o texto. */
  .fixados-embaixo {
    grid-template-rows: auto 1fr auto auto;
    grid-template-areas:
      "topo topo topo topo topo"
      "indice conteudo lado lado aparencia"
      "fixado fixado fixado fixado fixado"
      "rodape rodape rodape rodape rodape";
  }

  /* Dois pontos do livro lado a lado (M25b): a área do livro se divide ao meio. */
  .com-lado {
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr) auto auto;
  }

  .area-lado {
    grid-area: lado;
    min-width: 0;
    min-height: 0;
  }


  .fixados-embaixo .area-fixado {
    flex-direction: row;
    max-height: 40vh;
    padding-block: 0 0.75rem;
    overflow-x: auto;
  }

  .fixados-embaixo .area-fixado > :global(.cartao) {
    flex: 1 0 16rem;
    width: auto;
    max-width: 40rem;
  }

  .area-indice :global(.painel) {
    width: 18rem;
  }

  .area-aparencia :global(.painel) {
    width: 20rem;
  }

  /* Itens de grid têm min-width: auto e cresceriam até caber o livro; aí o paginador do
     EPUB mede uma largura maior que a visível. position: relative ancora o visor do PDF. */
  .conteudo {
    grid-area: conteudo;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: clip;
  }

  /* Janela estreita: os painéis ficam na mesma célula do livro, por cima dele. */
  .estreita .area-indice,
  .estreita .area-aparencia,
  .veu {
    grid-area: conteudo;
    z-index: 1;
  }

  .estreita .area-indice {
    justify-self: start;
  }

  .estreita .area-aparencia {
    justify-self: end;
  }

  /* O cartão (PainelLateral) já tem fundo, borda e sombra: aqui só a camada. */
  .estreita .area-indice,
  .estreita .area-aparencia {
    z-index: 2;
    max-width: 100%;
  }

  .estreita .area-indice :global(.painel),
  .estreita .area-aparencia :global(.painel) {
    max-width: 100%;
  }

  .veu {
    background: rgb(0 0 0 / 30%);
  }

  /* "Onde você parou": por cima do livro, no alto, sem cobrir a tela inteira. */
  .area-continuacao {
    grid-area: conteudo;
    z-index: 2;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-block-start: 1rem;
    min-height: 0;
    pointer-events: none;
  }

  .area-continuacao > :global(*) {
    pointer-events: auto;
  }

  .estreita header {
    gap: 0.25rem;
    padding-inline: 0.4rem;
  }

  /* Modo foco: só o livro no grid; as barras flutuam por cima, escondidas até serem chamadas. */
  .foco {
    position: relative;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    grid-template-areas: "conteudo";
  }

  .foco .area-indice,
  .foco .area-aparencia {
    display: none;
  }

  header,
  footer {
    transition:
      transform var(--duracao-media) var(--curva),
      opacity var(--duracao-media) var(--curva);
  }

  .foco header,
  .foco footer {
    position: absolute;
    inset-inline: 0;
    z-index: 3;
    box-shadow: var(--sombra);
  }

  .foco header {
    top: 0;
  }

  .foco footer {
    bottom: 0;
  }

  .foco:not(.revelada) header {
    transform: translateY(-100%);
    opacity: 0;
  }

  .foco:not(.revelada) footer {
    transform: translateY(100%);
    opacity: 0;
  }

  .conteudo:focus {
    outline: none;
  }

  .sensor {
    position: absolute;
    inset-inline: 0;
    z-index: 2;
    height: 0.75rem;
  }

  .sensor.topo {
    top: 0;
  }

  .sensor.base {
    bottom: 0;
  }

  .progresso-canto {
    position: absolute;
    inset: auto 1rem 0.6rem auto;
    z-index: 2;
    color: var(--suave);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    transition: opacity var(--duracao-media) var(--curva);
  }

  .revelada .progresso-canto {
    opacity: 0;
  }

  .estimativa {
    color: var(--suave);
    font-size: 0.875rem;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--suave);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .barra-meta {
    width: 4rem;
    height: 3px;
    border-radius: 2px;
    background: var(--divisoria);
    overflow: hidden;
  }

  .barra-meta span {
    display: block;
    height: 100%;
    background: var(--destaque);
    transform-origin: left;
    transition: transform var(--duracao-media) var(--curva);
  }

  footer .tirar-meta {
    min-width: 1.75rem;
    min-height: 1.75rem;
    padding: 0.2rem;
  }

  footer {
    grid-area: rodape;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 1.5rem;
    padding: 0.35rem 0.75rem;
    background: var(--painel);
    border-block-start: 1px solid var(--divisoria);
  }

  .rodape-principal,
  .rodape-lado {
    display: contents;
  }

  /* Com o lado (M25b), o rodapé segue as colunas do grid: os controles de cada livro ficam
     embaixo dele (o principal na coluna do livro, os do lado na coluna do lado). */
  .com-lado footer {
    display: grid;
    grid-template-columns: subgrid;
    padding-inline: 0;
  }

  /* Cada metade igual nos dois lados: os controles de página no começo, a estimativa e a meta
     logo depois, e o que é só daquele lado ([data-fim-rodape]: a voz, "Fechar o lado")
     empurrado para o fim. Os controles de página ficam na mesma posição nos dois; sem espaço,
     quebram de linha (os botões mostram só o ícone: regra .com-lado footer .rotulo, app.css). */
  .com-lado .rodape-principal,
  .com-lado .rodape-lado {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    min-width: 0;
    padding-inline: 0.75rem;
  }

  .com-lado .rodape-principal > :global(.estimativa),
  .com-lado .rodape-principal > :global(.meta) {
    order: 1;
  }

  .com-lado .rodape-principal > :global([data-fim-rodape]),
  .com-lado .rodape-lado > :global([data-fim-rodape]) {
    order: 2;
    margin-inline-start: auto;
  }

  .com-lado .rodape-principal {
    grid-column: 2;
  }

  .com-lado .rodape-lado {
    grid-column: 3;
    border-inline-start: 1px solid var(--divisoria);
  }
</style>
