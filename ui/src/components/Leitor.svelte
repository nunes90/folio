<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import Indice from "./Indice.svelte";
  import AbasIndice, { type Aba } from "./AbasIndice.svelte";
  import DestaquesDoLeitor from "./DestaquesDoLeitor.svelte";
  import CartaoFixado from "./CartaoFixado.svelte";
  import LadoEpub from "./LadoEpub.svelte";
  import { mensagemAoAbrir } from "../lib/errosAoAbrir";
  import ControlesLado from "./ControlesLado.svelte";
  import ListaDestaques from "./ListaDestaques.svelte";
  import Carregando from "./Carregando.svelte";
  import Icone from "./Icone.svelte";
  import ControlesVoz from "./ControlesVoz.svelte";
  import Posicao from "./Posicao.svelte";
  import { fracoesDasAncoras, irParaFracao, rotuloNoPonto, textoDaFracao } from "../lib/posicao";
  import { achatar } from "../lib/sumario";
  import MolduraLeitor from "./MolduraLeitor.svelte";
  import PainelLeitura from "./PainelLeitura.svelte";
  import PainelPagina from "./PainelPagina.svelte";
  import PainelVoz from "./PainelVoz.svelte";
  import AbasAparencia from "./AbasAparencia.svelte";
  import { avisar } from "../lib/avisos.svelte";
  import {
    comandosDaVozNaturalDoApp,
    vozNatural,
  } from "../lib/vozNatural.svelte";
  import PainelTema from "./PainelTema.svelte";
  import Busca from "./Busca.svelte";
  import BalaoNota from "./BalaoNota.svelte";
  import { chamadaDeNota, notaDoLink, type Nota } from "../lib/notas";
  import { Caminho, ehVoltar } from "../lib/caminho.svelte";
  import { ControleVoz } from "../lib/controleVoz.svelte";
  import {
    mesmoTermo,
    ocorrenciasDoPasso,
    primeiraDesde,
    textoDaBusca,
    vizinha,
    type Ocorrencia,
  } from "../lib/buscaEpub";
  import {
    compararCfis,
    criarView,
    desenhoContorno,
    desenhoMarcaTexto,
    textoLocalizado,
    type Desenho,
    type DetalheRelocate,
    type FoliateView,
    type ItemIndice,
  } from "../lib/foliate";
  import { escala } from "../lib/escala.svelte";
  import {
    atualizarPreferencias,
    cssDoLivro,
    larguraDaColuna,
    preferencias,
    restaurarPadrao,
  } from "../lib/preferencias.svelte";
  import { log } from "../lib/log";
  import { sistema, temaEfetivo } from "../lib/ambiente.svelte";
  import { resolverTema } from "../lib/temas";
  import { aguardarTransicao } from "../lib/transicao";
  import type { Destaque } from "../lib/biblioteca";
  import { ControleDestaques, type MudancaDeTrecho } from "../lib/controleDestaques.svelte";
  import { tirarEspacoAposUltimaQuebra } from "../lib/contornosWebkit";
  import { blocoInicial, primeiroBlocoDaSecaoSeguinte } from "../lib/vozNaSecao";
  import { frasesDoDocumento, frasesDoTrecho, indiceDaFraseEm, trechoSeguinte, unir } from "../lib/frases";
  import {
    blocoNaTela,
    blocosDoDocumento,
    cruza,
    esmaecer,
    vizinho,
    type Bloco,
    type Sentido,
  } from "../lib/umaIdeia";
  import { CURVA_CSS, curva, duracao } from "../lib/animacao";
  import {
    MetaDaSessao,
    comandosDaMeta,
    comandosDoFoco,
    metaPorTermo,
    type Ponto,
  } from "../lib/meta.svelte";
  import { comandoQuantoFalta, estimar, textoDoRodape } from "../lib/estimativa";
  import { deveMostrar, haQuanto, limpar, type Continuacao } from "../lib/continuacao";
  import { piscar } from "../lib/piscar";
  import { Revisitas, comandosDasRevisitas, trechoDePaginas } from "../lib/revisitas.svelte";
  import type { Trecho } from "../lib/biblioteca";
  import { ritmoDeLeitura } from "../lib/biblioteca";
  import {
    aplicarMarcaTexto,
    estiloDoMarcaTexto,
    hexDaCor,
    paginaEscura,
    posicaoNoIframe,
    posicaoNoLivro,
    resumo,
    selecaoNoEpub,
  } from "../lib/destaques";
  import { resolverPagina } from "../lib/pagina";
  import {
    comandosDaPagina,
    comandosDaVelocidade,
    comandosDoIndice,
    comandosDoLado,
    comandosDoTexto,
    irParaPorcentagem,
    type Comando,
    type ComandosDoLeitor,
  } from "../lib/comandos";
  import {
    blocoDasFrases,
    blocoParaFala,
    prepararVoz,
    tipoDoElemento,
    velocidadeDoTrecho,
  } from "../lib/voz";
  import { corDoRealce } from "../lib/realce";

  let {
    arquivo,
    livroId,
    inicio,
    ultimaLeitura,
    onFechar,
    onProgresso,
    onComandos,
  }: {
    arquivo: File;
    /** Id do livro na biblioteca (para os destaques). */
    livroId: string;
    /** Onde retomar a leitura (EPUB CFI salvo na biblioteca). */
    inicio?: string;
    /** Fim da última leitura (segundos desde 1970), para "Da última vez…" (M22). */
    ultimaLeitura?: number;
    onFechar: () => void;
    onProgresso?: (localizacao: string, fracao: number) => void;
    /** Publica os comandos deste livro para a paleta (Ctrl+K), de novo a cada mudança. */
    onComandos?: (comandos: ComandosDoLeitor) => void;
  } = $props();

  let moldura: MolduraLeitor;
  let palco: HTMLDivElement;
  let view: FoliateView | undefined;

  let titulo = $state("");
  let itensIndice = $state<ItemIndice[]>([]);
  /** Onde cada item do índice começa no livro (0 a 1), para o slider dizer o capítulo de um ponto. */
  let posicoesDoIndice = $state.raw(new Map<string, number>());
  /** Livro da direita para a esquerda: o slider começa à direita. */
  let livroRtl = $state(false);
  /** Quantas vezes o livro mudou de lugar (o slider confere se a ida aconteceu). */
  let relocacoes = 0;
  let hrefAtual = $state<string>();
  /** Texto da região aria-live: anuncia a mudança de seção (não cada página). */
  let anuncio = $state("");
  let secaoAnunciada: string | undefined;
  let progresso = $state(0);
  let erro = $state<string | null>(null);
  let pronto = $state(false);
  let modoFoco = $state(false);
  let umaIdeia = $state(false);
  /** Meta da sessão (M20b): a moldura mostra; aqui, só onde a leitura está. */
  const meta = new MetaDaSessao();
  // Progresso honesto (M21): o ritmo neste livro (das sessões), buscado ao abrir e de 5 em 5
  // minutos (a sessão atual entra nele à medida que é gravada).
  let ritmo = $state<number | null>(null);
  /** Onde a seção atual acaba (fração do livro), para "~12 min no capítulo". */
  let fimDoCapitulo = $state<number | null>(null);
  const estimativa = $derived(estimar(progresso, ritmo, fimDoCapitulo));
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

  // Trechos revisitados (M21b): um trecho é o capítulo (a seção do livro).
  const revisitas = new Revisitas(
    () => livroId,
    (texto) => avisar(texto),
  );

  /** Saída planejada do modo foco (M20c): conta como uma meta, e a moldura sai ao cumprir. */
  const saidaDoFoco = new MetaDaSessao();

  /** Onde a leitura está, para a meta e para a saída planejada do foco. */
  function moverContagens(ponto: Ponto) {
    meta.mover(ponto);
    saidaDoFoco.mover(ponto);
  }

  // Destaques (M16): a lógica comum aos dois formatos está no ControleDestaques; aqui, só o
  // que é do EPUB (a seleção no iframe, o CFI, o desenho pelo overlayer do foliate-js).
  let abaIndice = $state<Aba>("indice");
  let abas = $state<AbasIndice>();
  let marcaTexto: Desenho | undefined;
  const destaques = new ControleDestaques({
    get livroId() {
      return livroId;
    },
    titulo: () => titulo,
    // Com o lado aberto (M25b), os destaques são desenhados nos dois, e a seleção pode estar em
    // qualquer um deles.
    desenhar: (d) => {
      void view?.addAnnotation({ value: d.local });
      lado?.desenhar(d);
    },
    apagarDesenho: (d) => {
      void view?.deleteAnnotation({ value: d.local });
      lado?.apagarDesenho(d);
    },
    irPara: irParaDestaque,
    focarTexto: () => (lado?.temSelecao() ? lado.focar() : view?.renderer.focusView()),
    limparSelecao: () => {
      for (const { doc } of view?.renderer.getContents() ?? []) doc.getSelection()?.removeAllRanges();
      lado?.limparSelecao();
    },
    anunciar: (texto) => (anuncio = texto),
    mostrarLista: mostrarDestaques,
    aoFecharBarra: () => {
      // A seleção do modo frase era só a prévia: some com a barra. Senão o próximo Ctrl+D a
      // trataria como uma seleção feita com o mouse, fora do modo frase (sem Alt+↑/↓).
      modoFrase?.doc.getSelection()?.removeAllRanges();
      modoFrase = null;
      lado?.sairDoModoFrase();
      // A barra foi aberta com a voz lendo (Ctrl+D): a leitura continua de onde parou, e a
      // frase volta a ser só o realce.
      const frase = voz.fraseLida;
      if (voz.retomarDepoisDaBarra()) frase?.startContainer.ownerDocument?.getSelection()?.removeAllRanges();
    },
  });

  // Modo frase (M17a): Ctrl+D sem seleção seleciona a frase atual (a primeira da página) e
  // abre a barra; Alt+↑/↓ trocam de frase, Alt+Shift+↑/↓ encolhem ou estendem o trecho. Para
  // destacar sem o mouse e sem leitor de tela. A frase é selecionada de verdade: a seleção é
  // a prévia, e o resto (barra, destaque, copiar, ouvir) é o mesmo da seleção com o mouse.
  let modoFrase: { doc: Document; indice: number; frases: Range[]; de: number; ate: number } | null =
    null;
  /** O CFI do realce da frase que a voz está lendo (ou leu por último, na pausa). */
  let realceVoz: string | null = null;

  // Busca no texto (M32), como a do PDF: Ctrl+F, Enter e Shift+Enter andam pelas ocorrências, todas
  // contornadas no texto (o foliate-js as desenha) e a atual realçada como a frase que a voz lê.
  let busca = $state<ReturnType<typeof Busca>>();
  let resultadoBusca = $state("");
  let ocorrencias: Ocorrencia[] = [];
  let ocorrenciaAtual = -1;
  let termoBuscado = "";
  let buscando = false;
  /** Uma busca nova descarta a que ainda estava percorrendo o livro. */
  let vezDaBusca = 0;
  let realceBusca: string | null = null;

  async function buscar(termo: string, anterior: boolean) {
    if (!view) return;
    if (termoBuscado && mesmoTermo(termo, termoBuscado)) {
      // O mesmo termo de novo: a ocorrência seguinte (ou a anterior).
      if (!buscando && ocorrencias.length)
        await irParaOcorrencia(vizinha(ocorrenciaAtual, ocorrencias.length, anterior));
      return;
    }
    limparBusca();
    const vez = vezDaBusca;
    termoBuscado = termo;
    buscando = true;
    resultadoBusca = textoDaBusca({ buscando, atual: -1, total: 0 });
    const achadas: Ocorrencia[] = [];
    try {
      const [contorno, comparar] = await Promise.all([desenhoContorno(), compararCfis()]);
      const passos = view.search({
        query: termo.trim(),
        draw: contorno,
        drawOptions: { color: corDoRealce(), width: 2 },
      });
      for await (const passo of passos) {
        // Sair do laço encerra o gerador: a busca antiga para de percorrer o livro.
        if (vez !== vezDaBusca) return;
        achadas.push(...ocorrenciasDoPasso(passo));
      }
      if (vez !== vezDaBusca) return;
      buscando = false;
      ocorrencias = achadas;
      if (!achadas.length) {
        resultadoBusca = textoDaBusca({ buscando, atual: -1, total: 0 });
        return;
      }
      // Começa de onde se está lendo, não do começo do livro.
      const primeira = primeiraDesde(achadas, cfiAtual, comparar);
      // A busca leva para longe: Alt+← volta ao ponto em que ela começou.
      vouSaltar();
      await irParaOcorrencia(anterior ? vizinha(primeira, achadas.length, true) : primeira);
    } catch (e) {
      if (vez !== vezDaBusca) return;
      buscando = false;
      resultadoBusca = "A busca falhou";
      log.warn(`a busca no livro falhou: ${e}`);
    }
  }

  async function irParaOcorrencia(indice: number) {
    const ocorrencia = ocorrencias[indice];
    if (!view || !ocorrencia) return;
    ocorrenciaAtual = indice;
    resultadoBusca = textoDaBusca({ buscando: false, atual: indice, total: ocorrencias.length });
    destaques.esconder("busca");
    await view.goTo(ocorrencia.cfi);
    trocarRealceBusca(ocorrencia.cfi);
  }

  /** Tira as ocorrências do texto (o campo ficou vazio, a busca fechou, outra busca começou). */
  function limparBusca() {
    vezDaBusca++;
    buscando = false;
    termoBuscado = "";
    ocorrencias = [];
    ocorrenciaAtual = -1;
    resultadoBusca = "";
    trocarRealceBusca(null);
    view?.clearSearch();
  }

  /** O realce da ocorrência atual: uma anotação a mais, como a da frase lida (`trocarRealce`). */
  function trocarRealceBusca(cfi: string | null) {
    const antes = realceBusca;
    realceBusca = cfi;
    if (!view) return;
    if (antes && antes !== cfi && antes !== realceVoz) {
      void view
        .deleteAnnotation({ value: antes })
        .then(() => destaques.porLocal(antes) && view?.addAnnotation({ value: antes }));
    }
    // De novo mesmo se for o mesmo: a seção pode ter acabado de carregar.
    if (cfi) void view.addAnnotation({ value: cfi });
  }

  /** Onde a leitura está, para a meta: o capítulo (a seção) e quanto dele já passou. */
  function moverMeta(fracao: number, secao: string | undefined) {
    const indice = view?.renderer.getContents()[0]?.index;
    if (!view || indice === undefined) return;
    const inicios = view.getSectionFractions();
    const [de, ate] = [inicios[indice] ?? 0, inicios[indice + 1] ?? 1];
    fimDoCapitulo = ate;
    void revisitas.entrar({
      ordem: indice,
      rotulo: secao || `Seção ${indice + 1}`,
      local: `secao:${indice}`,
    });
    const noCapitulo = ate > de ? Math.min(1, Math.max(0, (fracao - de) / (ate - de))) : 0;
    const noLivro = porcento.format(fracao);
    moverContagens({
      rotulo: secao ? `“${secao}” (${noLivro} do livro)` : `${noLivro} do livro`,
      capitulo: { indice, fracao: noCapitulo },
    });
  }

  // Uma ideia por vez (M19): o bloco atual do capítulo; o resto, esmaecido. Enquanto ligada, o
  // livro fica em rolagem contínua e o bloco atual, no meio da tela; ao desligar, volta a ser
  // paginado na página do último bloco.
  let ideia: { doc: Document; blocos: Bloco[]; atual: number } | null = null;
  /** Chegando a outro capítulo por ↓ ou ↑: começa no primeiro bloco dele, ou no último. */
  let chegandoDe: Sentido | null = null;

  $effect(() => {
    const ligada = umaIdeia;
    if (!pronto) return;
    untrack(() => void (ligada ? ligarIdeia() : desligarIdeia()));
  });

  async function ligarIdeia() {
    view?.renderer.setAttribute("flow", "scrolled");
    // O foliate refaz o layout e volta ao ponto em que estava: o bloco dali vem ao centro.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    acompanharIdeia(true);
  }

  function desligarIdeia() {
    if (ideia) esmaecer(ideia.doc, null, transicaoDaIdeia());
    ideia = null;
    chegandoDe = null;
    view?.renderer.setAttribute("flow", "paginated");
  }

  /**
   * Põe em evidência o bloco na tela: o atual, se ainda estiver nela (a rolagem com o mouse
   * troca de bloco). `centralizar`: rola até ele ficar no meio da tela.
   */
  function acompanharIdeia(centralizar = false) {
    const visivel = view?.lastLocation?.range;
    if (!umaIdeia || !visivel) return;
    const doc = visivel.startContainer.ownerDocument;
    if (!doc) return;
    if (ideia?.doc !== doc) {
      if (ideia) esmaecer(ideia.doc, null, "0ms");
      const blocos = blocosDoDocumento(doc);
      const atual = chegandoDe === "tras" ? blocos.length - 1 : chegandoDe ? 0 : -1;
      ideia = { doc, blocos, atual };
      centralizar ||= chegandoDe !== null;
      chegandoDe = null;
    }
    const atual = ideia.blocos[ideia.atual];
    if (!atual || !cruza(atual.trecho, visivel))
      ideia.atual = blocoNaTela(
        ideia.blocos.map((b) => b.trecho),
        visivel,
      );
    mostrarIdeia(centralizar);
  }

  /** Clique no texto com a uma ideia ligada: o bloco clicado vem à frente. */
  function escolherIdeiaNoClique(doc: Document) {
    const sel = doc.getSelection();
    if (!ideia || ideia.doc !== doc || !sel?.rangeCount) return;
    const ponto = sel.getRangeAt(0);
    const i = ideia.blocos.findIndex((b) =>
      b.trecho.isPointInRange(ponto.startContainer, ponto.startOffset),
    );
    if (i < 0 || i === ideia.atual) return;
    ideia.atual = i;
    mostrarIdeia(true);
  }

  const transicaoDaIdeia = () => `${duracao("media")}ms ${CURVA_CSS}`;

  function mostrarIdeia(centralizar = false) {
    if (!ideia) return;
    const bloco = ideia.blocos[ideia.atual] ?? null;
    esmaecer(ideia.doc, bloco, transicaoDaIdeia());
    if (centralizar && bloco) void view?.renderer.centerAnchor(bloco.trecho, duracao("longa"), curva);
  }

  /** ↓ (frente) e ↑ (trás): o bloco vizinho, no meio da tela; nas pontas, o capítulo vizinho. */
  async function andarIdeia(sentido: Sentido) {
    if (!ideia || !view) return;
    const i = vizinho(ideia.blocos, ideia.atual, sentido);
    if (i !== null) {
      ideia.atual = i;
      mostrarIdeia(true);
      return;
    }
    const antes = view.renderer.getContents()[0]?.index;
    const lado = sentido === "frente" ? ladoDaProxima() : ladoDaAnterior();
    chegandoDe = sentido;
    const r = view.renderer;
    await moldura.virarPagina(lado, () => (sentido === "frente" ? r.nextSection() : r.prevSection()));
    if (view.renderer.getContents()[0]?.index === antes) {
      chegandoDe = null;
      anuncio = sentido === "frente" ? "Fim do livro." : "Início do livro.";
    }
  }

  // O marca-texto se mistura com a página: multiply no papel claro, screen no escuro.
  const escura = $derived.by(() => {
    const iface = temaEfetivo();
    return iface === "alto-contraste" || paginaEscura(resolverPagina(preferencias.pagina, iface));
  });
  $effect(() => {
    const e = escura;
    if (pronto && view) aplicarMarcaTexto(view, e);
  });

  // Leitura em voz alta: um bloco (parágrafo) por vez; ao terminar, o próximo. O estado, a pausa,
  // o "Ouvir" e os eventos são do ControleVoz (igual no PDF); aqui fica o que é do EPUB.
  const voz = new ControleVoz<Range>({
    comecar: async (desde) => {
      if (!view) return;
      await view.initTTS("sentence", mostrarFraseLida);
      if (!view.tts) return;
      // Começa na página atual (ou no trecho pedido), não no início do capítulo.
      await seguirLendo(blocoInicial(view.tts, desde ?? view.lastLocation?.range));
    },
    aoMarcar: (marca) => view?.tts?.setMark(marca),
    seguir: () => seguirLendo(view?.tts?.next()),
    // O `resume()` do tts.js começa na última marca.
    retomar: () => seguirLendo(view?.tts?.resume()),
    aoParar: () => trocarRealce(null),
    mostrarFrase: mostrarFraseLida,
    blocoDoTrecho: (frases, desde) => {
      const bloco = blocoDasFrases(
        frases.slice(desde).map((f) => f.toString()),
        desde,
        idiomaDoLivro,
      );
      return (
        bloco && {
          ssml: bloco.ssml,
          config: {
            idioma: idiomaDoLivro,
            // Listas e código mais devagar, como na leitura do livro.
            velocidade: velocidadeDoTrecho(
              preferencias.velocidadeVoz,
              tipoDoElemento(frases[desde]?.commonAncestorContainer),
            ),
          },
        }
      );
    },
    anunciar: (texto) => (anuncio = texto),
  });
  // Pergunta de novo quando a voz natural é baixada ou removida.
  $effect(() => {
    void vozNatural.mudancas;
    voz.conferir();
  });
  let idiomaDoLivro: string | null = null;

  // O CSS do livro e a largura da coluna, iguais nos dois lados (M25b).
  const cssLivro = $derived(cssDoLivro(preferencias, escala.fator, temaEfetivo()));
  // Em caracteres por linha (M24): a coluna cresce com a letra.
  const larguraLivro = $derived(`${larguraDaColuna(preferencias, escala.fator)}px`);

  // Reaplica sempre que a escala do sistema ou as preferências mudarem (inclusive com o
  // painel aberto: o livro funciona como prévia ao vivo).
  $effect(() => {
    const css = cssLivro;
    const largura = larguraLivro;
    const colunas = String(preferencias.colunas);
    if (!pronto || !view) return;
    view.renderer.setStyles(css);
    view.renderer.setAttribute("max-inline-size", largura);
    view.renderer.setAttribute("max-column-count", colunas);
    // Sem o atributo "animated": a virada é a da moldura (lib/virada.ts), igual à do PDF.
  });

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

  onMount(() => {
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoApontarFora);
    abrir().catch((e) => {
      // Uma frase sobre o que houve (M26b); o erro técnico vai para o log.
      erro = mensagemAoAbrir(e, "epub");
      log.error(`não foi possível abrir o livro: ${e}`);
    });
    vozNatural.carregar().catch(() => {});
    const desligarVoz = voz.ligar();
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoApontarFora);
      // Fechar o livro encerra a leitura em voz alta.
      desligarVoz();
      view?.close();
      view?.remove();
    };
  });

  /** Slider de posição: o valor vai de 0 a 1000 (décimos de 1%). */
  const MIL = 1000;
  function textoDoPonto(v: number): string {
    const f = v / MIL;
    return textoDaFracao(f, rotuloNoPonto(itensIndice, posicoesDoIndice, f));
  }

  /**
   * Onde cada item do índice começa. Logo: o início da seção, só para o primeiro item de cada
   * uma. Depois (em segundo plano, cada seção com âncoras carregada à parte uma vez): o ponto de
   * cada âncora dentro da seção.
   */
  async function posicionarIndice(v: FoliateView) {
    const inicios = v.getSectionFractions();
    const itens = achatar(itensIndice).flatMap((item) => {
      const r = v.resolveNavigation(item.href);
      return r && r.index >= 0 ? [{ item, ...r }] : [];
    });
    const primeiros = new Map<string, number>();
    const vistas = new Set<number>();
    for (const { item, index } of itens) {
      if (!vistas.has(index)) primeiros.set(item.href, inicios[index] ?? 0);
      vistas.add(index);
    }
    posicoesDoIndice = primeiros;

    const dentro = new Map<string, number>();
    for (const index of vistas) {
      const daSecao = itens.filter((i) => i.index === index);
      if (daSecao.length < 2) continue;
      try {
        const doc = await v.book.sections?.[index]?.createDocument?.();
        if (!doc || view !== v) continue;
        const alvos = daSecao.map((i) => i.anchor?.(doc));
        const nos = alvos.map((a) => (a instanceof Node ? a : doc.body));
        const fracoes = fracoesDasAncoras(doc, nos);
        daSecao.forEach((i, k) => dentro.set(i.item.href, alvos[k] instanceof Node ? fracoes[k] : 0));
      } catch (e) {
        log.warn(`posições do índice na seção ${index}: ${e}`);
      }
    }
    if (view !== v) return;
    // Na ordem do índice: no empate, o item mais específico (o último) vence.
    posicoesDoIndice = new Map(
      itens.map(({ item, index }) => [item.href, posicaoNoLivro(inicios, index, dentro.get(item.href) ?? 0)]),
    );
  }
  async function irParaPonto(v: number) {
    destaques.esconder();
    vouSaltar();
    try {
      await irParaFracao(view, v / MIL, () => relocacoes);
    } catch (e) {
      log.warn(`slider: não foi possível ir a ${v / 10}%: ${e}`);
    }
  }

  /** Lado de onde vem a página seguinte: a direita, salvo em livros da direita para a esquerda. */
  const ladoDaProxima = () => (view?.book.dir === "rtl" ? "esquerda" : "direita");
  const ladoDaAnterior = () => (ladoDaProxima() === "direita" ? "esquerda" : "direita");

  function proxima() {
    return moldura.virarPagina(ladoDaProxima(), () => view?.next());
  }

  function anterior() {
    return moldura.virarPagina(ladoDaAnterior(), () => view?.prev());
  }

  /** Fala o bloco dado ou, se não houver o que falar, procura o próximo (inclusive em outros capítulos). */
  async function seguirLendo(ssml: string | undefined) {
    if (!view?.tts) return;
    for (;;) {
      if (ssml === undefined) {
        const proxima = await proximaSecao();
        if (proxima === null) {
          voz.acabou("Fim do livro.");
          return;
        }
        ssml = proxima;
        continue;
      }
      const bloco = blocoParaFala(ssml);
      if (bloco) {
        // Listas e código mais devagar (M23b): cada bloco do tts.js é uma mensagem.
        const tipo = tipoDoElemento(view.tts.block?.commonAncestorContainer);
        await voz.falar(bloco.ssml, {
          idioma: bloco.idioma ?? idiomaDoLivro,
          velocidade: velocidadeDoTrecho(preferencias.velocidadeVoz, tipo),
        });
        void prepararSeguinte();
        return;
      }
      ssml = view.tts.next();
    }
  }

  /**
   * Adianta a voz do bloco seguinte (o `peekNext` não avança o tts.js). No fim do capítulo, o
   * primeiro bloco do seguinte, carregado à parte, sem ir até ele.
   */
  async function prepararSeguinte() {
    const tts = view?.tts;
    if (!view || !tts) return;
    const atual = tts.block;
    let seguinte = tts.peekNext() ?? null;
    if (!seguinte) {
      const secao = view.renderer.getContents()[0]?.index;
      if (secao === undefined) return;
      seguinte = await primeiroBlocoDaSecaoSeguinte(view.book.sections ?? [], secao).catch(
        () => null,
      );
      // Enquanto carregava, a leitura parou ou passou de bloco: o preparo já não serve.
      if (voz.estado !== "falando" || view?.tts?.block !== atual) return;
    }
    const bloco = seguinte && blocoParaFala(seguinte.ssml);
    if (!seguinte || !bloco) return;
    const tipo = tipoDoElemento(seguinte.range.commonAncestorContainer);
    prepararVoz(bloco.ssml, {
      idioma: bloco.idioma ?? idiomaDoLivro,
      velocidade: velocidadeDoTrecho(preferencias.velocidadeVoz, tipo),
    }).catch((erro) => log.warn(`${erro}`));
  }

  /** Vai ao próximo capítulo e devolve o primeiro bloco dele; `null` no fim do livro. */
  async function proximaSecao(): Promise<string | undefined | null> {
    if (!view) return null;
    const antes = view.renderer.getContents()[0]?.index;
    await view.renderer.nextSection();
    if (view.renderer.getContents()[0]?.index === antes) return null;
    await view.initTTS("sentence", mostrarFraseLida);
    return view.tts?.start();
  }

  /**
   * A frase marcada pela voz (M23b), realçada como um destaque (uma anotação a mais do
   * foliate-js, com a cor da interface): não usa a seleção (um clique não a desfaz e ela fica
   * na pausa) e segue as linhas do texto. A página vai até ela.
   */
  function mostrarFraseLida(frase: Range) {
    if (!view) return;
    voz.fraseLida = frase;
    void view.renderer.scrollToAnchor(frase);
    const doc = frase.startContainer.ownerDocument;
    const indice = view.renderer.getContents().find((c) => c.doc === doc)?.index;
    if (indice !== undefined) trocarRealce(view.getCFI(indice, frase));
  }

  function trocarRealce(cfi: string | null) {
    const antes = realceVoz;
    if (!view || antes === cfi) return;
    realceVoz = cfi;
    if (antes) {
      // Mesmo lugar de um destaque: apagar o realce apagaria o desenho dele, que volta.
      void view
        .deleteAnnotation({ value: antes })
        .then(() => destaques.porLocal(antes) && view?.addAnnotation({ value: antes }));
    }
    if (cfi) void view.addAnnotation({ value: cfi });
  }

  async function abrir() {
    // Espera a transição da capa terminar: carregar o livro durante ela a faria engasgar.
    await aguardarTransicao();
    const v = await criarView();
    marcaTexto = await desenhoMarcaTexto();
    // Cada capítulo carregado ganha uma camada de desenho: os destaques dele são desenhados
    // ali (addAnnotation só desenha os da seção carregada) e redesenhados ao repaginar.
    v.addEventListener("create-overlay", () => {
      for (const d of destaques.lista) v.addAnnotation({ value: d.local });
      // A seção acabou de carregar: a ocorrência atual da busca, se estiver nela.
      if (realceBusca) void v.addAnnotation({ value: realceBusca });
    });
    v.addEventListener("draw-annotation", (e) => {
      const { draw, annotation } = (e as CustomEvent<{
        draw: (desenho: Desenho, opcoes: { color: string }) => void;
        annotation: { value: string };
      }>).detail;
      const d = destaques.porLocal(annotation.value);
      const realce = annotation.value === realceVoz || annotation.value === realceBusca;
      const cor = realce ? corDoRealce() : hexDaCor(d?.cor ?? "amarelo");
      if (marcaTexto) draw(marcaTexto, { color: cor });
    });
    // Clique num destaque: a barra dele (cor, nota, copiar, apagar).
    v.addEventListener("show-annotation", (e) => {
      const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail;
      const d = destaques.porLocal(value);
      if (d) destaques.mostrarDestaque(d, posicaoNoIframe(range));
    });
    // Um link dentro do livro. Uma nota de rodapé abre num balão, sem sair da página (M35b); os
    // outros (referência cruzada, sumário impresso) o foliate-js segue, e antes guarda-se de onde,
    // com um aviso que oferece a volta.
    v.addEventListener("link", (e) => {
      const { a, href } = (e as CustomEvent<{ a: Element; href: string }>).detail;
      const chance = chamadaDeNota(a);
      if (chance !== "nao") {
        // Síncrono: o foliate-js só segue o link se ninguém o impedir.
        e.preventDefault();
        void mostrarNota(a, href, chance);
        return;
      }
      seguiuUmLink();
    });
    v.addEventListener("relocate", (e) => {
      // No modo frase, a página vira para acompanhar a frase: a barra vai junto.
      if (!modoFrase) destaques.esconderDe(false, "a página mudou");
      // A página virou: o balão da nota ficaria sobre outro texto.
      fecharNota(false);
      const { fraction, tocItem, cfi } = (e as CustomEvent<DetalheRelocate>).detail;
      relocacoes++;
      progresso = fraction;
      if (cfi) cfiAtual = cfi;
      hrefAtual = tocItem?.href;
      if (cfi) onProgresso?.(cfi, fraction);
      acompanharIdeia();
      moverMeta(fraction, tocItem?.label.trim());
      const secao = tocItem?.label.trim();
      // O primeiro posicionamento não é anunciado: o foco no título já informa o livro.
      if (secao && secao !== secaoAnunciada) {
        if (secaoAnunciada !== undefined) anuncio = `Seção: ${secao}`;
        secaoAnunciada = secao;
      }
    });
    // Cada capítulo é um iframe: teclas pressionadas lá dentro não chegam à janela. Uma cópia
    // é reenviada à janela, onde ficam todos os atalhos (inclusive o F1 do App e o Esc da moldura).
    v.addEventListener("load", (e) => {
      const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
      tirarEspacoAposUltimaQuebra(doc);
      // Um clique no texto fecha o balão da nota (os cliques no iframe não chegam à janela).
      doc.addEventListener("pointerdown", () => fecharNota(false));
      // Seleção com o mouse: a barra aparece ao soltar (sem tirar o foco do texto).
      doc.addEventListener("pointerup", () =>
        setTimeout(() => {
          if (!verSelecao(doc, index, false)) escolherIdeiaNoClique(doc);
        }),
      );
      doc.addEventListener("pointerdown", () => destaques.esconder("clique no texto"));
      doc.addEventListener("keydown", (original) => {
        const copia = new KeyboardEvent("keydown", {
          key: original.key,
          code: original.code,
          ctrlKey: original.ctrlKey,
          shiftKey: original.shiftKey,
          altKey: original.altKey,
          metaKey: original.metaKey,
          cancelable: true,
        });
        window.dispatchEvent(copia);
        if (copia.defaultPrevented) original.preventDefault();
      });
    });
    palco.append(v);
    view = v;

    await v.open(arquivo);
    v.renderer.setAttribute("flow", "paginated");
    pronto = true;

    titulo = textoLocalizado(v.book.metadata?.title) || arquivo.name;
    const idioma = v.book.metadata?.language;
    idiomaDoLivro = (Array.isArray(idioma) ? idioma[0] : idioma) ?? null;
    itensIndice = v.book.toc ?? [];
    livroRtl = v.book.dir === "rtl";
    void posicionarIndice(v);
    await destaques.carregar();
    await v.init({ lastLocation: inicio ?? null, showTextStart: !inicio });
    moldura.focarTitulo();
    montarContinuacao();
  }

  // "Onde você parou" (M22): ao reabrir depois de uma hora ou mais, o capítulo e as frases em
  // volta do ponto salvo (as duas anteriores e a que a página cortou), do próprio texto.
  let continuacao = $state<Continuacao | null>(null);
  /** A frase em que a página cortou: pisca ao fechar o cartão ("continue daqui"). */
  let pontoDaContinuacao: Range | null = null;

  /** Faz piscar a frase do ponto salvo, se o capítulo dela ainda estiver na tela. */
  function piscarOndeParou() {
    const frase = pontoDaContinuacao;
    const doc = frase?.startContainer.ownerDocument;
    const janela = doc?.defaultView;
    if (!frase || !doc || !janela || !view?.renderer.getContents().some((c) => c.doc === doc)) return;
    const caixas = [...frase.getClientRects()]
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        left: r.left + janela.scrollX,
        top: r.top + janela.scrollY,
        width: r.width,
        height: r.height,
      }));
    const iface = temaEfetivo();
    const escura = iface === "alto-contraste" || paginaEscura(resolverPagina(preferencias.pagina, iface));
    piscar(doc.documentElement, caixas, estiloDoMarcaTexto(escura));
  }

  function montarContinuacao() {
    const agora = Date.now() / 1000;
    if (!deveMostrar(!!inicio, ultimaLeitura, agora)) return;
    const capitulo = capituloVisivel();
    const ponto = view?.lastLocation?.range;
    let trecho: string[] = [];
    if (capitulo && ponto) {
      const frases =
        frasesPorCapitulo.get(capitulo.doc) ?? frasesDoDocumento(capitulo.doc, idiomaDoLivro);
      frasesPorCapitulo.set(capitulo.doc, frases);
      if (frases.length) {
        const i = indiceDaFraseEm(frases, ponto);
        pontoDaContinuacao = frases[i] ?? null;
        trecho = frases
          .slice(Math.max(0, i - 2), i + 1)
          .map((f) => resumo(limpar(f.toString()), 300))
          .filter(Boolean);
      }
    }
    continuacao = {
      onde: secaoAnunciada ? `em “${secaoAnunciada}”` : `em ${porcento.format(progresso)} do livro`,
      quando: ultimaLeitura ? haQuanto(ultimaLeitura, agora) : undefined,
      trecho,
    };
  }

  /** Um trecho revisitado ("secao:3"): vai ao início da seção, com o foco no texto. */
  // "De onde vim" (M35a): os saltos (link, índice, destaque, slider, busca) guardam o ponto de
  // partida; Alt+← volta a ele. Virar páginas não entra.
  const caminho = new Caminho<string>();
  const vouSaltar = () => caminho.sair(cfiAtual);

  async function voltarAoPonto() {
    const ponto = caminho.voltar();
    if (!view || !ponto) return;
    destaques.esconder("voltar");
    await view.goTo(ponto);
    view.renderer.focusView();
    anuncio = "De volta para onde você estava.";
  }

  function seguiuUmLink() {
    vouSaltar();
    avisar("Você seguiu um link do livro.", "sucesso", {
      rotulo: "Voltar (Alt+←)",
      executar: () => void voltarAoPonto(),
    });
  }

  // Nota de rodapé num balão (M35b).
  let nota = $state<{ nota: Nota; href: string; x: number; y: number; abaixo: boolean } | null>(
    null,
  );

  /** A nota que o link `a` chama, num balão; se não der para mostrar, o link segue como link. */
  async function mostrarNota(a: Element, href: string, chance: "sim" | "talvez") {
    if (!view) return;
    const doc = a.ownerDocument;
    const chamada = doc.createRange();
    chamada.selectNodeContents(a);
    const posicao = posicaoNoIframe(chamada);
    let achada: Nota | null = null;
    try {
      const destino = view.book.resolveHref?.(href);
      const secao = destino ? view.book.sections?.[destino.index] : undefined;
      const docDaNota = await secao?.createDocument?.();
      const alvo = docDaNota && destino?.anchor(docDaNota);
      // Nós de outro documento: pelo nodeType, não por instanceof (CLAUDE.md).
      if (alvo && (alvo as Node).nodeType === Node.ELEMENT_NODE)
        achada = notaDoLink(a, chance, alvo as Element);
    } catch (erro) {
      log.warn(`nota de rodapé: ${erro}`);
    }
    if (!achada) {
      // Não era uma nota que caiba num balão: segue o link, como os outros.
      seguiuUmLink();
      await view.goTo(href);
      return;
    }
    destaques.esconder("nota de rodapé");
    nota = { nota: achada, href, ...posicao };
  }

  /** Fecha o balão; `focarTexto`: o foco volta ao livro (Esc, "Fechar"). */
  function fecharNota(focarTexto = true) {
    if (!nota) return;
    nota = null;
    if (focarTexto) view?.renderer.focusView();
  }

  /** "Ir até a nota": o lugar dela no livro; Alt+← volta à chamada. */
  async function irAteANota() {
    if (!view || !nota) return;
    const { href } = nota;
    nota = null;
    vouSaltar();
    await view.goTo(href);
    view.renderer.focusView();
    anuncio = "Na nota. Alt+← volta ao texto.";
  }

  async function irParaTrecho(local: string) {
    const indice = Number(local.match(/^secao:(\d+)$/)?.[1]);
    if (!view || !Number.isInteger(indice)) return;
    vouSaltar();
    await view.goTo(indice);
    view.renderer.focusView();
  }

  async function irParaSecao(href: string) {
    if (!view) return;
    vouSaltar();
    await view.goTo(href);
    // Leva o foco ao texto: o leitor de tela continua a leitura dali.
    view.renderer.focusView();
  }

  /** Há texto selecionado em `doc`? Abre a barra sobre ele (com o CFI já calculado). */
  function verSelecao(doc: Document, indice: number, focar: boolean): boolean {
    const sel = doc.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    // Texto selecionado e nenhuma barra: o log diz por quê (ver CLAUDE.md, "Seleção sem barra").
    if (!view) {
      log.warn("seleção sem barra: o livro ainda não está pronto");
      return false;
    }
    const range = sel.getRangeAt(0);
    const selecao = selecaoNoEpub(view, indice, range);
    if (!selecao) {
      log.warn(`seleção sem barra: o trecho não tem texto (seção ${indice})`);
      return false;
    }
    destaques.mostrarSelecao(selecao, posicaoNoIframe(range), focar);
    return true;
  }

  /**
   * Ctrl+D: a barra da seleção, com o foco nela; sem seleção, a da frase atual. Com a voz
   * lendo, a frase lida vira a seleção: a voz pausa enquanto a barra está aberta (senão a página
   * vira no meio da escolha e a barra fecha) e continua quando ela fecha.
   */
  async function destacarSelecao() {
    if (!view) return;
    // A frase lida está só realçada: vira a seleção, para a barra abrir sobre ela.
    const lida = await voz.pausarParaDestacar();
    if (lida) {
      const sel = lida.startContainer.ownerDocument?.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(lida);
    }
    const comSelecao = view.renderer
      .getContents()
      .some(({ doc, index }) => verSelecao(doc, index, true));
    if (!comSelecao) await iniciarModoFrase();
    // Nada para destacar (a barra não abriu): a voz continua na hora.
    if (!destaques.barra) voz.retomarDepoisDaBarra();
  }

  /** O capítulo visível: o documento e o índice da seção. */
  function capituloVisivel(): { doc: Document; indice: number } | null {
    const doc = view?.lastLocation?.range?.startContainer.ownerDocument;
    const conteudo = view?.renderer.getContents().find((c) => c.doc === doc);
    return conteudo ? { doc: conteudo.doc, indice: conteudo.index } : null;
  }

  /** Frases de cada capítulo já dividido (o documento não muda enquanto está carregado). */
  const frasesPorCapitulo = new WeakMap<Document, Range[]>();

  async function iniciarModoFrase() {
    const capitulo = capituloVisivel();
    // Com a uma ideia por vez, a partir do bloco em evidência; senão, do início da página.
    const bloco = ideia?.doc === capitulo?.doc ? ideia?.blocos[ideia.atual]?.trecho : undefined;
    const inicio = bloco ?? view?.lastLocation?.range;
    if (!capitulo || !inicio) return;
    const frases =
      frasesPorCapitulo.get(capitulo.doc) ?? frasesDoDocumento(capitulo.doc, idiomaDoLivro);
    frasesPorCapitulo.set(capitulo.doc, frases);
    if (!frases.length) {
      anuncio = "Não há texto nesta página para destacar.";
      return;
    }
    const i = indiceDaFraseEm(frases, inicio);
    modoFrase = { ...capitulo, frases, de: i, ate: i };
    await mostrarFrases();
  }

  /** Seleciona o trecho do modo frase, vira a página até ele e abre a barra (com o foco). */
  async function mostrarFrases() {
    if (!view || !modoFrase) return;
    const { doc, indice, frases, de, ate } = modoFrase;
    const trecho = unir(frases, de, ate);
    await view.renderer.scrollToAnchor(trecho, true);
    // Ao virar, o foliate seleciona o trecho; sem virar, não: seleciona aqui, nos dois casos.
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(trecho);
    await new Promise(requestAnimationFrame);
    if (!modoFrase) return;
    verSelecao(doc, indice, true);
    anuncio = `Frase: ${resumo(trecho.toString(), 300)}`;
  }

  /** Alt+↑/↓ (outra frase) e Alt+Shift+↑/↓ (trecho menor ou maior), dentro do capítulo. */
  function mudarTrecho(mudanca: MudancaDeTrecho) {
    if (!modoFrase) return;
    const { frases, de, ate } = modoFrase;
    const novo = trechoSeguinte(frases.length, de, ate, mudanca);
    if (!novo) {
      anuncio = mudanca === "anterior" ? "Início do capítulo." : mudanca === "encolher" ? "Só uma frase." : "Fim do capítulo.";
      return;
    }
    modoFrase = { ...modoFrase, de: novo[0], ate: novo[1] };
    void mostrarFrases();
  }

  /** Ouvir a partir do trecho da barra (seleção, frase ou destaque) até o fim do livro. */
  async function ouvirDaqui() {
    const carregados = view?.renderer.getContents() ?? [];
    const barra = destaques.barra;
    let trecho: Range | undefined;
    if (modoFrase) trecho = unir(modoFrase.frases, modoFrase.de, modoFrase.ate);
    else if (barra?.destaque && view) {
      // O CFI do destaque, de volta para um trecho no capítulo carregado.
      const { index, anchor } = view.resolveCFI(barra.destaque.local);
      const doc = carregados.find((c) => c.index === index)?.doc;
      if (doc) trecho = anchor(doc);
    } else {
      for (const { doc } of carregados) {
        const sel = doc.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount) trecho = sel.getRangeAt(0).cloneRange();
      }
    }
    // A leitura recomeça no trecho: não retomar a pausada ao fechar a barra.
    voz.naoRetomar();
    destaques.fecharBarra();
    if (trecho) await voz.ouvirTrecho(frasesDoTrechoNoCapitulo(trecho));
  }

  /** As frases que o trecho alcança, cortadas nas pontas (o "Ouvir" da barra lê só elas). */
  function frasesDoTrechoNoCapitulo(trecho: Range): Range[] {
    const doc = trecho.startContainer.ownerDocument;
    if (!doc) return [];
    const doCapitulo = frasesPorCapitulo.get(doc) ?? frasesDoDocumento(doc, idiomaDoLivro);
    frasesPorCapitulo.set(doc, doCapitulo);
    return frasesDoTrecho(doCapitulo, trecho);
  }

  function aoApontarFora(e: PointerEvent) {
    if (!(e.target instanceof Element && e.target.closest(".barra-destaque"))) {
      destaques.esconder("clique fora da barra");
    }
    if (!(e.target instanceof Element && e.target.closest(".balao-nota"))) fecharNota(false);
  }

  async function irParaDestaque(destaque: Destaque) {
    if (!view) return;
    vouSaltar();
    await view.goTo(destaque.local);
    view.renderer.focusView();
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

  // Paleta de comandos: o que dá para fazer neste livro agora (muda com a voz, a seção atual e
  // as preferências).
  $effect(() => {
    const lista: Comando[] = [
      {
        id: "proxima",
        titulo: "Próxima página",
        grupo: "Leitura",
        teclas: [["Page Down"]],
        executar: () => void proxima(),
      },
      {
        id: "anterior",
        titulo: "Página anterior",
        grupo: "Leitura",
        teclas: [["Page Up"]],
        executar: () => void anterior(),
      },
      {
        id: "buscar",
        titulo: "Buscar no documento",
        grupo: "Leitura",
        teclas: [["Ctrl", "F"]],
        executar: () => void busca?.abrir(),
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
    ];
    if (umaIdeia)
      lista.push(
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
      );
    lista.push(
      ...caminho.comandos(() => void voltarAoPonto()),
      ...voz.comandos(),
    );
    lista.push(...comandosDaVelocidade(preferencias, atualizarPreferencias));
    lista.push(...comandosDaVozNaturalDoApp(preferencias, atualizarPreferencias));
    lista.push(comandoQuantoFalta(estimativa, "epub", (texto) => (anuncio = texto)));
    lista.push(...comandosDasRevisitas(revisitas.lista, irParaTrecho));
    lista.push(...destaques.comandos(destacarSelecao), ...comandosDaMeta(meta, "epub"),
      ...comandosDoFoco(saidaDoFoco, "epub", (m) => moldura.focarPor(m)),
    );
    lista.push(
      ...comandosDoLado(!!ladoAlvo, itensIndice, {
        abrir: (href) => void abrirAoLado(href),
        abrirAqui: () => cfiAtual && void abrirAoLado(cfiAtual, true),
        fechar: fecharLado,
        alternar: alternarLado,
      }),
      ...comandosDoIndice(itensIndice, hrefAtual, irParaSecao),
      ...comandosDaPagina(preferencias, atualizarPreferencias),
      ...comandosDoTexto(preferencias, atualizarPreferencias, restaurarPadrao),
    );
    onComandos?.({
      comandos: lista,
      porTermo: (termo) => [
        ...irParaPorcentagem(termo, (f) => void irParaPonto(Math.round(f * MIL))),
        ...metaPorTermo(termo, meta, "epub"),
      ],
    });
  });

  // Dois pontos do livro lado a lado (M25b): o lado novo lê e destaca (LadoEpub); o resto
  // (voz, meta, sessão, progresso) é só deste lado.
  let ladoAlvo = $state<string | null>(null);
  let lado = $state<LadoEpub>();
  let secaoLado = $state("");
  let progressoLado = $state(0);
  /** O ponto em que o livro está (para "Abrir este ponto ao lado"). */
  let cfiAtual: string | undefined;

  /** O ponto em que o lado abriu, quando foi "este ponto": o principal volta a ele (ladoPronto). */
  let mesmoPonto: string | null = null;

  /** Abre o lado em `alvo` (seção ou CFI) ou, se já aberto, leva-o até lá. */
  async function abrirAoLado(alvo: string, noMesmoPonto = false) {
    if (lado) {
      await lado.ir(alvo);
      return;
    }
    mesmoPonto = noMesmoPonto ? alvo : null;
    ladoAlvo = alvo;
    anuncio = "Lado aberto. F6 alterna entre os lados.";
  }

  function fecharLado() {
    if (!ladoAlvo) return;
    ladoAlvo = null;
    secaoLado = "";
    anuncio = "Lado fechado.";
    view?.renderer.focusView();
  }

  /** O botão e o Ctrl+Shift+L: abre o lado no ponto em que o livro está, ou o fecha. */
  function alternarAbertura() {
    if (ladoAlvo) fecharLado();
    else if (cfiAtual) void abrirAoLado(cfiAtual, true);
  }

  /**
   * O lado abriu. Se foi no mesmo ponto, o principal vai até ele também: ao dividir a tela, o
   * principal repagina a partir do que estava visível na tela larga (às vezes duas colunas) e
   * podia parar numa página vizinha. Com o mesmo CFI, os dois mostram a mesma página.
   */
  async function ladoPronto() {
    const ponto = mesmoPonto;
    mesmoPonto = null;
    if (!ponto || !view) return;
    await view.goTo(ponto);
    // Os dois ainda repaginam enquanto a tela termina de se dividir (e o lado às vezes para uma
    // página adiante): espera tudo assentar e leva o lado ao início da página do principal,
    // uma posição sem ambiguidade (o ponto podia estar no meio de um parágrafo).
    await assentar();
    if (lado && cfiAtual) await lado.ir(cfiAtual);
  }

  /** Espera até o livro ficar 150 ms sem mudar de página (no máximo 1 s). */
  function assentar(): Promise<void> {
    return new Promise((resolver) => {
      const limite = setTimeout(fim, 1000);
      let espera = setTimeout(fim, 150);
      const aoMudar = () => {
        clearTimeout(espera);
        espera = setTimeout(fim, 150);
      };
      view?.addEventListener("relocate", aoMudar);
      lado?.aoMudar(aoMudar);
      function fim() {
        clearTimeout(limite);
        clearTimeout(espera);
        view?.removeEventListener("relocate", aoMudar);
        lado?.aoMudar(null);
        resolver();
      }
    });
  }

  /** F6: o foco vai ao outro lado. */
  function alternarLado() {
    if (!lado) return;
    // Para o leitor de tela: em qual lado o foco ficou (M26a).
    if (lado.contem(document.activeElement)) {
      view?.renderer.focusView();
      anuncio = `Livro principal, ${porcento.format(progresso)}.`;
    } else {
      lado.focar();
      anuncio = `Ao lado${secaoLado ? `: ${secaoLado}` : ""}, ${porcento.format(progressoLado)}.`;
    }
  }

  function aoTeclar(e: KeyboardEvent) {
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    if (e.key === "F6" && ladoAlvo && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      alternarLado();
      return;
    }
    if (ehVoltar(e) && !e.defaultPrevented && !(e.target instanceof HTMLInputElement)) {
      // Sempre: na webview, Alt+← sozinho voltaria na navegação da página.
      e.preventDefault();
      void voltarAoPonto();
      return;
    }
    // Sem Shift: Ctrl+Shift+F é o modo foco (da moldura).
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f" && !e.defaultPrevented) {
      e.preventDefault();
      void busca?.abrir();
      return;
    }
    // Setas dentro de controles (ex.: deslizantes do painel) são do controle, não do livro.
    if (e.target instanceof HTMLInputElement) return;
    if (!view || e.defaultPrevented) return;
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      void destacarSelecao();
      return;
    }
    if (e.key === "Escape" && destaques.barra) {
      e.preventDefault();
      destaques.fecharBarra();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (umaIdeia && !e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      destaques.esconder();
      void andarIdeia(e.key === "ArrowDown" ? "frente" : "tras");
      return;
    }
    // Setas seguem a direção visual (livros RTL invertem); PageUp/PageDown seguem a ordem de leitura.
    const acoes: Record<string, () => Promise<void>> = {
      ArrowLeft: () => moldura.virarPagina("esquerda", () => view!.goLeft()),
      ArrowRight: () => moldura.virarPagina("direita", () => view!.goRight()),
      PageUp: anterior,
      PageDown: proxima,
    };
    const acao = acoes[e.key];
    if (acao) {
      e.preventDefault();
      // Virar a página à mão encerra a barra (e o modo frase).
      destaques.esconder();
      acao();
    }
  }
</script>

{#snippet cartoesFixados()}
  {#each destaques.fixados as d (d.id)}
    <CartaoFixado
      destaque={d}
      onIr={() => void irParaDestaque(d)}
      onNota={() => destaques.editarNota(d)}
      onDesafixar={() => destaques.desafixar(d)}
      onAbrirAoLado={() => void abrirAoLado(d.local)}
    />
  {/each}
{/snippet}

{#snippet ladoNovo()}
  {#if ladoAlvo}
    <LadoEpub
      bind:this={lado}
      {arquivo}
      alvo={ladoAlvo}
      css={cssLivro}
      largura={larguraLivro}
      {escura}
      {destaques}
      bind:secao={secaoLado}
      bind:progresso={progressoLado}
      onPronto={() => void ladoPronto()}
    />
  {/if}
{/snippet}

{#snippet controlesLado()}
  <ControlesLado onFechar={fecharLado}>
    <div class="grupo-barra">
      <div class="grupo-sem-caixa" role="group" aria-label="Páginas deste lado">
        <button type="button" onclick={() => void lado?.virar("esquerda")}>
          <Icone nome="anterior" /><span class="rotulo">Anterior</span>
        </button>
        <Posicao
          valor={Math.round(progressoLado * MIL)}
          min={0}
          max={MIL}
          passo={10}
          grande={100}
          rotulo="Posição no livro, deste lado"
          texto={textoDoPonto}
          rtl={livroRtl}
          onIr={(v) => void lado?.irParaFracao(v / MIL)}
        />
        <span class="porcento">{porcento.format(progressoLado)}</span>
        <button type="button" onclick={() => void lado?.virar("direita")}>
          <Icone nome="proxima" /><span class="rotulo">Próxima</span>
        </button>
      </div>
    </div>
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
  onContinuar={piscarOndeParou}
  estimativa={estimativa ? textoDoRodape(estimativa, "epub") : undefined}
  fixado={destaques.fixados.length ? cartoesFixados : undefined}
  lado={ladoAlvo ? ladoNovo : undefined}
  rodapeLado={controlesLado}
  onAlternarLado={alternarAbertura}
  {titulo}
  {anuncio}
  {progresso}
  {onFechar}
>
  {#snippet acoes()}
    <Busca bind:this={busca} resultado={resultadoBusca} onBuscar={buscar} onLimpar={limparBusca} />
  {/snippet}

  {#snippet indice()}
    <AbasIndice bind:this={abas} bind:aba={abaIndice} quantidade={destaques.lista.length}>
      {#snippet conteudoIndice()}
        {#if itensIndice.length}
          <Indice itens={itensIndice} atual={hrefAtual} onNavegar={irParaSecao} />
        {:else}
          <p>Este livro não tem índice.</p>
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
    <AbasAparencia prefixo="aparencia-epub">
      {#snippet leitura()}
        <PainelPagina
          {preferencias}
          onMudar={atualizarPreferencias}
          formato="epub"
          interface={temaEfetivo()}
        />
        <PainelLeitura {preferencias} onMudar={atualizarPreferencias} onRestaurar={restaurarPadrao} />
      {/snippet}
      {#snippet voz()}
        <PainelVoz {preferencias} onMudar={atualizarPreferencias} />
      {/snippet}
      {#snippet aparenciaDoApp()}
        <PainelTema
          {preferencias}
          onMudar={atualizarPreferencias}
          temaDoSistema={resolverTema("sistema", sistema)}
        />
      {/snippet}
    </AbasAparencia>
  {/snippet}

  {#snippet rodape()}
    <!-- Com o lado aberto, o rodapé dos dois fica igual: "Ler em voz alta" sai (continua na
         paleta); lendo ou pausada, os controles da voz ficam. -->
    {#if !ladoAlvo || voz.estado !== "parado"}
      <ControlesVoz
        estado={voz.estado}
        onLer={() => void voz.ler()}
        onPausarOuRetomar={() => void voz.pausarOuRetomar()}
        onParar={() => void voz.parar()}
      />
    {/if}
    <div class="grupo-barra">
      <div class="grupo-sem-caixa" role="group" aria-label="Páginas">
        <button type="button" onclick={anterior}>
          <Icone nome="anterior" /><span class="rotulo">Anterior</span>
        </button>
        <Posicao
          valor={Math.round(progresso * MIL)}
          min={0}
          max={MIL}
          passo={10}
          grande={100}
          rotulo="Posição no livro"
          texto={textoDoPonto}
          rtl={livroRtl}
          onIr={irParaPonto}
        />
        <span class="porcento">{porcento.format(progresso)}</span>
        <button type="button" onclick={proxima}>
          <Icone nome="proxima" /><span class="rotulo">Próxima</span>
        </button>
      </div>
    </div>
  {/snippet}

  {#if nota}
    <BalaoNota
      nota={nota.nota}
      x={nota.x}
      y={nota.y}
      abaixo={nota.abaixo}
      onIr={() => void irAteANota()}
      onFechar={() => fecharNota()}
    />
  {/if}

  <DestaquesDoLeitor
    controle={destaques}
    onOuvir={voz.possivel ? () => void ouvirDaqui() : undefined}
    onTrecho={(m) => (lado?.temModoFrase() ? lado.mudarTrecho(m) : mudarTrecho(m))}
  />

  <div class="palco" bind:this={palco}>
    {#if erro}
      <p role="alert">{erro}</p>
    {:else if !pronto}
      <Carregando texto="Abrindo o livro…" />
    {/if}
  </div>
</MolduraLeitor>

<style>
  .palco {
    height: 100%;
  }

  .palco :global(foliate-view) {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* "100%" é o mais largo: a porcentagem não empurra os botões ao mudar. */
  .porcento {
    min-width: 4.5ch;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
