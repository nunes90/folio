<script lang="ts">
  // O lado novo do EPUB (M25b): outro ponto do mesmo livro, ao lado do principal, para comparar.
  // Uma segunda <foliate-view> com o mesmo arquivo, a mesma aparência e os mesmos destaques
  // (o ControleDestaques é o do leitor: um destaque criado num lado aparece nos dois). Lê e
  // destaca; voz, meta, sessão e progresso ficam só com o lado principal. As setas viram as
  // páginas daqui quando o foco está aqui; F6 alterna entre os lados (no Leitor). Sem barra
  // própria: os controles ficam no rodapé (ControlesLado), e as duas áreas têm a mesma altura.
  import { onMount } from "svelte";
  import type { ControleDestaques } from "../lib/controleDestaques.svelte";
  import type { MudancaDeTrecho } from "../lib/controleDestaques.svelte";
  import { aplicarMarcaTexto, hexDaCor, posicaoNoIframe, resumo, selecaoNoEpub } from "../lib/destaques";
  import { frasesDoDocumento, indiceDaFraseEm, trechoSeguinte, unir } from "../lib/frases";
  import {
    criarView,
    desenhoMarcaTexto,
    type DetalheRelocate,
    type Desenho,
    type FoliateView,
  } from "../lib/foliate";
  import { duracao } from "../lib/animacao";
  import { preferencias } from "../lib/preferencias.svelte";
  import { animarVirada, cancelarVirada, quadrosDaVirada } from "../lib/virada";
  import Carregando from "./Carregando.svelte";
  import type { Destaque } from "../lib/biblioteca";

  let {
    arquivo,
    alvo,
    css,
    largura,
    escura,
    destaques,
    secao = $bindable(""),
    progresso = $bindable(0),
    onPronto,
  }: {
    arquivo: Blob;
    /** Onde abrir: um href do índice ou um CFI. */
    alvo: string;
    /** O CSS do livro (`cssDoLivro`) e a largura da coluna, os mesmos do lado principal. */
    css: string;
    largura: string;
    /** Página escura: o marca-texto se mistura em `screen`. */
    escura: boolean;
    destaques: ControleDestaques;
    /** A seção e a fração do livro deste lado (para os controles no rodapé, ControlesLado). */
    secao?: string;
    progresso?: number;
    /** O lado terminou de abrir em `alvo` (o principal pode ir ao mesmo ponto). */
    onPronto?: () => void;
  } = $props();

  let palco: HTMLDivElement;
  let view = $state<FoliateView>();
  let pronto = $state(false);
  let anuncio = $state("");
  let marcaTexto: Desenho | undefined;

  $effect(() => {
    const estilo = css;
    const coluna = largura;
    if (!pronto || !view) return;
    view.renderer.setStyles(estilo);
    view.renderer.setAttribute("max-inline-size", coluna);
    // Meia janela: uma coluna só.
    view.renderer.setAttribute("max-column-count", "1");
  });

  $effect(() => {
    if (pronto && view) aplicarMarcaTexto(view, escura);
  });

  /** Leva o lado até `alvo` (seção ou CFI) e o foco ao texto dele. */
  export async function ir(destino: string) {
    if (!view) return;
    await view.goTo(destino);
    view.renderer.focusView();
  }

  export function focar() {
    view?.renderer.focusView();
  }

  let aoRelocar: (() => void) | null = null;

  /** Avisa a cada mudança de página deste lado (null para de avisar). */
  export function aoMudar(f: (() => void) | null) {
    aoRelocar = f;
  }

  /** O elemento está dentro deste lado? (F6 e o foco da barra de destaque.) */
  export function contem(el: Element | null): boolean {
    return !!el && palco?.parentElement?.contains(el) === true;
  }

  export function desenhar(d: Destaque) {
    void view?.addAnnotation({ value: d.local });
  }

  export function apagarDesenho(d: Destaque) {
    void view?.deleteAnnotation({ value: d.local });
  }

  /** Há texto selecionado neste lado? (A barra de destaque devolve o foco para cá.) */
  export function temSelecao(): boolean {
    return (view?.renderer.getContents() ?? []).some(({ doc }) => {
      const sel = doc.getSelection();
      return !!sel && !sel.isCollapsed;
    });
  }

  export function limparSelecao() {
    for (const { doc } of view?.renderer.getContents() ?? []) doc.getSelection()?.removeAllRanges();
  }

  /** Há texto selecionado neste lado? Abre a barra de destaque sobre ele. */
  function verSelecao(doc: Document, indice: number, focar: boolean): boolean {
    const sel = doc.getSelection();
    if (!view || !sel || sel.isCollapsed || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const selecao = selecaoNoEpub(view, indice, range);
    if (!selecao) return false;
    destaques.mostrarSelecao(selecao, posicaoNoIframe(range), focar, true);
    return true;
  }

  // Modo frase, como no principal: Ctrl+D sem seleção seleciona a frase atual (a primeira da
  // página) e abre a barra; Alt+↑/↓ trocam de frase e Alt+Shift+↑/↓ mudam o tamanho do trecho
  // (a barra os manda para cá: `temModoFrase`). Para destacar deste lado sem o mouse.
  let modoFrase: { doc: Document; indice: number; frases: Range[]; de: number; ate: number } | null =
    null;
  const frasesPorCapitulo = new WeakMap<Document, Range[]>();

  export function temModoFrase(): boolean {
    return modoFrase !== null;
  }

  /** A barra fechou: a seleção do modo frase era só a prévia. */
  export function sairDoModoFrase() {
    modoFrase?.doc.getSelection()?.removeAllRanges();
    modoFrase = null;
  }

  async function iniciarModoFrase() {
    const inicio = view?.lastLocation?.range;
    const doc = inicio?.startContainer.ownerDocument;
    const indice = view?.renderer.getContents().find((c) => c.doc === doc)?.index;
    if (!inicio || !doc || indice === undefined) return;
    const idioma = view?.book.metadata?.language;
    const frases =
      frasesPorCapitulo.get(doc) ??
      frasesDoDocumento(doc, (Array.isArray(idioma) ? idioma[0] : idioma) ?? null);
    frasesPorCapitulo.set(doc, frases);
    if (!frases.length) {
      anuncio = "Não há texto nesta página para destacar.";
      return;
    }
    const i = indiceDaFraseEm(frases, inicio);
    modoFrase = { doc, indice, frases, de: i, ate: i };
    await mostrarFrases();
  }

  /** Seleciona o trecho do modo frase, vira a página até ele e abre a barra (com o foco). */
  async function mostrarFrases() {
    if (!view || !modoFrase) return;
    const { doc, indice, frases, de, ate } = modoFrase;
    const trecho = unir(frases, de, ate);
    await view.renderer.scrollToAnchor(trecho, true);
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(trecho);
    await new Promise(requestAnimationFrame);
    if (!modoFrase) return;
    verSelecao(doc, indice, true);
    anuncio = `Frase: ${resumo(trecho.toString(), 300)}`;
  }

  /** Alt+↑/↓ (outra frase) e Alt+Shift+↑/↓ (trecho menor ou maior), dentro do capítulo. */
  export function mudarTrecho(mudanca: MudancaDeTrecho) {
    if (!modoFrase) return;
    const novo = trechoSeguinte(modoFrase.frases.length, modoFrase.de, modoFrase.ate, mudanca);
    if (!novo) {
      anuncio =
        mudanca === "anterior" ? "Início do capítulo." : mudanca === "encolher" ? "Só uma frase." : "Fim do capítulo.";
      return;
    }
    modoFrase = { ...modoFrase, de: novo[0], ate: novo[1] };
    void mostrarFrases();
  }

  /**
   * Vira a página deste lado com a virada das preferências, como a moldura faz no principal:
   * o livro fica invisível até a página nova estar pronta e só então anima.
   */
  export async function virar(sentido: "esquerda" | "direita") {
    destaques.esconder();
    cancelarVirada();
    const animar = duracao("curta") > 0 && quadrosDaVirada(preferencias.virada, sentido) !== null;
    if (animar) palco.style.opacity = "0";
    try {
      await (sentido === "esquerda" ? view?.goLeft() : view?.goRight());
    } finally {
      if (animar) palco.style.opacity = "";
    }
    animarVirada(palco, preferencias.virada, sentido);
  }

  /** Teclas do lado: as setas viram as páginas daqui; Ctrl+D destaca a seleção daqui. */
  function tratarTecla(e: KeyboardEvent, doc?: Document, indice?: number): boolean {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
      const comSelecao =
        doc && indice !== undefined
          ? verSelecao(doc, indice, true)
          : (view?.renderer.getContents() ?? []).some((c) => verSelecao(c.doc, c.index, true));
      if (!comSelecao) void iniciarModoFrase();
      return true;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
    const rtl = view?.book.dir === "rtl";
    const acoes: Record<string, () => void> = {
      ArrowLeft: () => void virar("esquerda"),
      ArrowRight: () => void virar("direita"),
      PageUp: () => void virar(rtl ? "direita" : "esquerda"),
      PageDown: () => void virar(rtl ? "esquerda" : "direita"),
    };
    const acao = acoes[e.key];
    if (!acao) return false;
    acao();
    return true;
  }

  /** Teclas com o foco no próprio lado (fora do texto do capítulo, que tem as suas). */
  function aoTeclar(e: KeyboardEvent) {
    if (tratarTecla(e)) e.preventDefault();
  }

  onMount(() => {
    let fechado = false;
    void (async () => {
      const v = await criarView();
      marcaTexto = await desenhoMarcaTexto();
      if (fechado) return;
      v.addEventListener("create-overlay", () => {
        for (const d of destaques.lista) v.addAnnotation({ value: d.local });
      });
      v.addEventListener("draw-annotation", (e) => {
        const { draw, annotation } = (e as CustomEvent<{
          draw: (desenho: Desenho, opcoes: { color: string }) => void;
          annotation: { value: string };
        }>).detail;
        const d = destaques.porLocal(annotation.value);
        if (marcaTexto) draw(marcaTexto, { color: hexDaCor(d?.cor ?? "amarelo") });
      });
      v.addEventListener("show-annotation", (e) => {
        const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail;
        const d = destaques.porLocal(value);
        if (d) destaques.mostrarDestaque(d, posicaoNoIframe(range), true);
      });
      v.addEventListener("relocate", (e) => {
        // No modo frase, a página vira para acompanhar a frase: a barra vai junto.
        if (!modoFrase) destaques.esconderDe(true);
        const { fraction, tocItem } = (e as CustomEvent<DetalheRelocate>).detail;
        aoRelocar?.();
        progresso = fraction;
        const nova = tocItem?.label.trim() ?? "";
        if (nova && nova !== secao && secao) anuncio = `Lado: ${nova}`;
        secao = nova;
      });
      // Como no principal, as teclas de dentro do capítulo (um iframe) não chegam à janela: as
      // do lado são tratadas aqui; as outras (Esc, F1, F6, Ctrl+K…) seguem para a janela.
      v.addEventListener("load", (e) => {
        const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
        doc.addEventListener("pointerup", () => setTimeout(() => verSelecao(doc, index, false)));
        doc.addEventListener("pointerdown", () => destaques.esconder());
        doc.addEventListener("keydown", (original) => {
          if (tratarTecla(original, doc, index)) {
            original.preventDefault();
            return;
          }
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
      if (fechado) return;
      v.renderer.setAttribute("flow", "paginated");
      pronto = true;
      await v.init({ lastLocation: alvo });
      // Fechado durante o carregamento: o capítulo novo não deve receber mais nada.
      if (fechado) return;
      v.renderer.focusView();
      onPronto?.();
    })();
    return () => {
      fechado = true;
      view?.close();
      view?.remove();
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="lado" aria-label="Ao lado: {secao || 'outro ponto do livro'}" onkeydown={aoTeclar}>
  <div class="palco" bind:this={palco}>
    {#if !pronto}<Carregando texto="Abrindo ao lado…" />{/if}
  </div>
  <p class="so-leitor-de-tela" aria-live="polite">{anuncio}</p>
</section>

<style>
  .lado {
    position: relative;
    display: grid;
    grid-template-rows: 1fr;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: clip;
  }

  /* A linha entre os dois lados, por cima: uma borda tiraria 1 px da largura do lado, e com
     larguras diferentes os dois paginam diferente (as quebras de página saem desalinhadas). */
  .lado::before {
    content: "";
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    z-index: 1;
    width: 1px;
    background: var(--divisoria);
    pointer-events: none;
  }

  .palco {
    position: relative;
    min-height: 0;
    overflow: clip;
  }

  .palco :global(foliate-view) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
