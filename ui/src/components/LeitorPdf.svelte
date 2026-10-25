<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
  import type { PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
  import "pdfjs-dist/web/pdf_viewer.css";
  import BarraPdf from "./BarraPdf.svelte";
  import BuscaPdf from "./BuscaPdf.svelte";
  import Indice from "./Indice.svelte";
  import AbasIndice, { type Aba } from "./AbasIndice.svelte";
  import DestaquesDoLeitor from "./DestaquesDoLeitor.svelte";
  import ListaDestaques from "./ListaDestaques.svelte";
  import type { Destaque } from "../lib/biblioteca";
  import { ControleDestaques } from "../lib/controleDestaques.svelte";
  import { estiloDoMarcaTexto, hexDaCor, posicaoDaBarra } from "../lib/destaques";
  import {
    acertou,
    lerLocalPdf,
    localPdf,
    naJanela,
    posicaoNoPdf,
    retangulosNaPagina,
  } from "../lib/destaquesPdf";
  import Carregando from "./Carregando.svelte";
  import MolduraLeitor from "./MolduraLeitor.svelte";
  import PainelPagina from "./PainelPagina.svelte";
  import PainelTema from "./PainelTema.svelte";
  import { sistema, temaEfetivo } from "../lib/ambiente.svelte";
  import type { ItemIndice } from "../lib/foliate";
  import { log } from "../lib/log";
  import { inverterCanvas, PAGINAS, resolverPagina } from "../lib/pagina";
  import { carregarPdf, carregarVisor } from "../lib/pdf";
  import { atualizarPreferencias, preferencias } from "../lib/preferencias.svelte";
  import { achatar, converterSumario, itemAtual, type ItemSumarioPdf } from "../lib/sumario";
  import { resolverTema } from "../lib/temas";
  import { aguardarTransicao } from "../lib/transicao";
  import {
    comandosDaPagina,
    comandosDoIndice,
    irParaPagina,
    type Comando,
    type ComandosDoLeitor,
  } from "../lib/comandos";
  import type { ModoPdf } from "../lib/preferencias.svelte";

  let {
    dados,
    livroId,
    titulo,
    inicio,
    onFechar,
    onProgresso,
    onComandos,
  }: {
    dados: ArrayBuffer;
    /** Id do livro na biblioteca (para os destaques). */
    livroId: string;
    titulo: string;
    /** Onde retomar, no formato `pagina:N` (salvo na biblioteca). */
    inicio?: string;
    onFechar: () => void;
    onProgresso?: (localizacao: string, fracao: number) => void;
    /** Publica os comandos deste documento para a paleta (Ctrl+K), de novo a cada mudança. */
    onComandos?: (comandos: ComandosDoLeitor) => void;
  } = $props();

  let moldura: MolduraLeitor;
  let conteiner: HTMLDivElement;
  let campoBusca = $state<HTMLInputElement>();
  let visor: PDFViewer | undefined;
  /** Modos de rolagem do pdf.js (ScrollMode), disponíveis depois de carregar o visor. */
  let modosDeRolagem: { PAGE: number; VERTICAL: number } | undefined;
  let pronto = $state(false);
  let links: PDFLinkService | undefined;
  let tarefa: PDFDocumentLoadingTask | undefined;

  let modoFoco = $state(false);

  // Destaques (M16c): a lógica comum está no ControleDestaques; aqui, a seleção na camada de
  // texto do pdf.js e uma camada própria sobre cada página (o arquivo do PDF não muda).
  let abaIndice = $state<Aba>("indice");
  let abas = $state<AbasIndice>();
  const destaques = new ControleDestaques({
    get livroId() {
      return livroId;
    },
    titulo: () => titulo,
    desenhar: (d) => redesenharDe(d),
    apagarDesenho: (d) => redesenharDe(d),
    irPara: irParaDestaque,
    focarTexto: () => conteiner.focus({ preventScroll: true }),
    limparSelecao: () => window.getSelection()?.removeAllRanges(),
    anunciar: (texto) => (anuncio = texto),
    mostrarLista: mostrarDestaques,
  });
  let pagina = $state(1);
  let total = $state(0);
  let zoom = $state(1);
  let resultadoBusca = $state("");
  let erro = $state<string | null>(null);

  // Sumário do PDF, no mesmo formato do índice do EPUB.
  let itensIndice = $state<ItemIndice[]>([]);
  let destinos = new Map<string, string | unknown[]>();
  let paginasDoIndice = $state(new Map<string, number>());
  const hrefAtual = $derived(itemAtual(paginasDoIndice, pagina));
  // Cor da página escolhida no painel Aparência.
  // A página escolhida (a automática segue a interface), igual à do EPUB.
  const paginaEfetiva = $derived(resolverPagina(preferencias.pagina, temaEfetivo()));
  const estiloPagina = $derived(PAGINAS[paginaEfetiva]);
  const invertida = $derived(paginaEfetiva === "noite");

  // Entrar ou sair da noite muda os pixels das páginas: o pdf.js as redesenha (as já
  // invertidas voltam ao original, e vice-versa). Creme e sépia são só uma camada por cima.
  let estavaInvertida = false;
  $effect(() => {
    const agora = invertida;
    if (!pronto || !visor || agora === estavaInvertida) return;
    estavaInvertida = agora;
    visor.refresh();
  });

  /** Texto da região aria-live: anuncia a mudança de seção (não cada página). */
  let anuncio = $state("");
  let secaoAnunciada: string | undefined;
  $effect(() => {
    const secao = achatar(itensIndice).find((i) => i.href === hrefAtual)?.label.trim();
    // A primeira seção não é anunciada: o foco no título já informa o documento.
    if (secao && secao !== secaoAnunciada) {
      if (secaoAnunciada !== undefined) anuncio = `Seção: ${secao}`;
      secaoAnunciada = secao;
    }
  });

  // Página a página (como um livro, zoom "página inteira") ou rolagem contínua (zoom
  // "largura"). Reage na hora quando a preferência muda.
  $effect(() => {
    const paginas = preferencias.modoPdf === "paginas";
    if (!pronto || !visor || !modosDeRolagem) return;
    visor.scrollMode = paginas ? modosDeRolagem.PAGE : modosDeRolagem.VERTICAL;
    visor.currentScaleValue = paginas ? "page-fit" : "page-width";
  });

  /** Estados do PDFFindController (FindState no pdf.js). */
  const BUSCA = { ENCONTRADO: 0, NADA: 1, VOLTOU_AO_INICIO: 2, PENDENTE: 3 };

  onMount(() => {
    moldura.focarTitulo();
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoApontar);
    abrir().catch((e) => {
      erro = `Não foi possível abrir o PDF: ${e}`;
      log.error(erro);
    });
    // A área do documento muda de tamanho (modo foco, painéis, janela): os zooms "página
    // inteira" e "largura" são recalculados, uma vez por quadro.
    let quadro = 0;
    const observador =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(quadro);
            quadro = requestAnimationFrame(() => {
              const valor = visor?.currentScaleValue;
              if (visor && (valor === "page-fit" || valor === "page-width"))
                visor.currentScaleValue = valor;
            });
          });
    observador?.observe(conteiner);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoApontar);
      observador?.disconnect();
      cancelAnimationFrame(quadro);
      tarefa?.destroy();
    };
  });

  async function abrir() {
    // Espera a transição da capa terminar: carregar o livro durante ela a faria engasgar.
    await aguardarTransicao();
    const { EventBus, PDFFindController, PDFLinkService, PDFViewer, ScrollMode } =
      await carregarVisor();
    modosDeRolagem = ScrollMode;
    const eventos = new EventBus();
    const l = new PDFLinkService({ eventBus: eventos });
    const busca = new PDFFindController({ eventBus: eventos, linkService: l });
    const v = new PDFViewer({ container: conteiner, eventBus: eventos, linkService: l, findController: busca });
    l.setViewer(v);
    visor = v;
    links = l;

    // Noite: inverte os pixels de cada página assim que o pdf.js a desenha (uma vez por
    // desenho). Registrado antes de qualquer outro "pagerendered": a virada (paginaRenderizada)
    // só começa depois, já com a página invertida. `cssTransform` é só um reescalonamento por
    // CSS, sem desenho novo: os pixels já estão invertidos.
    eventos.on(
      "pagerendered",
      ({ source, cssTransform, error }: { source: { canvas?: HTMLCanvasElement | null }; cssTransform: boolean; error: unknown }) => {
        if (invertida && !cssTransform && !error && source.canvas) {
          inverterCanvas(source.canvas);
        }
      },
    );
    estavaInvertida = invertida;
    // A camada dos destaques some quando o pdf.js refaz a página (zoom, redesenho): volta
    // a cada desenho, em porcentagens (não depende do zoom).
    eventos.on("pagerendered", ({ pageNumber }: { pageNumber: number }) =>
      desenharDestaques(pageNumber),
    );

    eventos.on("pagesinit", () => {
      pronto = true; // o efeito acima aplica o modo e o zoom
      const n = Number(inicio?.match(/^pagina:(\d+)$/)?.[1]);
      if (n >= 1 && n <= v.pagesCount) v.currentPageNumber = n;
      pagina = v.currentPageNumber;
      // Registra a abertura mesmo sem troca de página (senão o livro aparece como "Não iniciado").
      onProgresso?.(`pagina:${v.currentPageNumber}`, v.currentPageNumber / v.pagesCount);
    });
    eventos.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      destaques.esconder();
      pagina = pageNumber;
      onProgresso?.(`pagina:${pageNumber}`, total ? pageNumber / total : 0);
    });
    eventos.on("scalechanging", ({ scale }: { scale: number }) => {
      destaques.esconder();
      zoom = scale;
    });
    eventos.on(
      "updatefindcontrolstate",
      ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => {
        if (state === BUSCA.PENDENTE) resultadoBusca = "Buscando…";
        else if (state === BUSCA.NADA) resultadoBusca = "Nada encontrado";
        else resultadoBusca = `${matchesCount.current} de ${matchesCount.total}`;
      },
    );
    eventos.on(
      "updatefindmatchescount",
      ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
        if (matchesCount.total) resultadoBusca = `${matchesCount.current} de ${matchesCount.total}`;
      },
    );

    await destaques.carregar();
    tarefa = carregarPdf(dados);
    const documento = await tarefa.promise;
    total = documento.numPages;
    v.setDocument(documento);
    l.setDocument(documento);
    carregarSumario(documento).catch((e) => log.warn(`sumário do PDF indisponível: ${e}`));
  }

  async function carregarSumario(documento: PDFDocumentProxy) {
    const sumario = converterSumario((await documento.getOutline()) as ItemSumarioPdf[] | null);
    destinos = sumario.destinos;
    itensIndice = sumario.itens;
    // Página de cada item, para destacar a seção atual (como no EPUB).
    const paginas = new Map<string, number>();
    for (const [href, destino] of destinos) {
      try {
        const explicito =
          typeof destino === "string" ? await documento.getDestination(destino) : destino;
        const alvo = explicito?.[0];
        const indice =
          typeof alvo === "number"
            ? alvo
            : alvo && typeof alvo === "object"
              ? await documento.getPageIndex(alvo as { num: number; gen: number })
              : undefined;
        if (indice !== undefined) paginas.set(href, indice + 1);
      } catch {
        // Destino quebrado: o item continua navegável pelo pdf.js, só não é destacado.
      }
    }
    paginasDoIndice = paginas;
  }

  async function irParaSecao(href: string) {
    const destino = destinos.get(href);
    if (!links || destino === undefined) return;
    await links.goToDestination(destino);
    // Leva o foco ao documento: o leitor de tela continua a leitura dali.
    conteiner.focus();
  }

  /**
   * Página a página, a navegação passa pela moldura: mesma animação de virada que o EPUB.
   * Na rolagem contínua, o próprio pdf.js rola até a página (virar não faria sentido).
   */
  function irPara(n: number) {
    if (!visor || n < 1 || n > total || n === pagina) return;
    const v = visor;
    if (preferencias.modoPdf === "rolagem") {
      v.currentPageNumber = n;
      return;
    }
    moldura.virarPagina(n > pagina ? "direita" : "esquerda", () => {
      v.currentPageNumber = n;
      return paginaRenderizada(v, n);
    });
  }

  /** Estado "terminada" de uma página no pdf.js (RenderingStates.FINISHED). */
  const RENDERIZADA = 3;
  /** Limite de espera pela renderização: depois disso, anima assim mesmo. */
  const ESPERA_MAXIMA_MS = 400;

  /**
   * Resolve quando o pdf.js terminar de desenhar a página `n` (na hora, se já estiver pronta):
   * a virada só começa depois, para não disputar a thread com a renderização.
   */
  function paginaRenderizada(v: PDFViewer, n: number): Promise<void> {
    if (v.getPageView(n - 1)?.renderingState === RENDERIZADA) return Promise.resolve();
    return new Promise((resolver) => {
      const aoRenderizar = ({ pageNumber }: { pageNumber: number }) => {
        if (pageNumber === n) terminar();
      };
      const limite = setTimeout(() => terminar(), ESPERA_MAXIMA_MS);
      function terminar() {
        clearTimeout(limite);
        v.eventBus.off("pagerendered", aoRenderizar);
        resolver();
      }
      v.eventBus.on("pagerendered", aoRenderizar);
    });
  }

  function buscar(termo: string, anterior: boolean) {
    visor?.eventBus.dispatch("find", {
      source: null,
      // Mesmo termo de novo: "again" avança para a próxima ocorrência em vez de recomeçar.
      type: "again",
      query: termo,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: anterior,
      matchDiacritics: false,
    });
  }

  const MODOS_PDF: [ModoPdf, string][] = [
    ["paginas", "página a página"],
    ["rolagem", "rolagem contínua"],
  ];

  // Paleta de comandos: o que dá para fazer neste documento agora. Digitar um número oferece
  // "Ir para a página N" (porTermo).
  $effect(() => {
    const lista: Comando[] = [
      {
        id: "proxima",
        titulo: "Próxima página",
        grupo: "Leitura",
        teclas: [["→"]],
        executar: () => irPara(pagina + 1),
      },
      {
        id: "anterior",
        titulo: "Página anterior",
        grupo: "Leitura",
        teclas: [["←"]],
        executar: () => irPara(pagina - 1),
      },
      {
        id: "primeira",
        titulo: "Ir para a primeira página",
        grupo: "Leitura",
        palavras: "início",
        executar: () => irPara(1),
      },
      {
        id: "ultima",
        titulo: "Ir para a última página",
        grupo: "Leitura",
        palavras: "fim",
        executar: () => irPara(total),
      },
      {
        id: "buscar-pdf",
        titulo: "Buscar no documento",
        grupo: "Leitura",
        teclas: [["Ctrl", "F"]],
        executar: () => campoBusca?.focus(),
      },
      {
        id: "modo-foco",
        titulo: modoFoco ? "Sair do modo foco" : "Entrar no modo foco",
        grupo: "Leitura",
        teclas: [["Ctrl", "Shift", "F"]],
        palavras: "tela cheia esconder barras",
        executar: () => moldura.alternarFoco(),
      },
      {
        id: "mostrar-indice",
        titulo: "Mostrar o índice",
        grupo: "Leitura",
        palavras: "capítulos sumário",
        executar: () => void moldura.mostrarPainel("indice"),
      },
      {
        id: "mostrar-aparencia",
        titulo: "Mostrar a aparência",
        grupo: "Leitura",
        palavras: "painel",
        executar: () => void moldura.mostrarPainel("aparencia"),
      },
      {
        id: "zoom-mais",
        titulo: "Aumentar o zoom",
        grupo: "Zoom",
        teclas: [["Ctrl", "+"]],
        executar: () => visor?.increaseScale(),
      },
      {
        id: "zoom-menos",
        titulo: "Diminuir o zoom",
        grupo: "Zoom",
        teclas: [["Ctrl", "−"]],
        executar: () => visor?.decreaseScale(),
      },
      {
        id: "zoom-largura",
        titulo: "Ajustar à largura",
        grupo: "Zoom",
        teclas: [["Ctrl", "0"]],
        executar: () => {
          if (visor) visor.currentScaleValue = "page-width";
        },
      },
      ...MODOS_PDF.map(([modoPdf, nome]) => ({
        id: `modo-${modoPdf}`,
        titulo: `Exibição: ${nome}`,
        grupo: "Aparência",
        dica: preferencias.modoPdf === modoPdf ? "atual" : undefined,
        executar: () => atualizarPreferencias({ modoPdf }),
      })),
      ...destaques.comandos(destacarSelecao),
      ...comandosDoIndice(itensIndice, hrefAtual, irParaSecao),
      ...comandosDaPagina(preferencias, atualizarPreferencias),
    ];
    const n = total;
    onComandos?.({ comandos: lista, porTermo: (termo) => irParaPagina(termo, n, irPara) });
  });

  /** O elemento da página `n` (o .page do pdf.js), se estiver no DOM. */
  function paginaEl(n: number): HTMLElement | null {
    return conteiner.querySelector<HTMLElement>(`.page[data-page-number="${n}"]`);
  }

  /** (Re)desenha a camada de destaques da página `n`, logo acima do desenho da página. */
  function desenharDestaques(n: number) {
    const el = paginaEl(n);
    if (!el) return;
    el.querySelector(".camada-destaques")?.remove();
    const daPagina = destaques.lista.flatMap((d) => {
      const local = lerLocalPdf(d.local);
      return local?.pagina === n ? [{ d, retangulos: local.retangulos }] : [];
    });
    if (!daPagina.length) return;
    const camada = document.createElement("div");
    camada.className = "camada-destaques";
    camada.setAttribute("aria-hidden", "true");
    for (const { d, retangulos } of daPagina)
      for (const r of retangulos) {
        const marca = document.createElement("div");
        Object.assign(marca.style, {
          left: `${r.x * 100}%`,
          top: `${r.y * 100}%`,
          width: `${r.l * 100}%`,
          height: `${r.a * 100}%`,
          background: hexDaCor(d.cor),
        });
        camada.append(marca);
      }
    // Acima do desenho da página e abaixo da camada de texto (que continua selecionável).
    const desenho = el.querySelector(".canvasWrapper");
    if (desenho) desenho.after(camada);
    else el.prepend(camada);
  }

  function redesenharDe(d: Destaque) {
    const local = lerLocalPdf(d.local);
    if (local) desenharDestaques(local.pagina);
  }

  // O marca-texto se mistura com a página: multiply no papel claro, screen na noite.
  const marcaTexto = $derived(estiloDoMarcaTexto(invertida));

  /** Título da seção (do sumário) em que a página `n` está. */
  function capituloDa(n: number): string | null {
    const href = itemAtual(paginasDoIndice, n);
    return achatar(itensIndice).find((i) => i.href === href)?.label.trim() ?? null;
  }

  /** Há texto selecionado numa página? Abre a barra sobre ele. */
  function verSelecao(focar: boolean): boolean {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const inicio = range.startContainer;
    const el = (inicio instanceof Element ? inicio : inicio.parentElement)?.closest<HTMLElement>(".page");
    if (!el || !conteiner.contains(el)) return false;
    const trecho = range.toString();
    const n = Number(el.dataset.pageNumber);
    const caixa = el.getBoundingClientRect();
    // Uma seleção que passa da página fica só com a parte da página onde começou.
    const retangulos = retangulosNaPagina([...range.getClientRects()], caixa);
    if (!trecho.trim() || !retangulos.length) return false;
    destaques.mostrarSelecao(
      {
        local: localPdf(n, retangulos),
        trecho,
        capitulo: capituloDa(n),
        posicao: posicaoNoPdf(n, total, retangulos[0]!.y),
      },
      posicaoDaBarra(naJanela(retangulos[0]!, caixa)),
      focar,
    );
    return true;
  }

  /** Ctrl+D: a barra da seleção, com o foco nela. */
  function destacarSelecao() {
    if (!verSelecao(true)) anuncio = "Selecione um trecho do texto para destacar.";
  }

  /** Soltar o ponteiro: há seleção? (barra). Senão, clicou num destaque? (barra dele). */
  function aoSoltar(e: PointerEvent) {
    setTimeout(() => {
      if (verSelecao(false)) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(".page");
      if (!el) return;
      const caixa = el.getBoundingClientRect();
      const x = (e.clientX - caixa.left) / caixa.width;
      const y = (e.clientY - caixa.top) / caixa.height;
      const n = Number(el.dataset.pageNumber);
      for (const d of destaques.lista) {
        const local = lerLocalPdf(d.local);
        if (local?.pagina === n && acertou(local.retangulos, x, y)) {
          destaques.mostrarDestaque(d, posicaoDaBarra(naJanela(local.retangulos[0]!, caixa)));
          return;
        }
      }
    });
  }

  function aoApontar(e: PointerEvent) {
    if (!(e.target instanceof Element && e.target.closest(".barra-destaque"))) destaques.esconder();
  }

  async function irParaDestaque(destaque: Destaque) {
    const local = lerLocalPdf(destaque.local);
    if (!local) return;
    irPara(local.pagina);
    conteiner.focus({ preventScroll: true });
  }

  async function mostrarDestaques() {
    await moldura.mostrarPainel("indice");
    abas?.mostrar("destaques");
  }

  /** Apagado pela lista, o botão some com o item: o foco volta para a aba. */
  async function apagarDaLista(destaque: Destaque) {
    await destaques.apagar(destaque);
    await tick();
    if (document.activeElement === document.body) document.getElementById("aba-destaques")?.focus();
  }

  function aoTeclar(e: KeyboardEvent) {
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    if (!visor) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      destacarSelecao();
      return;
    }
    if (e.key === "Escape" && destaques.barra) {
      e.preventDefault();
      destaques.fecharBarra();
      return;
    }
    // Sem Shift: Ctrl+Shift+F é o modo foco (da moldura).
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      campoBusca?.focus();
      return;
    }
    if (ctrl && (e.key === "+" || e.key === "=")) {
      e.preventDefault();
      visor.increaseScale();
      return;
    }
    if (ctrl && e.key === "-") {
      e.preventDefault();
      visor.decreaseScale();
      return;
    }
    if (ctrl && e.key === "0") {
      e.preventDefault();
      visor.currentScaleValue = "page-width";
      return;
    }
    // Setas trocam de página, exceto quando o foco está num campo de texto.
    const emCampo = e.target instanceof HTMLInputElement;
    if (emCampo || ctrl || e.altKey) return;
    // As setas viram a página e não rolam: no modo página a página, o pdf.js deixa uma sobra
    // de alguns pixels, e rolá-la deslocava a página. Com a página inteira na tela, ↑ e ↓
    // também viram; com zoom maior, rolam a página (o que não cabe).
    const inteira = preferencias.modoPdf === "paginas" && visor.currentScaleValue === "page-fit";
    const voltar = e.key === "ArrowLeft" || (inteira && e.key === "ArrowUp");
    const avancar = e.key === "ArrowRight" || (inteira && e.key === "ArrowDown");
    if (!voltar && !avancar) return;
    e.preventDefault();
    irPara(voltar ? pagina - 1 : pagina + 1);
  }
