<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
  import type { PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
  import "pdfjs-dist/web/pdf_viewer.css";
  import "../lib/paginasPdf.css";
  import BarraPdf from "./BarraPdf.svelte";
  import ControlesVoz from "./ControlesVoz.svelte";
  import {
    blocoDasFrases,
    comandosDaVoz,
    falar,
    ouvirVoz,
    pararVoz,
    trechoDeFala,
    velocidadeDoTrecho,
    vozDisponivel,
    type EstadoVoz,
    type EventoVoz,
  } from "../lib/voz";
  import { corDoRealce } from "../lib/realce";
  import BuscaPdf from "./BuscaPdf.svelte";
  import Indice from "./Indice.svelte";
  import AbasIndice, { type Aba } from "./AbasIndice.svelte";
  import DestaquesDoLeitor from "./DestaquesDoLeitor.svelte";
  import CartaoFixado from "./CartaoFixado.svelte";
  import LadoPdf from "./LadoPdf.svelte";
  import ControlesLado from "./ControlesLado.svelte";
  import ListaDestaques from "./ListaDestaques.svelte";
  import type { Destaque } from "../lib/biblioteca";
  import { ControleDestaques, type MudancaDeTrecho } from "../lib/controleDestaques.svelte";
  import { unir } from "../lib/frases";
  import {
    frasesDaCamada,
    frasesParaFalar,
    ideiasDaCamada,
    tipoDaFrasePdf,
    textoDoTrecho,
  } from "../lib/frasesPdf";
  import {
    OPACIDADE_FORA,
    cruza,
    rolarSuave,
    uniao,
    veuNaPagina,
    vizinho,
    type Sentido,
  } from "../lib/umaIdeia";
  import { curva, duracao } from "../lib/animacao";
  import {
    MetaDaSessao,
    comandosDaMeta,
    comandosDoFoco,
    metaPorTermo,
    type Ponto,
  } from "../lib/meta.svelte";
  import { comandoQuantoFalta, estimar, textoDoRodape } from "../lib/estimativa";
  import { deveMostrar, haQuanto, ultimasFrases, type Continuacao } from "../lib/continuacao";
  import { piscar } from "../lib/piscar";
  import { Revisitas, comandosDasRevisitas, trechoDePaginas } from "../lib/revisitas.svelte";
  import { avisar } from "../lib/avisos.svelte";
  import type { Trecho } from "../lib/biblioteca";
  import { ritmoDeLeitura } from "../lib/biblioteca";
  import { estiloDoMarcaTexto, posicaoDaBarra, resumo } from "../lib/destaques";
  import {
    acertou,
    lerLocalPdf,
    type Retangulo,
    naJanela,
    retangulosNaPagina,
    desenharCamadaDestaques,
    selecaoNoPdf,
  } from "../lib/destaquesPdf";
  import Carregando from "./Carregando.svelte";
  import MolduraLeitor from "./MolduraLeitor.svelte";
  import PainelPagina from "./PainelPagina.svelte";
  import PainelTema from "./PainelTema.svelte";
  import { sistema, temaEfetivo } from "../lib/ambiente.svelte";
  import type { ItemIndice } from "../lib/foliate";
  import { log } from "../lib/log";
  import { inverterCanvas, PAGINAS, resolverPagina } from "../lib/pagina";
  import { carregarPdf, carregarVisor, paginaRenderizada } from "../lib/pdf";
  import { atualizarPreferencias, preferencias } from "../lib/preferencias.svelte";
  import { achatar, converterSumario, itemAtual, type ItemSumarioPdf } from "../lib/sumario";
  import { resolverTema } from "../lib/temas";
  import { aguardarTransicao } from "../lib/transicao";
  import {
    comandosDaPagina,
    comandosDoIndice,
    comandosDoLado,
    ladoPorTermo,
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
    ultimaLeitura,
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
    /** Fim da última leitura (segundos desde 1970), para "Da última vez…" (M22). */
    ultimaLeitura?: number;
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
  let umaIdeia = $state(false);
  /** Meta da sessão (M20b): a moldura mostra; aqui, só a página em que a leitura está. */
  const meta = new MetaDaSessao();
  // Trechos revisitados (M21b): um trecho é a seção do sumário ou, sem sumário, um bloco de 10
  // páginas. As visitas só começam com o sumário carregado: senão o mesmo livro misturaria os
  // dois jeitos de contar.
  const revisitas = new Revisitas(
    () => livroId,
    (texto) => avisar(texto),
  );
  let sumarioPronto = false;

  /** O trecho da página `n`: a seção do sumário em que ela está, ou o bloco de páginas. */
  function trechoDaPagina(n: number): Trecho {
    const inicios = [...new Set(paginasDoIndice.values())].sort((a, b) => a - b);
    if (!inicios.length) return trechoDePaginas(n, total);
    let i = -1;
    while (i + 1 < inicios.length && inicios[i + 1]! <= n) i++;
    const inicio = i >= 0 ? inicios[i]! : 1;
    return {
      ordem: i + 1,
      rotulo: capituloDa(n) ?? `Início (páginas 1–${(inicios[0] ?? 2) - 1})`,
      local: `pagina:${inicio}`,
    };
  }

  function visitarPagina(n: number) {
    if (sumarioPronto && total) void revisitas.entrar(trechoDaPagina(n));
  }

  /** Saída planejada do modo foco (M20c): conta como uma meta, e a moldura sai ao cumprir. */
  const saidaDoFoco = new MetaDaSessao();

  /** Onde a leitura está, para a meta e para a saída planejada do foco. */
  function moverContagens(ponto: Ponto) {
    meta.mover(ponto);
    saidaDoFoco.mover(ponto);
  }

  // Destaques (M16c): a lógica comum está no ControleDestaques; aqui, a seleção na camada de
  // texto do pdf.js e uma camada própria sobre cada página (o arquivo do PDF não muda).
  let abaIndice = $state<Aba>("indice");
  let abas = $state<AbasIndice>();
  const destaques = new ControleDestaques({
    get livroId() {
      return livroId;
    },
    titulo: () => titulo,
    // Com o lado aberto (M25c), os destaques são desenhados nos dois.
    desenhar: (d) => {
      redesenharDe(d);
      lado?.desenhar(d);
    },
    apagarDesenho: (d) => {
      redesenharDe(d);
      lado?.apagarDesenho(d);
    },
    irPara: irParaDestaque,
    focarTexto: () =>
      lado?.temSelecao() ? lado.focar() : conteiner.focus({ preventScroll: true }),
    limparSelecao: () => window.getSelection()?.removeAllRanges(),
    anunciar: (texto) => (anuncio = texto),
    mostrarLista: mostrarDestaques,
    // A seleção do modo frase era só a prévia: some com a barra. Senão o próximo Ctrl+D a
    // trataria como uma seleção feita com o mouse, fora do modo frase (sem Alt+↑/↓).
    aoFecharBarra: () => {
      if (modoFrase) window.getSelection()?.removeAllRanges();
      modoFrase = null;
      selecaoDaBarra = null;
      // A barra foi aberta com a voz lendo (Ctrl+D): a leitura continua de onde parou, e a
      // frase volta a ser só o realce.
      if (retomarVozAoFechar) {
        retomarVozAoFechar = false;
        window.getSelection()?.removeAllRanges();
        if (voz === "pausado") void pausarOuRetomar();
      }
    },
  });

  // Modo frase (M17b), como no EPUB: Ctrl+D sem seleção seleciona a primeira frase da página e
  // abre a barra; Alt+↑/↓ trocam de frase (passando de página nas pontas), Alt+Shift+↑/↓
  // encolhem ou estendem o trecho (dentro da página).
  let modoFrase: { pagina: number; frases: Range[]; de: number; ate: number } | null = null;
  /** Frases de cada camada de texto já dividida (o pdf.js troca a camada ao redesenhar). */
  const frasesPorCamada = new WeakMap<Element, Range[]>();

  // Uma ideia por vez (M19): o bloco atual da página; sobre os outros, um véu da cor do papel
  // (o desenho do PDF não tem elementos para esmaecer, como no EPUB). Os blocos são os do modo
  // frase (lib/frasesPdf.ts).
  let ideia: { pagina: number; atual: number; furos: Retangulo[] } | null = null;
  const ideiasPorCamada = new WeakMap<Element, HTMLElement[][]>();
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

  // Progresso honesto (M21): o ritmo neste livro (das sessões), buscado ao abrir e de 5 em 5
  // minutos (a sessão atual entra nele à medida que é gravada).
  let ritmo = $state<number | null>(null);
  /** Onde a seção atual acaba (fração): a página antes da próxima seção do sumário. */
  const fimDoCapitulo = $derived.by(() => {
    const seguintes = [...paginasDoIndice.values()].filter((p) => p > pagina);
    return seguintes.length && total ? (Math.min(...seguintes) - 1) / total : null;
  });
  const estimativa = $derived(estimar(total ? pagina / total : 0, ritmo, fimDoCapitulo));
  onMount(() => {
    const buscar = () =>
      ritmoDeLeitura(livroId)
        .then((r) => (ritmo = r))
        .catch((e) => log.warn(`ritmo de leitura: ${e}`));
    void buscar();
    void revisitas.carregar();
    const intervalo = setInterval(buscar, 5 * 60_000);
    return () => clearInterval(intervalo);
  });

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
    const v = visor;
    untrack(() => v.refresh());
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
  // "largura"). Reage na hora quando a preferência muda (e só a ela). A uma ideia por vez usa
  // sempre a rolagem contínua, sem mudar a preferência: ao desligá-la, volta o que era.
  // As chamadas ao pdf.js ficam em `untrack`: ele dispara eventos na hora (ex.:
  // "scalechanging"), e o estado que os tratadores leem (o zoom, a barra de destaque) viraria
  // dependência deste efeito. Aí mudar o zoom voltava para "página inteira", e abrir a barra
  // reaplicava o zoom e a fechava.
  $effect(() => {
    const paginas = preferencias.modoPdf === "paginas" && !umaIdeia;
    if (!pronto || !visor || !modosDeRolagem) return;
    const [v, modos] = [visor, modosDeRolagem];
    untrack(() => {
      v.scrollMode = paginas ? modos.PAGE : modos.VERTICAL;
      v.currentScaleValue = paginas ? "page-fit" : "page-width";
    });
  });

  /** Estados do PDFFindController (FindState no pdf.js). */
  const BUSCA = { ENCONTRADO: 0, NADA: 1, VOLTOU_AO_INICIO: 2, PENDENTE: 3 };

  onMount(() => {
    let pararDeOuvir: (() => void) | undefined;
    vozDisponivel()
      .then((d) => (vozPossivel = d))
      .catch(() => {});
    ouvirVoz(aoEventoVoz)
      .then((f) => (pararDeOuvir = f))
      .catch(() => {});
    return () => {
      // Fechar o documento encerra a leitura em voz alta.
      if (voz !== "parado") pararVoz().catch(() => {});
      pararDeOuvir?.();
    };
  });

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
    // Só quando o tamanho muda de verdade: o pdf.js avisa "scalechanging" a cada reaplicação,
    // mesmo com a escala igual, e isso fechava a barra de destaque à toa.
    let quadro = 0;
    let tamanho = "";
    const observador =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(quadro);
            quadro = requestAnimationFrame(() => {
              const novo = `${conteiner.clientWidth}x${conteiner.clientHeight}`;
              if (novo === tamanho) return;
              tamanho = novo;
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
    eventos.on("pagerendered", ({ pageNumber }: { pageNumber: number }) => {
      desenharDestaques(pageNumber);
      desenharRealce(pageNumber);
      desenharIdeia(pageNumber);
    });
    // A camada de texto (de onde saem os blocos) pode ficar pronta depois do desenho.
    eventos.on("textlayerrendered", ({ pageNumber }: { pageNumber: number }) =>
      desenharIdeia(pageNumber),
    );

    eventos.on("pagesinit", () => {
      pronto = true; // o efeito acima aplica o modo e o zoom
      const n = Number(inicio?.match(/^pagina:(\d+)$/)?.[1]);
      if (n >= 1 && n <= v.pagesCount) v.currentPageNumber = n;
      pagina = v.currentPageNumber;
      moverContagens({ rotulo: `página ${pagina}`, pagina });
      // Registra a abertura mesmo sem troca de página (senão o livro aparece como "Não iniciado").
      onProgresso?.(`pagina:${v.currentPageNumber}`, v.currentPageNumber / v.pagesCount);
    });
    eventos.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      // No modo frase, a página muda para acompanhar a frase: a barra vai junto.
      if (!modoFrase) destaques.esconder();
      pagina = pageNumber;
      onProgresso?.(`pagina:${pageNumber}`, total ? pageNumber / total : 0);
      moverContagens({ rotulo: `página ${pageNumber}`, pagina: pageNumber });
      visitarPagina(pageNumber);
      // Rolando com o mouse, a uma ideia passa à página nova quando o bloco atual sai da tela.
      if (ideia && ideia.pagina !== pageNumber && !ideiaNaTela()) void irParaIdeiaDa(pageNumber);
    });
    eventos.on("scalechanging", ({ scale }: { scale: number }) => {
      // A barra fica fora de lugar só se o zoom mudou de fato.
      if (scale !== zoom) destaques.esconder();
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
    documentoPdf = documento;
    total = documento.numPages;
    v.setDocument(documento);
    l.setDocument(documento);
    carregarSumario(documento)
      .catch((e) => log.warn(`sumário do PDF indisponível: ${e}`))
      .finally(() => {
        sumarioPronto = true;
        visitarPagina(pagina);
        // Com o sumário, o cartão já sabe o nome da seção.
        // A página salva: o pdf.js pode ainda não ter ido até ela.
        const salva = Number(inicio?.match(/^pagina:(\d+)$/)?.[1]) || pagina;
        montarContinuacao(documento, salva).catch((e) => log.warn(`onde você parou: ${e}`));
      });
  }

  // "Onde você parou" (M22): ao reabrir depois de uma hora ou mais, a seção e a página, com as
  // últimas frases da página anterior (do texto do próprio PDF, pelo pdf.js).
  let continuacao = $state<Continuacao | null>(null);
  /** A página salva: ao fechar o cartão, o primeiro bloco de texto dela pisca. */
  let paginaDaContinuacao = 0;

  async function piscarOndeParou() {
    const n = paginaDaContinuacao;
    const primeira = (await ideiasDaPagina(n))[0];
    const el = paginaEl(n);
    if (!primeira || !el) return;
    const caixa = el.getBoundingClientRect();
    const r = uniao(primeira.map((p) => p.getBoundingClientRect()));
    const folga = 3;
    piscar(
      el,
      [
        {
          left: r.left - caixa.left - folga,
          top: r.top - caixa.top - folga,
          width: r.width + 2 * folga,
          height: r.height + 2 * folga,
        },
      ],
      marcaTexto,
    );
  }

  async function montarContinuacao(documento: PDFDocumentProxy, n: number) {
    const agora = Date.now() / 1000;
    if (!deveMostrar(!!inicio, ultimaLeitura, agora)) return;
    let trecho: string[] = [];
    if (n > 1) {
      const conteudo = await (await documento.getPage(n - 1)).getTextContent();
      const texto = conteudo.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? " " : "") : ""))
        .join("");
      trecho = ultimasFrases(texto, 3).map((f) => resumo(f, 300));
    }
    const secao = capituloDa(n);
    paginaDaContinuacao = n;
    continuacao = {
      onde: secao ? `em “${secao}”, na página ${n}` : `na página ${n}`,
      quando: ultimaLeitura ? haQuanto(ultimaLeitura, agora) : undefined,
      trecho,
    };
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
    if (preferencias.modoPdf === "rolagem" || umaIdeia) {
      v.currentPageNumber = n;
      return;
    }
    moldura.virarPagina(n > pagina ? "direita" : "esquerda", () => {
      v.currentPageNumber = n;
      return paginaRenderizada(v, n);
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
        id: "uma-ideia",
        titulo: umaIdeia ? "Desligar uma ideia por vez" : "Ligar uma ideia por vez",
        grupo: "Leitura",
        teclas: [["Ctrl", "Shift", "B"]],
        palavras: "bloco parágrafo esmaecer concentrar",
        executar: () => moldura.alternarUmaIdeia(),
      },
      ...(umaIdeia
        ? [
            {
              id: "ideia-proxima",
              titulo: "Próximo bloco",
              grupo: "Leitura",
              teclas: [["↓"]],
              palavras: "parágrafo seguinte",
              executar: () => void andarIdeia("frente"),
            },
            {
              id: "ideia-anterior",
              titulo: "Bloco anterior",
              grupo: "Leitura",
              teclas: [["↑"]],
              palavras: "parágrafo",
              executar: () => void andarIdeia("tras"),
            },
          ]
        : []),
      ...(continuacao
        ? [
            {
              id: "onde-parei",
              titulo: "Mostrar onde eu tinha parado",
              grupo: "Leitura",
              palavras: "continuar última vez retomar",
              executar: () => moldura.mostrarContinuacao(),
            },
          ]
        : []),
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
      ...comandosDaVoz(
        voz,
        () => void lerEmVozAlta(),
        () => void pausarOuRetomar(),
        () => void pararLeitura(),
      ),
      comandoQuantoFalta(estimativa, "pdf", (texto) => (anuncio = texto)),
      ...comandosDasRevisitas(revisitas.lista, (local) => {
        const n = Number(local.match(/^pagina:(\d+)$/)?.[1]);
        if (n) irPara(n);
      }),
      ...comandosDaMeta(meta, "pdf"),
      ...comandosDoFoco(saidaDoFoco, "pdf", (m) => moldura.focarPor(m)),
      ...comandosDoLado(ladoInicio !== null, itensIndice, {
        abrir: (href) => {
          const p = paginasDoIndice.get(href);
          if (p) void abrirAoLado(p);
        },
        abrirAqui: () => void abrirAoLado(pagina),
        fechar: fecharLado,
        alternar: alternarLado,
      }),
      ...comandosDoIndice(itensIndice, hrefAtual, irParaSecao),
      ...comandosDaPagina(preferencias, atualizarPreferencias),
    ];
    const n = total;
    const aberto = ladoInicio !== null;
    onComandos?.({
      comandos: lista,
      porTermo: (termo) => [
        ...ladoPorTermo(termo, n, aberto, (p) => void abrirAoLado(p)),
        ...irParaPagina(termo, n, irPara),
        ...metaPorTermo(termo, meta, "pdf"),
      ],
    });
  });

  /** O elemento da página `n` (o .page do pdf.js), se estiver no DOM. */
  function paginaEl(n: number): HTMLElement | null {
    return conteiner.querySelector<HTMLElement>(`.page[data-page-number="${n}"]`);
  }

  /** (Re)desenha a camada de destaques da página `n` (e a do lado, se aberto: M25c). */
  function desenharDestaques(n: number) {
    const el = paginaEl(n);
    if (el) desenharCamadaDestaques(el, n, destaques.lista);
  }

  function redesenharDe(d: Destaque) {
    const local = lerLocalPdf(d.local);
    if (local) desenharDestaques(local.pagina);
  }

  $effect(() => {
    const ligada = umaIdeia;
    if (!pronto) return;
    untrack(() => {
      if (ligada) void ligarIdeia();
      else desligarIdeia();
    });
  });

  /** Os blocos da página `n` (vazio se ela não tiver texto). */
  /**
   * As ideias da página `n`, na ordem de leitura (vazio se ela não tiver texto): os blocos, com
   * os rótulos de figura e as partes de equação juntos (lib/frasesPdf.ts).
   */
  async function ideiasDaPagina(n: number): Promise<HTMLElement[][]> {
    const camada = await camadaDeTexto(n);
    return camada ? ideiasDe(camada) : [];
  }

  function ideiasDe(camada: Element): HTMLElement[][] {
    const ideias = ideiasPorCamada.get(camada) ?? ideiasDaCamada(camada);
    ideiasPorCamada.set(camada, ideias);
    return ideias;
  }

  async function ligarIdeia() {
    // O efeito do modo passa à rolagem contínua (e o pdf.js redesenha): espera o novo layout.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    if (umaIdeia) await irParaIdeiaDa(pagina, "frente", true, true);
  }

  function desligarIdeia() {
    const camadas = [...conteiner.querySelectorAll(".camada-ideia")];
    ideia = null;
    for (const c of camadas) c.classList.add("escondida");
    setTimeout(() => camadas.forEach((c) => c.remove()), duracao("media"));
  }

  /**
   * A uma ideia passa para a página `n`: o primeiro bloco dela (ou o último, vindo de trás).
   * As outras páginas ficam esmaecidas por inteiro.
   */
  async function irParaIdeiaDa(n: number, sentido: Sentido = "frente", centralizar = false, aparecer = false) {
    const anterior = ideia?.pagina;
    ideia = { pagina: n, atual: -1, furos: [] };
    if (anterior !== undefined && anterior !== n) desenharIdeia(anterior);
    // A página ainda não foi desenhada (longe da tela): rola até ela para o pdf.js desenhá-la.
    const el = paginaEl(n);
    if (centralizar && el && !el.querySelector(".textLayer:has(span)"))
      centralizarEm(el.getBoundingClientRect().top);
    const ideias = await ideiasDaPagina(n);
    if (!ideia || ideia.pagina !== n) return;
    ideia.atual = sentido === "frente" ? 0 : ideias.length - 1;
    if (aparecer) for (const p of conteiner.querySelectorAll<HTMLElement>(".page:has(canvas)"))
      desenharIdeia(Number(p.dataset.pageNumber), true);
    else desenharIdeia(n);
    mostrarIdeia(centralizar);
  }

  /**
   * (Re)desenha a camada da página `n`: um véu só, sobre a página inteira, com um furo no bloco
   * atual (nas outras páginas, sem furo). Véus separados por bloco se sobrepunham nas folgas
   * (faixas mais escuras). Trocar de bloco só move o furo (transform). `aparecer`: ao ligar, o
   * véu esmaece a página aos poucos.
   */
  function desenharIdeia(n: number, aparecer = false) {
    const el = paginaEl(n);
    if (!el) return;
    el.querySelector(".camada-ideia")?.remove();
    if (!ideia) return;
    const camada = document.createElement("div");
    camada.className = "camada-ideia";
    camada.setAttribute("aria-hidden", "true");
    camada.append(document.createElement("div"));
    if (ideia.pagina === n) {
      const camadaTexto = el.querySelector(".textLayer:has(span)");
      if (!camadaTexto) return;
      const caixa = el.getBoundingClientRect();
      ideia.furos = ideiasDe(camadaTexto).map((pedacos) =>
        veuNaPagina(uniao(pedacos.map((p) => p.getBoundingClientRect())), caixa),
      );
    } else camada.classList.add("sem-furo");
    // Acima do desenho e dos destaques, abaixo da camada de texto (que continua selecionável).
    const antes = el.querySelector(".camada-destaques") ?? el.querySelector(".canvasWrapper");
    if (antes) antes.after(camada);
    else el.prepend(camada);
    if (ideia.pagina === n) mostrarIdeia(false);
    if (aparecer) {
      camada.classList.add("escondida");
      requestAnimationFrame(() => camada.classList.remove("escondida"));
    }
  }

  /**
   * Leva o furo ao bloco atual (sem bloco, ex.: página só com imagem, a página não fica
   * esmaecida). `centralizar`: a página rola até o bloco ficar no meio da tela.
   */
  function mostrarIdeia(centralizar = true) {
    if (!ideia) return;
    const camada = paginaEl(ideia.pagina)?.querySelector<HTMLElement>(".camada-ideia");
    const furo = camada?.firstElementChild as HTMLElement | null | undefined;
    const r = ideia.furos[ideia.atual];
    if (!camada || !furo) return;
    camada.classList.toggle("sem-bloco", !r);
    if (!r) return;
    // Em porcentagens do próprio furo (do tamanho da página): não depende do zoom.
    furo.style.transform = `translate(${r.x * 100}%, ${r.y * 100}%) scale(${r.l}, ${r.a})`;
    if (!centralizar) return;
    const pag = camada.getBoundingClientRect();
    const altura = r.a * pag.height;
    const tela = conteiner.clientHeight;
    // Cabe na tela: no meio; senão, o começo no alto.
    centralizarEm(pag.top + r.y * pag.height + Math.min(altura, tela) / 2);
  }

  /** Rola o documento até a altura `y` (da janela) ficar no meio da tela. */
  function centralizarEm(y: number) {
    const tela = conteiner.getBoundingClientRect();
    const topo = conteiner.scrollTop + y - (tela.top + tela.height / 2);
    rolarSuave(conteiner, topo, duracao("longa"), curva);
  }

  /** O bloco atual (ou, sem bloco, a página dele) ainda aparece na tela? */
  function ideiaNaTela(): boolean {
    const el = ideia ? paginaEl(ideia.pagina) : null;
    if (!ideia || !el) return false;
    const pag = el.getBoundingClientRect();
    const r = ideia.furos[ideia.atual] ?? { y: 0, a: 1 };
    const [topo, base] = [pag.top + r.y * pag.height, pag.top + (r.y + r.a) * pag.height];
    const tela = conteiner.getBoundingClientRect();
    return base > tela.top && topo < tela.bottom;
  }

  /** ↓ (frente) e ↑ (trás): o bloco vizinho, no meio da tela; nas pontas, a página vizinha. */
  async function andarIdeia(sentido: Sentido) {
    if (!ideia) return;
    const n = ideia.pagina;
    const i = vizinho(ideia.furos, ideia.atual, sentido);
    if (i !== null) {
      ideia.atual = i;
      mostrarIdeia();
      return;
    }
    const vizinha = sentido === "frente" ? n + 1 : n - 1;
    if (vizinha < 1 || vizinha > total) {
      anuncio = sentido === "frente" ? "Fim do documento." : "Início do documento.";
      return;
    }
    await irParaIdeiaDa(vizinha, sentido, true);
  }

  /** Clique no texto com a uma ideia ligada: o bloco clicado vem à frente. */
  async function escolherIdeiaEm(n: number, x: number, y: number) {
    if (!ideia) return;
    if (ideia.pagina !== n) await irParaIdeiaDa(n);
    if (!ideia) return;
    const i = ideia.furos.findIndex((r) => acertou([r], x, y));
    if (i < 0 || i === ideia.atual) return;
    ideia.atual = i;
    mostrarIdeia();
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
    const achada = selecaoNoPdf(range, conteiner, total, capituloDa);
    if (!achada) return false;
    // Guardada para o "Ouvir": clicar no botão da barra pode desfazer a seleção da página (a
    // camada de texto e a barra estão no mesmo documento; no EPUB, o capítulo é outro).
    selecaoDaBarra = { pagina: achada.pagina, trecho: range.cloneRange() };
    destaques.mostrarSelecao(achada.selecao, achada.posicao, focar);
    return true;
  }


  // Leitura em voz alta (M23), com o mesmo modelo do EPUB: uma página por vez, em trechos do
  // mesmo tipo (texto, lista, código; uma mensagem cada), com uma marca por frase (as frases do
  // M17b, na ordem de leitura); a frase lida fica realçada na camada de texto e, no fim da
  // página, a leitura passa à seguinte. Pausar cancela a fala; retomar
  // fala de novo a partir da frase marcada (a pausa do speech-dispatcher pulava o resto).
  let voz = $state<EstadoVoz>("parado");
  let vozPossivel = $state(false);
  /**
   * O que está sendo lido: a página, as frases dela, a última frase marcada e onde acaba o
   * trecho em fala (listas e código vão em mensagens próprias, mais devagar).
   */
  let leitura: { pagina: number; frases: Range[]; marca: number; fim: number } | null = null;
  /** A frase marcada pela voz e o realce dela, em frações da página (como os destaques). */
  let fraseLida: Range | null = null;
  let realceVoz: { pagina: number; retangulos: Retangulo[] } | null = null;
  /** Muda a cada leitura nova ou parada: uma leitura antiga que acorda depois de um `await` desiste. */
  let vez = 0;
  /** Ctrl+D pausou a voz para destacar a frase lida: retomar quando a barra fechar. */
  let retomarVozAoFechar = false;
  /** A seleção sobre a qual a barra abriu (ver `verSelecao`). */
  let selecaoDaBarra: { pagina: number; trecho: Range } | null = null;

  /** Lê a partir da frase `frase` da página `n` (ou do início da página atual). */
  async function lerEmVozAlta(n = pagina, frase = 0) {
    if (!vozPossivel) {
      anuncio =
        "Leitura em voz alta indisponível: o speech-dispatcher não está instalado ou ativo.";
      return;
    }
    if (voz !== "parado") await pararLeitura();
    await lerDesde(n, frase);
  }

  /**
   * Fala, a partir da frase `inicio` da página `n`, o trecho seguinte de frases do mesmo tipo
   * (texto, lista ou código); páginas sem texto são puladas. `lerAPrimeira`: a frase `inicio` é
   * lida mesmo fora do texto principal (é de onde se pediu para ouvir).
   */
  async function lerDesde(n: number, inicio: number, lerAPrimeira = true) {
    const minha = ++vez;
    for (let p = n, de = inicio, forcar = lerAPrimeira; p <= total; p++, de = 0, forcar = false) {
      if (p !== pagina) irPara(p);
      const frases = await frasesDaPagina(p);
      // Só o texto principal: a margem, as legendas e o número da página não são lidos.
      const principais = (await ideiasDaPagina(p)).flat();
      if (minha !== vez) return;
      const textos = frasesParaFalar(frases, de, principais, forcar);
      const { ate, tipo } = trechoDeFala(frases.slice(de).map(tipoDaFrasePdf), textos);
      const bloco = blocoDasFrases(textos.slice(0, ate), de);
      if (!bloco) continue;
      leitura = { pagina: p, frases, marca: de, fim: de + ate };
      voz = "falando";
      await falar(bloco.ssml, {
        idioma: null,
        velocidade: velocidadeDoTrecho(preferencias.velocidadeVoz, tipo),
      });
      return;
    }
    voz = "parado";
    leitura = null;
    anuncio = "Fim do documento.";
  }

  function aoEventoVoz(e: EventoVoz) {
    // Eventos atrasados depois de parar ou pausar são ignorados.
    if (voz !== "falando" || !leitura) return;
    if (e.tipo === "marca") {
      const i = Number(e.marca);
      const frase = leitura.frases[i];
      leitura.marca = i;
      // A frase lida fica realçada (o mesmo do EPUB); se a página mudou à mão, volta.
      if (leitura.pagina !== pagina) irPara(leitura.pagina);
      if (frase) mostrarFraseLida(leitura.pagina, frase);
    } else if (e.tipo === "fim") {
      // O trecho seguinte da página (ou, no fim dela, a página seguinte).
      void lerDesde(leitura.pagina, leitura.fim, false);
    } else {
      voz = "parado";
    }
  }

  async function pausarOuRetomar() {
    if (voz === "falando") {
      voz = "pausado";
      vez++;
      await pararVoz();
    } else if (voz === "pausado" && leitura) {
      await lerDesde(leitura.pagina, leitura.marca);
    }
  }

  async function pararLeitura() {
    voz = "parado";
    vez++;
    leitura = null;
    fraseLida = null;
    trocarRealce(null);
    await pararVoz();
  }

  /**
   * A frase marcada pela voz (M23b), realçada numa camada como a dos destaques: não usa a
   * seleção (um clique não a desfaz e ela fica na pausa) e segue as linhas do texto.
   */
  function mostrarFraseLida(n: number, frase: Range) {
    fraseLida = frase;
    const caixa = paginaEl(n)?.getBoundingClientRect();
    const retangulos = caixa ? retangulosNaPagina([...frase.getClientRects()], caixa) : [];
    trocarRealce({ pagina: n, retangulos });
  }

  function trocarRealce(novo: typeof realceVoz) {
    const antes = realceVoz?.pagina;
    realceVoz = novo;
    if (antes !== undefined && antes !== novo?.pagina) desenharRealce(antes);
    if (novo) desenharRealce(novo.pagina);
  }

  /** A camada do realce da voz na página `n` (refeita a cada desenho do pdf.js). */
  function desenharRealce(n: number) {
    const el = paginaEl(n);
    if (!el) return;
    el.querySelector(".camada-voz")?.remove();
    if (realceVoz?.pagina !== n || !realceVoz.retangulos.length) return;
    const camada = document.createElement("div");
    camada.className = "camada-voz";
    camada.setAttribute("aria-hidden", "true");
    const cor = corDoRealce();
    for (const r of realceVoz.retangulos) {
      const marca = document.createElement("div");
      Object.assign(marca.style, {
        left: `${r.x * 100}%`,
        top: `${r.y * 100}%`,
        width: `${r.l * 100}%`,
        height: `${r.a * 100}%`,
        background: cor,
      });
      camada.append(marca);
    }
    // Como os destaques: acima do desenho da página e abaixo da camada de texto.
    const antes = el.querySelector(".camada-destaques") ?? el.querySelector(".canvasWrapper");
    if (antes) antes.after(camada);
    else el.prepend(camada);
  }

  /** Ouvir a partir do trecho da barra (seleção, frase ou destaque) até o fim do documento. */
  async function ouvirDaqui() {
    const barra = destaques.barra;
    let n = pagina;
    let ponto: { x: number; y: number } | null = null;
    let trecho: Range | null = null;
    if (modoFrase) {
      n = modoFrase.pagina;
      trecho = modoFrase.frases[modoFrase.de] ?? null;
    } else if (barra?.destaque) {
      const local = lerLocalPdf(barra.destaque.local);
      if (local?.retangulos[0]) {
        n = local.pagina;
        const r = local.retangulos[0];
        ponto = { x: r.x + r.l / 2, y: r.y + r.a / 2 };
      }
    } else if (selecaoDaBarra) {
      n = selecaoDaBarra.pagina;
      trecho = selecaoDaBarra.trecho;
    }
    retomarVozAoFechar = false;
    destaques.fecharBarra();
    const frases = await frasesDaPagina(n);
    const caixa = paginaEl(n)?.getBoundingClientRect();
    let i = -1;
    if (trecho) {
      const t = trecho;
      // A frase em que a seleção começa; se ela começa entre duas frases (num espaço), a
      // primeira frase que a seleção alcança.
      i = frases.findIndex((f) => f.comparePoint(t.startContainer, t.startOffset) === 0);
      if (i < 0) i = frases.findIndex((f) => cruza(f, t));
    } else if (ponto && caixa) {
      const p = ponto;
      i = frases.findIndex((f) =>
        [...f.getClientRects()].some((r) => {
          const x = (r.left + r.width / 2 - caixa.left) / caixa.width;
          const y = (r.top + r.height / 2 - caixa.top) / caixa.height;
          return Math.abs(y - p.y) < 0.01 && Math.abs(x - p.x) < 0.5;
        }),
      );
    }
    await lerEmVozAlta(n, Math.max(0, i));
  }

  /**
   * Ctrl+D: a barra da seleção, com o foco nela; sem seleção, a da frase atual. Com a voz
   * lendo, a frase lida vira a seleção: a voz pausa enquanto a barra está aberta (senão a página
   * vira no meio da escolha e a barra fecha) e continua quando ela fecha.
   */
  async function destacarSelecao() {
    if (voz === "falando") {
      await pausarOuRetomar();
      retomarVozAoFechar = true;
      // A frase lida está só realçada: vira a seleção, para a barra abrir sobre ela.
      if (fraseLida?.startContainer.isConnected) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(fraseLida);
      }
    }
    if (!verSelecao(true)) await iniciarModoFrase(pagina, "inicio");
    // Nada para destacar (a barra não abriu): a voz continua na hora.
    if (!destaques.barra && retomarVozAoFechar) {
      retomarVozAoFechar = false;
      if (voz === "pausado") await pausarOuRetomar();
    }
  }

  /** A camada de texto da página `n`, esperando o pdf.js terminar de montá-la (até 1,5 s). */
  async function camadaDeTexto(n: number): Promise<Element | null> {
    const pronta = () => paginaEl(n)?.querySelector(".textLayer:has(span)") ?? null;
    if (pronta() || !visor) return pronta();
    const v = visor;
    await new Promise<void>((resolver) => {
      const aoMontar = ({ pageNumber }: { pageNumber: number }) => {
        if (pageNumber === n) terminar();
      };
      const limite = setTimeout(terminar, 1500);
      function terminar() {
        clearTimeout(limite);
        v.eventBus.off("textlayerrendered", aoMontar);
        resolver();
      }
      v.eventBus.on("textlayerrendered", aoMontar);
    });
    return pronta();
  }

  /** As frases da página `n` (vazio se ela não tiver texto, ex.: um PDF escaneado). */
  async function frasesDaPagina(n: number): Promise<Range[]> {
    const camada = await camadaDeTexto(n);
    if (!camada) return [];
    const frases = frasesPorCamada.get(camada) ?? frasesDaCamada(camada, null);
    frasesPorCamada.set(camada, frases);
    return frases;
  }

  /** Entra no modo frase na página `n`, na primeira frase dela (ou na última, vindo de trás). */
  async function iniciarModoFrase(n: number, onde: "inicio" | "fim") {
    const frases = await frasesDaPagina(n);
    if (!frases.length) {
      anuncio =
        n === pagina
          ? "Não há texto selecionável nesta página para destacar."
          : "Não há texto na página seguinte.";
      return;
    }
    // Com a uma ideia por vez, a partir do bloco em evidência (a frase que contém o primeiro
    // pedaço dele; as frases estão na ordem de leitura, não na do arquivo).
    const primeiro = ideia?.pagina === n ? (await ideiasDaPagina(n))[ideia.atual]?.[0] : undefined;
    const naIdeia = primeiro ? frases.findIndex((f) => f.intersectsNode(primeiro)) : -1;
    const i = naIdeia >= 0 ? naIdeia : onde === "inicio" ? 0 : frases.length - 1;
    modoFrase = { pagina: n, frases, de: i, ate: i };
    mostrarFrases();
  }

  /** Seleciona o trecho do modo frase e abre a barra sobre ele (com o foco). */
  function mostrarFrases() {
    if (!modoFrase) return;
    const trecho = unir(modoFrase.frases, modoFrase.de, modoFrase.ate);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(trecho);
    verSelecao(true);
    anuncio = `Frase: ${resumo(textoDoTrecho(trecho), 300)}`;
  }

  /** Alt+↑/↓ (outra frase; nas pontas, a página vizinha) e Alt+Shift+↑/↓ (trecho na página). */
  async function mudarTrecho(mudanca: MudancaDeTrecho) {
    if (!modoFrase) return;
    const { pagina: n, frases, de, ate } = modoFrase;
    const ultima = frases.length - 1;
    if (mudanca === "proxima" && ate === ultima) {
      if (n >= total) {
        anuncio = "Fim do documento.";
        return;
      }
      irPara(n + 1);
      await iniciarModoFrase(n + 1, "inicio");
      return;
    }
    if (mudanca === "anterior" && de === 0) {
      if (n <= 1) {
        anuncio = "Início do documento.";
        return;
      }
      irPara(n - 1);
      await iniciarModoFrase(n - 1, "fim");
      return;
    }
    let [novoDe, novoAte] = [de, ate];
    if (mudanca === "proxima") novoDe = novoAte = ate + 1;
    else if (mudanca === "anterior") novoDe = novoAte = de - 1;
    else if (mudanca === "estender") novoAte = Math.min(ate + 1, ultima);
    else novoAte = Math.max(ate - 1, de);
    if (novoDe === de && novoAte === ate) {
      anuncio = mudanca === "estender" ? "Fim da página." : "Só uma frase.";
      return;
    }
    modoFrase = { ...modoFrase, de: novoDe, ate: novoAte };
    mostrarFrases();
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
      void escolherIdeiaEm(n, x, y);
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

  // Duas páginas lado a lado (M25c): o lado novo lê e destaca (LadoPdf); o resto (voz, meta,
  // sessão, progresso, busca, uma ideia por vez) é só deste lado. Páginas de PDF são fixas:
  // abrir na mesma página dá a mesma página.
  let documentoPdf = $state.raw<PDFDocumentProxy>();
  let ladoInicio = $state<number | null>(null);
  let lado = $state<LadoPdf>();
  let paginaLado = $state(0);
  let zoomLado = $state(1);
  /** O zoom do principal quando o lado abriu: os dois com o mesmo tamanho de página. */
  let escalaLado = $state("page-fit");

  /** Abre o lado na página `n` ou, se já aberto, leva-o até ela. */
  async function abrirAoLado(n: number) {
    if (lado) {
      await lado.ir(n);
      lado.focar();
      return;
    }
    escalaLado = String(visor?.currentScaleValue ?? "page-fit");
    ladoInicio = n;
    anuncio = `Página ${n} aberta ao lado. F6 alterna entre os lados.`;
  }

  function fecharLado() {
    if (ladoInicio === null) return;
    ladoInicio = null;
    anuncio = "Lado fechado.";
    conteiner.focus({ preventScroll: true });
  }

  /** O botão e o Ctrl+Shift+L: abre o lado na página em que o documento está, ou o fecha. */
  function alternarAbertura() {
    if (ladoInicio !== null) fecharLado();
    else void abrirAoLado(pagina);
  }

  /** F6: o foco vai ao outro lado. */
  function alternarLado() {
    if (!lado) return;
    // Para o leitor de tela: em qual lado o foco ficou (M26a).
    if (lado.contem(document.activeElement)) {
      conteiner.focus({ preventScroll: true });
      anuncio = `Documento principal, página ${pagina}.`;
    } else {
      lado.focar();
      anuncio = `Ao lado, página ${paginaLado}.`;
    }
  }

  function aoTeclar(e: KeyboardEvent) {
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    // Já tratada (ex.: o lado virou a própria página).
    if (e.defaultPrevented) return;
    if (e.key === "F6" && ladoInicio !== null && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      alternarLado();
      return;
    }
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
    if (umaIdeia && !e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      destaques.esconder();
      void andarIdeia(e.key === "ArrowDown" ? "frente" : "tras");
      return;
    }
    // As setas viram a página e não rolam: no modo página a página, o pdf.js deixa uma sobra
    // de alguns pixels, e rolá-la deslocava a página. Com a página inteira na tela, ↑ e ↓
    // também viram; com zoom maior, rolam a página (o que não cabe).
    const inteira = preferencias.modoPdf === "paginas" && visor.currentScaleValue === "page-fit";
    const voltar = e.key === "ArrowLeft" || (inteira && e.key === "ArrowUp");
    const avancar = e.key === "ArrowRight" || (inteira && e.key === "ArrowDown");
    if (!voltar && !avancar) return;
    e.preventDefault();
    // Virar a página à mão encerra a barra (e o modo frase).
    destaques.esconder();
    irPara(voltar ? pagina - 1 : pagina + 1);
  }
</script>

{#snippet cartoesFixados()}
  {#each destaques.fixados as d (d.id)}
    <CartaoFixado
      destaque={d}
      onIr={() => void irParaDestaque(d)}
      onNota={() => destaques.editarNota(d)}
      onDesafixar={() => destaques.desafixar(d)}
      onAbrirAoLado={() => {
        const p = lerLocalPdf(d.local)?.pagina;
        if (p) void abrirAoLado(p);
      }}
    />
  {/each}
{/snippet}

{#snippet ladoNovo()}
  {#if ladoInicio !== null && documentoPdf}
    <LadoPdf
      bind:this={lado}
      bind:pagina={paginaLado}
      bind:zoom={zoomLado}
      documento={documentoPdf}
      inicio={ladoInicio}
      escala={escalaLado}
      {invertida}
      camada={!!estiloPagina.camada}
      papel={estiloPagina.papel}
      marcaOpacidade={marcaTexto.opacidade}
      marcaMistura={marcaTexto.mistura}
      {destaques}
      {capituloDa}
    />
  {/if}
{/snippet}

{#snippet controlesLado()}
  <ControlesLado onFechar={fecharLado}>
    <BarraPdf
      pagina={paginaLado}
      {total}
      zoom={zoomLado}
      onIrPara={(n) => void lado?.ir(n)}
      onZoomMenos={() => lado?.zoomMenos()}
      onZoomMais={() => lado?.zoomMais()}
      onAjustarLargura={() => lado?.ajustarLargura()}
    />
  </ControlesLado>
{/snippet}

<MolduraLeitor
  bind:this={moldura}
  bind:modoFoco
  bind:umaIdeia
  escOcupado={!!destaques.barra}
  {meta}
  {saidaDoFoco}
  {continuacao}
  onContinuar={() => void piscarOndeParou()}
  estimativa={estimativa ? textoDoRodape(estimativa, "pdf") : undefined}
  fixado={destaques.fixados.length ? cartoesFixados : undefined}
  lado={ladoInicio !== null ? ladoNovo : undefined}
  rodapeLado={controlesLado}
  onAlternarLado={alternarAbertura}
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
          onMotivo={(d, m) => destaques.definirMotivo(d, m)}
          onExportar={(m) => destaques.exportar(m)}
          fixados={destaques.fixados}
          onFixar={(d) => destaques.alternarFixado(d)}
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
    <!-- Com o lado aberto, o rodapé dos dois fica igual: "Ler em voz alta" sai (continua na
         paleta); lendo ou pausada, os controles da voz ficam. -->
    {#if ladoInicio === null || voz !== "parado"}
      <ControlesVoz
        estado={voz}
        onLer={() => void lerEmVozAlta()}
        onPausarOuRetomar={() => void pausarOuRetomar()}
        onParar={() => void pararLeitura()}
      />
    {/if}
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
    class="conteiner paginas-pdf"
    class:camada={!!estiloPagina.camada}
    class:invertida
    style:--papel-pdf={estiloPagina.papel}
    style:--marca-opacidade={marcaTexto.opacidade}
    style:--marca-mistura={marcaTexto.mistura}
    style:--veu-ideia={estiloPagina.camada ? "#ffffff" : estiloPagina.papel}
    style:--veu-opacidade={1 - OPACIDADE_FORA}
    bind:this={conteiner}
    onpointerup={aoSoltar}
    tabindex="0"
    role="region"
    aria-label={titulo}
  >
    <div class="pdfViewer"></div>
  </div>
  <DestaquesDoLeitor
    controle={destaques}
    onOuvir={vozPossivel ? () => void ouvirDaqui() : undefined}
    onTrecho={(m) => void mudarTrecho(m)}
  />
</MolduraLeitor>

<style>
  .conteiner {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: var(--app);
  }

  /* Uma ideia por vez (M19): um véu da cor do papel sobre a página, com um furo no bloco
     atual (a sombra do furo é o véu). O furo tem o tamanho da página e vai ao bloco por
     translate + scale, então trocar de bloco é só transform. Em creme e sépia, o véu é branco:
     a camada multiply da página (o ::after, por cima) o tinge como ao papel. */
  .conteiner :global(.camada-ideia) {
    position: absolute;
    inset: 0;
    overflow: clip;
    pointer-events: none;
    opacity: var(--veu-opacidade);
    transition: opacity var(--duracao-media) var(--curva);
  }

  .conteiner :global(.camada-ideia.escondida),
  .conteiner :global(.camada-ideia.sem-bloco) {
    opacity: 0;
  }

  /* As outras páginas: esmaecidas por inteiro. */
  .conteiner :global(.camada-ideia.sem-furo) {
    background: var(--veu-ideia);
  }

  .conteiner :global(.camada-ideia.sem-furo > div) {
    display: none;
  }

  .conteiner :global(.camada-ideia > div) {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
    box-shadow: 0 0 0 200000px var(--veu-ideia);
    transition: transform var(--duracao-media) var(--curva);
  }

  .nota {
    color: var(--suave);
    font-size: 0.875rem;
  }
</style>
