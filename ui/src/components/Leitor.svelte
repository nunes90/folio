<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import Indice from "./Indice.svelte";
  import AbasIndice, { type Aba } from "./AbasIndice.svelte";
  import DestaquesDoLeitor from "./DestaquesDoLeitor.svelte";
  import CartaoFixado from "./CartaoFixado.svelte";
  import LadoEpub from "./LadoEpub.svelte";
  import ControlesLado from "./ControlesLado.svelte";
  import ListaDestaques from "./ListaDestaques.svelte";
  import Carregando from "./Carregando.svelte";
  import Icone from "./Icone.svelte";
  import ControlesVoz from "./ControlesVoz.svelte";
  import MolduraLeitor from "./MolduraLeitor.svelte";
  import PainelLeitura from "./PainelLeitura.svelte";
  import PainelPagina from "./PainelPagina.svelte";
  import PainelTema from "./PainelTema.svelte";
  import {
    criarView,
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
  import { frasesDoDocumento, indiceDaFraseEm, unir } from "../lib/frases";
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
  import { avisar } from "../lib/avisos.svelte";
  import type { Trecho } from "../lib/biblioteca";
  import { ritmoDeLeitura } from "../lib/biblioteca";
  import {
    aplicarMarcaTexto,
    estiloDoMarcaTexto,
    hexDaCor,
    paginaEscura,
    posicaoNoIframe,
    resumo,
    selecaoNoEpub,
  } from "../lib/destaques";
  import { resolverPagina } from "../lib/pagina";
  import {
    comandosDaPagina,
    comandosDoIndice,
    comandosDoLado,
    comandosDoTexto,
    type Comando,
    type ComandosDoLeitor,
  } from "../lib/comandos";
  import {
    blocoParaFala,
    comandosDaVoz,
    falar,
    ouvirVoz,
    pararVoz,
    tipoDoElemento,
    velocidadeDoTrecho,
    vozDisponivel,
    type EstadoVoz,
    type EventoVoz,
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
      // A barra foi aberta com a voz lendo (Ctrl+D): a leitura continua de onde parou, e a
      // frase volta a ser só o realce.
      if (retomarVozAoFechar) {
        retomarVozAoFechar = false;
        fraseLida?.startContainer.ownerDocument?.getSelection()?.removeAllRanges();
        if (voz === "pausado") void pausarOuRetomar();
      }
    },
  });

  // Modo frase (M17a): Ctrl+D sem seleção seleciona a frase atual (a primeira da página) e
  // abre a barra; Alt+↑/↓ trocam de frase, Alt+Shift+↑/↓ encolhem ou estendem o trecho. Para
  // destacar sem o mouse e sem leitor de tela. A frase é selecionada de verdade: a seleção é
  // a prévia, e o resto (barra, destaque, copiar, ouvir) é o mesmo da seleção com o mouse.
  let modoFrase: { doc: Document; indice: number; frases: Range[]; de: number; ate: number } | null =
    null;
  /** Ctrl+D pausou a voz para destacar a frase lida: retomar quando a barra fechar. */
  let retomarVozAoFechar = false;
  /** A frase que a voz está lendo (ou leu por último, na pausa) e o CFI do realce dela. */
  let fraseLida: Range | null = null;
  let realceVoz: string | null = null;

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

  // Leitura em voz alta: um bloco (parágrafo) por vez; ao terminar, o próximo.
  let voz = $state<EstadoVoz>("parado");
  let vozPossivel = $state(false);
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
      erro = `Não foi possível abrir o livro: ${e}`;
      log.error(erro);
    });
    let pararDeOuvir: (() => void) | undefined;
    vozDisponivel()
      .then((d) => (vozPossivel = d))
      .catch(() => {});
    ouvirVoz(aoEventoVoz)
      .then((f) => (pararDeOuvir = f))
      .catch(() => {});
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoApontarFora);
      // Fechar o livro encerra a leitura em voz alta.
      if (voz !== "parado") pararVoz().catch(() => {});
      pararDeOuvir?.();
      view?.close();
      view?.remove();
    };
  });

  /** Lado de onde vem a página seguinte: a direita, salvo em livros da direita para a esquerda. */
  const ladoDaProxima = () => (view?.book.dir === "rtl" ? "esquerda" : "direita");
  const ladoDaAnterior = () => (ladoDaProxima() === "direita" ? "esquerda" : "direita");

  function proxima() {
    return moldura.virarPagina(ladoDaProxima(), () => view?.next());
  }

  function anterior() {
    return moldura.virarPagina(ladoDaAnterior(), () => view?.prev());
  }

  /** Lê em voz alta a partir de `desde` (ou da página atual). Se já estiver lendo, recomeça dali. */
  async function lerEmVozAlta(desde?: Range) {
    if (!view) return;
    if (!vozPossivel) {
      anuncio =
        "Leitura em voz alta indisponível: o speech-dispatcher não está instalado ou ativo.";
      return;
    }
    if (voz !== "parado") await pararLeitura();
    await view.initTTS("sentence", mostrarFraseLida);
    // Começa na página atual (ou no trecho pedido), não no início do capítulo.
    const range = desde ?? view.lastLocation?.range;
    await seguirLendo(range ? view.tts?.from(range) : view.tts?.start());
  }

  /** Fala o bloco dado ou, se não houver o que falar, procura o próximo (inclusive em outros capítulos). */
  async function seguirLendo(ssml: string | undefined) {
    if (!view?.tts) return;
    for (;;) {
      if (ssml === undefined) {
        const proxima = await proximaSecao();
        if (proxima === null) {
          voz = "parado";
          anuncio = "Fim do livro.";
          return;
        }
        ssml = proxima;
        continue;
      }
      const bloco = blocoParaFala(ssml);
      if (bloco) {
        voz = "falando";
        // Listas e código mais devagar (M23b): cada bloco do tts.js é uma mensagem.
        const tipo = tipoDoElemento(view.tts.block?.commonAncestorContainer);
        await falar(bloco.ssml, {
          idioma: bloco.idioma ?? idiomaDoLivro,
          velocidade: velocidadeDoTrecho(preferencias.velocidadeVoz, tipo),
        });
        return;
      }
      ssml = view.tts.next();
    }
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

  function aoEventoVoz(e: EventoVoz) {
    // Eventos atrasados depois de parar ou pausar (ou de outro livro) são ignorados.
    if (voz !== "falando" || !view?.tts) return;
    if (e.tipo === "marca") view.tts.setMark(e.marca);
    else if (e.tipo === "fim") seguirLendo(view.tts.next()).catch((erro) => log.warn(`${erro}`));
    else voz = "parado";
  }

  /**
   * Pausar cancela a fala; retomar fala de novo a partir da frase em que parou (o `resume()`
   * do tts.js começa na última marca). A pausa do speech-dispatcher não servia: ele só pausa
   * na marca seguinte e, ao retomar, dava o bloco por terminado, pulando o resto dele.
   */
  async function pausarOuRetomar() {
    if (voz === "falando") {
      voz = "pausado";
      await pararVoz();
    } else if (voz === "pausado") {
      voz = "falando";
      await seguirLendo(view?.tts?.resume());
    }
  }

  async function pararLeitura() {
    voz = "parado";
    fraseLida = null;
    trocarRealce(null);
    await pararVoz();
  }

  /**
   * A frase marcada pela voz (M23b), realçada como um destaque (uma anotação a mais do
   * foliate-js, com a cor da interface): não usa a seleção (um clique não a desfaz e ela fica
   * na pausa) e segue as linhas do texto. A página vai até ela.
   */
  function mostrarFraseLida(frase: Range) {
    if (!view) return;
    fraseLida = frase;
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
    });
    v.addEventListener("draw-annotation", (e) => {
      const { draw, annotation } = (e as CustomEvent<{
        draw: (desenho: Desenho, opcoes: { color: string }) => void;
        annotation: { value: string };
      }>).detail;
      const d = destaques.porLocal(annotation.value);
      const cor = annotation.value === realceVoz ? corDoRealce() : hexDaCor(d?.cor ?? "amarelo");
      if (marcaTexto) draw(marcaTexto, { color: cor });
    });
    // Clique num destaque: a barra dele (cor, nota, copiar, apagar).
    v.addEventListener("show-annotation", (e) => {
      const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail;
      const d = destaques.porLocal(value);
      if (d) destaques.mostrarDestaque(d, posicaoNoIframe(range));
    });
    v.addEventListener("relocate", (e) => {
      // No modo frase, a página vira para acompanhar a frase: a barra vai junto.
      if (!modoFrase) destaques.esconder();
      const { fraction, tocItem, cfi } = (e as CustomEvent<DetalheRelocate>).detail;
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
      // Seleção com o mouse: a barra aparece ao soltar (sem tirar o foco do texto).
      doc.addEventListener("pointerup", () =>
        setTimeout(() => {
          if (!verSelecao(doc, index, false)) escolherIdeiaNoClique(doc);
        }),
      );
      doc.addEventListener("pointerdown", () => destaques.esconder());
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
  async function irParaTrecho(local: string) {
    const indice = Number(local.match(/^secao:(\d+)$/)?.[1]);
    if (!view || !Number.isInteger(indice)) return;
    await view.goTo(indice);
    view.renderer.focusView();
  }

  async function irParaSecao(href: string) {
    if (!view) return;
    await view.goTo(href);
    // Leva o foco ao texto: o leitor de tela continua a leitura dali.
    view.renderer.focusView();
  }

  /** Há texto selecionado em `doc`? Abre a barra sobre ele (com o CFI já calculado). */
  function verSelecao(doc: Document, indice: number, focar: boolean): boolean {
    const sel = doc.getSelection();
    if (!view || !sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const selecao = selecaoNoEpub(view, indice, range);
    if (!selecao) return false;
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
    if (voz === "falando") {
      await pausarOuRetomar();
      retomarVozAoFechar = true;
      // A frase lida está só realçada: vira a seleção, para a barra abrir sobre ela.
      if (fraseLida?.startContainer.isConnected) {
        const sel = fraseLida.startContainer.ownerDocument?.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(fraseLida);
      }
    }
    const comSelecao = view.renderer
      .getContents()
      .some(({ doc, index }) => verSelecao(doc, index, true));
    if (!comSelecao) await iniciarModoFrase();
    // Nada para destacar (a barra não abriu): a voz continua na hora.
    if (!destaques.barra && retomarVozAoFechar) {
      retomarVozAoFechar = false;
      if (voz === "pausado") await pausarOuRetomar();
    }
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
    const ultima = frases.length - 1;
    let [novoDe, novoAte] = [de, ate];
    if (mudanca === "proxima") novoDe = novoAte = Math.min(ate + 1, ultima);
    else if (mudanca === "anterior") novoDe = novoAte = Math.max(de - 1, 0);
    else if (mudanca === "estender") novoAte = Math.min(ate + 1, ultima);
    else novoAte = Math.max(ate - 1, de);
    if (novoDe === de && novoAte === ate) {
      anuncio = mudanca === "anterior" ? "Início do capítulo." : mudanca === "encolher" ? "Só uma frase." : "Fim do capítulo.";
      return;
    }
    modoFrase = { ...modoFrase, de: novoDe, ate: novoAte };
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
    retomarVozAoFechar = false;
    destaques.fecharBarra();
    if (trecho) await lerEmVozAlta(trecho);
  }

  function aoApontarFora(e: PointerEvent) {
    if (!(e.target instanceof Element && e.target.closest(".barra-destaque"))) destaques.esconder();
  }

  async function irParaDestaque(destaque: Destaque) {
    if (!view) return;
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
      ...comandosDaVoz(
        voz,
        () => void lerEmVozAlta(),
        () => void pausarOuRetomar(),
        () => void pararLeitura(),
      ),
    );
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
    onComandos?.({ comandos: lista, porTermo: (termo) => metaPorTermo(termo, meta, "epub") });
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
    if (lado.contem(document.activeElement)) view?.renderer.focusView();
    else lado.focar();
  }

  function aoTeclar(e: KeyboardEvent) {
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    if (e.key === "F6" && ladoAlvo && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      alternarLado();
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
    <div class="grupo-barra" role="group" aria-label="Páginas deste lado">
      <button type="button" onclick={() => void lado?.virar("esquerda")}>
        <Icone nome="anterior" /><span class="rotulo">Anterior</span>
      </button>
      <span class="porcento">{porcento.format(progressoLado)}</span>
      <button type="button" onclick={() => void lado?.virar("direita")}>
        <Icone nome="proxima" /><span class="rotulo">Próxima</span>
      </button>
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
    <PainelTema
      {preferencias}
      onMudar={atualizarPreferencias}
      temaDoSistema={resolverTema("sistema", sistema)}
    />
    <PainelPagina
      {preferencias}
      onMudar={atualizarPreferencias}
      formato="epub"
      interface={temaEfetivo()}
    />
    <PainelLeitura {preferencias} onMudar={atualizarPreferencias} onRestaurar={restaurarPadrao} />
  {/snippet}

  {#snippet rodape()}
    <!-- Com o lado aberto, o rodapé dos dois fica igual: "Ler em voz alta" sai (continua na
         paleta); lendo ou pausada, os controles da voz ficam. -->
    {#if !ladoAlvo || voz !== "parado"}
      <ControlesVoz
        estado={voz}
        onLer={() => void lerEmVozAlta()}
        onPausarOuRetomar={() => void pausarOuRetomar()}
        onParar={() => void pararLeitura()}
      />
    {/if}
    <div class="grupo-barra" role="group" aria-label="Páginas">
      <button type="button" onclick={anterior}>
        <Icone nome="anterior" /><span class="rotulo">Anterior</span>
      </button>
      <span class="porcento">{porcento.format(progresso)}</span>
      <button type="button" onclick={proxima}>
        <Icone nome="proxima" /><span class="rotulo">Próxima</span>
      </button>
    </div>
  {/snippet}

  <DestaquesDoLeitor
    controle={destaques}
    onOuvir={vozPossivel ? () => void ouvirDaqui() : undefined}
    onTrecho={mudarTrecho}
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

  .porcento {
    min-width: 3rem;
    text-align: center;
  }
</style>