</script>

<MolduraLeitor
  bind:this={moldura}
  bind:modoFoco
  {titulo}
  {anuncio}
  progresso={total ? pagina / total : 0}
  {onFechar}
>
  {#snippet acoes()}
    <BuscaPdf resultado={resultadoBusca} onBuscar={buscar} bind:campo={campoBusca} />
  {/snippet}

  {#snippet indice()}
    <AbasIndice bind:this={abas} bind:aba={abaIndice} quantidade={destaques.lista.length}>
      {#snippet conteudoIndice()}
        {#if itensIndice.length}
          <Indice itens={itensIndice} atual={hrefAtual} onNavegar={irParaSecao} />
        {:else}
          <p>Este PDF não tem sumário.</p>
        {/if}
      {/snippet}
      {#snippet conteudoDestaques()}
        <ListaDestaques
          destaques={destaques.lista}
          onIr={irParaDestaque}
          onNota={(d) => destaques.editarNota(d)}
          onApagar={apagarDaLista}
          onExportar={() => destaques.exportar()}
        />
      {/snippet}
    </AbasIndice>
  {/snippet}

  {#snippet aparencia()}
    <PainelTema
      {preferencias}
      onMudar={atualizarPreferencias}
      temaDoSistema={resolverTema("sistema", sistema)}
    />
    <PainelPagina
      {preferencias}
      onMudar={atualizarPreferencias}
      formato="pdf"
      interface={temaEfetivo()}
    />
    <!-- A seção Texto não existe no PDF (layout fixo): só a dica do zoom. -->
    <p class="nota">Para ler maior, use o zoom (Ctrl + ou Ctrl −).</p>
  {/snippet}

  {#snippet rodape()}
    <BarraPdf
      {pagina}
      {total}
      {zoom}
      onIrPara={irPara}
      onZoomMenos={() => visor?.decreaseScale()}
      onZoomMais={() => visor?.increaseScale()}
      onAjustarLargura={() => visor && (visor.currentScaleValue = "page-width")}
    />
  {/snippet}

  {#if erro}
    <p role="alert">{erro}</p>
  {:else if !pronto}
    <Carregando texto="Abrindo o PDF…" />
  {/if}
  <!-- O PDFViewer exige um contêiner com position: absolute e um filho .pdfViewer.
       Região rolável focável (tabindex) para rolar pelo teclado. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex: o WCAG exige que áreas roláveis
       sejam alcançáveis pelo teclado (regra scrollable-region-focusable do axe). -->
  <div
    class="conteiner"
    class:camada={!!estiloPagina.camada}
    class:invertida
    style:--papel-pdf={estiloPagina.papel}
    style:--marca-opacidade={marcaTexto.opacidade}
    style:--marca-mistura={marcaTexto.mistura}
    bind:this={conteiner}
    onpointerup={aoSoltar}
    tabindex="0"
    role="region"
    aria-label={titulo}
  >
    <div class="pdfViewer"></div>
  </div>
  <DestaquesDoLeitor controle={destaques} />
</MolduraLeitor>

<style>
  .conteiner {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: var(--app);
  }

  /* Cor da página (lib/pagina.ts): só efeitos sobre a página já desenhada. */
  /* O pdf.js usa este mesmo ::after para o ícone de carregando e o esconde fora do
     carregamento (`.page:not(.loading)::after { display: none }`): daí o display explícito. */
  .conteiner.camada :global(.page)::after {
    content: "";
    display: block;
    position: absolute;
    inset: 0;
    background: var(--papel-pdf);
    mix-blend-mode: multiply;
    pointer-events: none;
  }

  /* Noite: os pixels são invertidos ao desenhar (lib/pagina.ts). Antes disso, a página
     já aparece na cor final, sem clarão branco. */
  /* Canvas ainda não invertido (desenho parcial de página lenta, ou o antigo durante o
     redesenho ao entrar na noite): escondido até a inversão, para não clarear a tela. */
  .conteiner.invertida :global(.page canvas:not([data-invertida])) {
    visibility: hidden;
  }

  .conteiner.invertida :global(.page) {
    background-color: var(--papel-pdf);
  }

  /* Destaques (M16c): por cima do desenho da página, sem pegar o ponteiro (a seleção de texto
     continua). Mesma mistura do EPUB (lib/destaques.ts). */
  .conteiner :global(.camada-destaques) {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .conteiner :global(.camada-destaques > div) {
    position: absolute;
    opacity: var(--marca-opacidade);
    mix-blend-mode: var(--marca-mistura);
  }

  .nota {
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
