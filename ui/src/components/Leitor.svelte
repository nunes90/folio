<script lang="ts">
  import { onMount, tick } from "svelte";
  import Indice from "./Indice.svelte";
  import AbasIndice, { type Aba } from "./AbasIndice.svelte";
  import BarraDestaque from "./BarraDestaque.svelte";
  import EditarNota from "./EditarNota.svelte";
  import ListaDestaques from "./ListaDestaques.svelte";
  import Carregando from "./Carregando.svelte";
  import Icone from "./Icone.svelte";
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
    preferencias,
    restaurarPadrao,
  } from "../lib/preferencias.svelte";
  import { log } from "../lib/log";
  import { sistema, temaEfetivo } from "../lib/ambiente.svelte";
  import { resolverTema } from "../lib/temas";
  import { aguardarTransicao } from "../lib/transicao";
  import {
    apagarDestaque,
    criarDestaque,
    definirCorDestaque,
    definirNotaDestaque,
    escolherDestinoMarkdown,
    exportarDestaques,
    listarDestaques,
    restaurarDestaque,
    type CorDestaque,
    type Destaque,
  } from "../lib/biblioteca";
  import {
    aplicarMarcaTexto,
    fracaoNoDocumento,
    hexDaCor,
    nomeDaCor,
    paginaEscura,
    posicaoNoLivro,
    resumo,
  } from "../lib/destaques";
  import { resolverPagina } from "../lib/pagina";
  import { avisar } from "../lib/avisos.svelte";
  import {
    comandosDaPagina,
    comandosDoIndice,
    comandosDoTexto,
    type Comando,
    type ComandosDoLeitor,
  } from "../lib/comandos";
  import {
    blocoParaFala,
    falar,
    ouvirVoz,
    pararVoz,
    pausarVoz,
    retomarVoz,
    vozDisponivel,
    type EventoVoz,
  } from "../lib/voz";

  let {
    arquivo,
    livroId,
    inicio,
    onFechar,
    onProgresso,
    onComandos,
  }: {
    arquivo: File;
    /** Id do livro na biblioteca (para os destaques). */
    livroId: string;
    /** Onde retomar a leitura (EPUB CFI salvo na biblioteca). */
    inicio?: string;
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

  // Destaques (M16): a lista do livro, a barra sobre a seleção (ou sobre um destaque clicado)
  // e o diálogo da nota. A seleção é guardada ao abrir a barra: o foco pode sair do texto.
  let destaques = $state<Destaque[]>([]);
  let abaIndice = $state<Aba>("indice");
  let abas = $state<AbasIndice>();
  let barra = $state<{
    x: number;
    y: number;
    abaixo: boolean;
    focar: boolean;
    destaque: Destaque | null;
  } | null>(null);
  let selecao: { indice: number; range: Range } | null = null;
  let notaDe = $state<Destaque | null>(null);
  let marcaTexto: Desenho | undefined;

  // O marca-texto se mistura com a página: multiply no papel claro, screen no escuro.
  $effect(() => {
    const iface = temaEfetivo();
    const escura = iface === "alto-contraste" || paginaEscura(resolverPagina(preferencias.pagina, iface));
    if (pronto && view) aplicarMarcaTexto(view, escura);
  });

  // Leitura em voz alta: um bloco (parágrafo) por vez; ao terminar, o próximo.
  let voz = $state<"parado" | "falando" | "pausado">("parado");
  let vozPossivel = $state(false);
  let idiomaDoLivro: string | null = null;

  // Reaplica sempre que a escala do sistema ou as preferências mudarem (inclusive com o
  // painel aberto: o livro funciona como prévia ao vivo).
  $effect(() => {
    const css = cssDoLivro(preferencias, escala.fator, temaEfetivo());
    const largura = `${preferencias.larguraMaxima}px`;
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

  async function lerEmVozAlta() {
    if (!view) return;
    if (!vozPossivel) {
      anuncio =
        "Leitura em voz alta indisponível: o speech-dispatcher não está instalado ou ativo.";
      return;
    }
    await view.initTTS("sentence");
    // Começa na página atual, não no início do capítulo.
    const range = view.lastLocation?.range;
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
        await falar(bloco.ssml, {
          idioma: bloco.idioma ?? idiomaDoLivro,
          velocidade: preferencias.velocidadeVoz,
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
    await view.initTTS("sentence");
    return view.tts?.start();
  }

  function aoEventoVoz(e: EventoVoz) {
    // Eventos atrasados depois de parar (ou de outro livro) são ignorados.
    if (voz === "parado" || !view?.tts) return;
    if (e.tipo === "marca") view.tts.setMark(e.marca);
    else if (e.tipo === "fim") seguirLendo(view.tts.next()).catch((erro) => log.warn(`${erro}`));
    else voz = "parado";
  }

  async function pausarOuRetomar() {
    if (voz === "falando") {
      await pausarVoz();
      voz = "pausado";
    } else if (voz === "pausado") {
      await retomarVoz();
      voz = "falando";
    }
  }

  async function pararLeitura() {
    voz = "parado";
    await pararVoz();
  }

  async function abrir() {
    // Espera a transição da capa terminar: carregar o livro durante ela a faria engasgar.
    await aguardarTransicao();
    const v = await criarView();
    marcaTexto = await desenhoMarcaTexto();
    // Cada capítulo carregado ganha uma camada de desenho: os destaques dele são desenhados
    // ali (addAnnotation só desenha os da seção carregada) e redesenhados ao repaginar.
    v.addEventListener("create-overlay", () => {
      for (const d of destaques) v.addAnnotation({ value: d.local });
    });
    v.addEventListener("draw-annotation", (e) => {
      const { draw, annotation } = (e as CustomEvent<{
        draw: (desenho: Desenho, opcoes: { color: string }) => void;
        annotation: { value: string };
      }>).detail;
      const d = destaques.find((x) => x.local === annotation.value);
      if (marcaTexto) draw(marcaTexto, { color: hexDaCor(d?.cor ?? "amarelo") });
    });
    // Clique num destaque: a barra dele (cor, nota, copiar, apagar).
    v.addEventListener("show-annotation", (e) => {
      const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail;
      const d = destaques.find((x) => x.local === value);
      if (d) abrirBarra(range, d, false);
    });
    v.addEventListener("relocate", (e) => {
      barra = null;
      selecao = null;
      const { fraction, tocItem, cfi } = (e as CustomEvent<DetalheRelocate>).detail;
      progresso = fraction;
      hrefAtual = tocItem?.href;
      if (cfi) onProgresso?.(cfi, fraction);
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
      doc.addEventListener("pointerup", () => setTimeout(() => verSelecao(doc, index, false)));
      doc.addEventListener("pointerdown", () => {
        if (barra) barra = null;
      });
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
    destaques = await listarDestaques(livroId).catch((erro) => {
      log.warn(`destaques indisponíveis: ${erro}`);
      return [];
    });
    await v.init({ lastLocation: inicio ?? null, showTextStart: !inicio });
    moldura.focarTitulo();
  }

  async function irParaSecao(href: string) {
    if (!view) return;
    await view.goTo(href);
    // Leva o foco ao texto: o leitor de tela continua a leitura dali.
    view.renderer.focusView();
  }

  /** Abre a barra sobre `range` (coordenadas do iframe convertidas para as da janela). */
  function abrirBarra(range: Range, destaque: Destaque | null, focar: boolean) {
    const quadro = range.startContainer.ownerDocument?.defaultView?.frameElement;
    const r = range.getBoundingClientRect();
    const q = quadro?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const topo = q.top + r.top;
    // Sem espaço acima do trecho (perto do cabeçalho): a barra vai para baixo dele.
    const abaixo = topo < 96;
    barra = {
      x: q.left + r.left + r.width / 2,
      y: abaixo ? q.top + r.bottom : topo,
      abaixo,
      focar,
      destaque,
    };
  }

  /** Há texto selecionado em `doc`? Guarda a seleção e abre a barra. */
  function verSelecao(doc: Document, indice: number, focar: boolean): boolean {
    const sel = doc.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.toString().trim()) return false;
    selecao = { indice, range: range.cloneRange() };
    abrirBarra(range, null, focar);
    return true;
  }

  /** Ctrl+D: a barra da seleção, com o foco nela. */
  function destacarSelecao() {
    if (!view) return;
    const comSelecao = view.renderer
      .getContents()
      .some(({ doc, index }) => verSelecao(doc, index, true));
    if (!comSelecao) anuncio = "Selecione um trecho do texto para destacar.";
  }

  function aoApontarFora(e: PointerEvent) {
    if (barra && !(e.target instanceof Element && e.target.closest(".barra-destaque"))) barra = null;
  }

  /** Fecha a barra; se ela tinha o foco (teclado), devolve-o ao texto. */
  function fecharBarra() {
    const tinhaFoco = !!document.activeElement?.closest(".barra-destaque");
    barra = null;
    if (tinhaFoco) view?.renderer.focusView();
  }

  function limparSelecao() {
    for (const { doc } of view?.renderer.getContents() ?? []) doc.getSelection()?.removeAllRanges();
    selecao = null;
  }

  /** Reinsere na ordem de leitura (a do core: posição, depois criação). */
  function comDestaque(lista: Destaque[], d: Destaque): Destaque[] {
    return [...lista.filter((x) => x.id !== d.id), d].sort(
      (a, b) => a.posicao - b.posicao || a.criadoEm - b.criadoEm || a.id - b.id,
    );
  }

  /** Cria o destaque da seleção guardada; devolve-o (ou undefined, com aviso de erro). */
  async function criarDaSelecao(cor: CorDestaque): Promise<Destaque | undefined> {
    if (!view || !selecao) return;
    const { indice, range } = selecao;
    try {
      const d = await criarDestaque(livroId, {
        local: view.getCFI(indice, range),
        trecho: range.toString(),
        cor,
        capitulo: view.getProgressOf(indice, range)?.tocItem?.label?.trim() ?? null,
        posicao: posicaoNoLivro(view.getSectionFractions(), indice, fracaoNoDocumento(range)),
      });
      destaques = comDestaque(destaques, d);
      view.addAnnotation({ value: d.local });
      limparSelecao();
      anuncio = `Destaque ${nomeDaCor(cor).toLowerCase()} criado.`;
      return d;
    } catch (erro) {
      avisar(`Não foi possível criar o destaque: ${erro}`, "erro");
    }
  }

  async function escolherCor(cor: CorDestaque) {
    const existente = barra?.destaque;
    fecharBarra();
    if (!existente) {
      await criarDaSelecao(cor);
      return;
    }
    try {
      const d = await definirCorDestaque(existente.id, cor);
      destaques = comDestaque(destaques, d);
      view?.addAnnotation({ value: d.local });
      anuncio = `Destaque agora ${nomeDaCor(cor).toLowerCase()}.`;
    } catch (erro) {
      avisar(`Não foi possível mudar a cor: ${erro}`, "erro");
    }
  }

  /** Nota: num destaque, edita; numa seleção, cria o destaque (amarelo) e abre a nota. */
  async function pedirNota() {
    const existente = barra?.destaque ?? null;
    fecharBarra();
    notaDe = existente ?? (await criarDaSelecao("amarelo")) ?? null;
  }

  async function salvarNota(nota: string) {
    const d = notaDe;
    notaDe = null;
    if (!d) return;
    try {
      destaques = comDestaque(destaques, await definirNotaDestaque(d.id, nota));
      anuncio = nota.trim() ? "Nota salva." : "Nota apagada.";
    } catch (erro) {
      avisar(`Não foi possível salvar a nota: ${erro}`, "erro");
    }
    view?.renderer.focusView();
  }

  async function copiar() {
    const texto = barra?.destaque?.trecho ?? selecao?.range.toString() ?? "";
    fecharBarra();
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Trecho copiado.");
    } catch (erro) {
      avisar(`Não foi possível copiar: ${erro}`, "erro");
    }
  }

  async function apagar(destaque: Destaque) {
    if (barra) fecharBarra();
    try {
      const apagado = await apagarDestaque(destaque.id);
      destaques = destaques.filter((x) => x.id !== apagado.id);
      // Apagado pela lista, o botão some com o item: o foco volta para a aba.
      await tick();
      if (document.activeElement === document.body) document.getElementById("aba-destaques")?.focus();
      view?.deleteAnnotation({ value: apagado.local });
      avisar("Destaque apagado.", "sucesso", {
        rotulo: "Desfazer",
        executar: () => void restaurar(apagado),
      });
    } catch (erro) {
      avisar(`Não foi possível apagar o destaque: ${erro}`, "erro");
    }
  }

  async function restaurar(destaque: Destaque) {
    try {
      const d = await restaurarDestaque(destaque);
      destaques = comDestaque(destaques, d);
      view?.addAnnotation({ value: d.local });
      avisar("Destaque restaurado.");
    } catch (erro) {
      avisar(`Não foi possível restaurar o destaque: ${erro}`, "erro");
    }
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

  async function exportar() {
    const nome = `${titulo || "Livro"} — destaques.md`.replace(/[/\\]/g, "-");
    const caminho = await escolherDestinoMarkdown(nome);
    if (!caminho) return;
    try {
      const n = await exportarDestaques(livroId, caminho);
      avisar(n === 1 ? "1 destaque exportado." : `${n} destaques exportados.`);
    } catch (erro) {
      avisar(`Não foi possível exportar: ${erro}`, "erro");
    }
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
    if (voz === "parado")
      lista.push({
        id: "voz-ler",
        titulo: "Ler em voz alta",
        grupo: "Voz",
        executar: () => void lerEmVozAlta(),
      });
    else
      lista.push(
        {
          id: "voz-pausar",
          titulo: voz === "pausado" ? "Continuar a leitura em voz alta" : "Pausar a leitura em voz alta",
          grupo: "Voz",
          executar: () => void pausarOuRetomar(),
        },
        {
          id: "voz-parar",
          titulo: "Parar a leitura em voz alta",
          grupo: "Voz",
          executar: () => void pararLeitura(),
        },
      );
    lista.push(
      {
        id: "destacar",
        titulo: "Destacar a seleção",
        grupo: "Destaques",
        teclas: [["Ctrl", "D"]],
        palavras: "marca-texto grifar",
        executar: destacarSelecao,
      },
      {
        id: "mostrar-destaques",
        titulo: "Mostrar os destaques",
        grupo: "Destaques",
        palavras: "notas",
        executar: () => void mostrarDestaques(),
      },
    );
    if (destaques.length)
      lista.push({
        id: "exportar-destaques",
        titulo: "Exportar os destaques…",
        grupo: "Destaques",
        palavras: "markdown notas",
        executar: () => void exportar(),
      });
    for (const d of destaques)
      lista.push({
        id: `destaque-${d.id}`,
        titulo: `Ir para destaque: ${resumo(d.trecho, 60)}`,
        grupo: "Destaques",
        dica: nomeDaCor(d.cor),
        palavras: d.nota ?? "",
        executar: () => void irParaDestaque(d),
      });
    lista.push(
      ...comandosDoIndice(itensIndice, hrefAtual, irParaSecao),
      ...comandosDaPagina(preferencias, atualizarPreferencias),
      ...comandosDoTexto(preferencias, atualizarPreferencias, restaurarPadrao),
    );
    onComandos?.({ comandos: lista });
  });

  function aoTeclar(e: KeyboardEvent) {
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    // Setas dentro de controles (ex.: deslizantes do painel) são do controle, não do livro.
    if (e.target instanceof HTMLInputElement) return;
    if (!view || e.defaultPrevented) return;
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      destacarSelecao();
      return;
    }
    if (e.key === "Escape" && barra) {
      e.preventDefault();
      fecharBarra();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
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
      acao();
    }
  }
</script>

<MolduraLeitor bind:this={moldura} bind:modoFoco {titulo} {anuncio} {progresso} {onFechar}>
  {#snippet indice()}
    <AbasIndice bind:this={abas} bind:aba={abaIndice} quantidade={destaques.length}>
      {#snippet conteudoIndice()}
        {#if itensIndice.length}
          <Indice itens={itensIndice} atual={hrefAtual} onNavegar={irParaSecao} />
        {:else}
          <p>Este livro não tem índice.</p>
        {/if}
      {/snippet}
      {#snippet conteudoDestaques()}
        <ListaDestaques
          {destaques}
          onIr={irParaDestaque}
          onNota={(d) => (notaDe = d)}
          onApagar={apagar}
          onExportar={exportar}
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
    <div class="voz" role="group" aria-label="Leitura em voz alta">
      {#if voz === "parado"}
        <button type="button" onclick={lerEmVozAlta}>
          <Icone nome="voz" /><span class="rotulo">Ler em voz alta</span>
        </button>
      {:else}
        <button type="button" onclick={pausarOuRetomar}>
          <Icone nome={voz === "pausado" ? "continuar" : "pausar"} />
          <span class="rotulo">{voz === "pausado" ? "Continuar leitura" : "Pausar leitura"}</span>
        </button>
        <button type="button" onclick={pararLeitura}>
          <Icone nome="parar" /><span class="rotulo">Parar leitura</span>
        </button>
      {/if}
    </div>
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

  {#if barra}
    <BarraDestaque
      x={barra.x}
      y={barra.y}
      abaixo={barra.abaixo}
      focar={barra.focar}
      corAtual={barra.destaque?.cor ?? null}
      onCor={escolherCor}
      onNota={pedirNota}
      onCopiar={copiar}
      onApagar={barra.destaque ? () => apagar(barra!.destaque!) : undefined}
      onFechar={fecharBarra}
    />
  {/if}
  <EditarNota
    aberto={notaDe !== null}
    trecho={notaDe?.trecho ?? ""}
    valorInicial={notaDe?.nota ?? ""}
    onSalvar={salvarNota}
    onCancelar={() => {
      notaDe = null;
      view?.renderer.focusView();
    }}
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

  /* Controles de voz à esquerda; a navegação continua no centro. */
  .voz {
    display: flex;
    gap: 0.5rem;
    margin-inline-end: auto;
  }
</style>
