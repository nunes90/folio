<script lang="ts">
  import { onMount } from "svelte";
  import Indice from "./Indice.svelte";
  import PainelLeitura from "./PainelLeitura.svelte";
  import PainelTema from "./PainelTema.svelte";
  import {
    criarView,
    textoLocalizado,
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
  import { movimentoReduzido, sistema, temaEfetivo } from "../lib/ambiente.svelte";
  import { resolverTema } from "../lib/temas";
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
    inicio,
    onFechar,
    onProgresso,
  }: {
    arquivo: File;
    /** Onde retomar a leitura (EPUB CFI salvo na biblioteca). */
    inicio?: string;
    onFechar: () => void;
    onProgresso?: (localizacao: string, fracao: number) => void;
  } = $props();

  let palco: HTMLDivElement;
  let view: FoliateView | undefined;

  let titulo = $state("");
  let indice = $state<ItemIndice[]>([]);
  let hrefAtual = $state<string>();
  let tituloEl: HTMLHeadingElement;
  /** Texto da região aria-live: anuncia a mudança de capítulo (não cada página). */
  let anuncio = $state("");
  let capituloAnunciado: string | undefined;
  let progresso = $state(0);
  let indiceAberto = $state(true);
  let aparenciaAberta = $state(false);
  let botaoAparencia: HTMLButtonElement;
  let erro = $state<string | null>(null);
  let pronto = $state(false);

  // Leitura em voz alta: um bloco (parágrafo) por vez; ao terminar, o próximo.
  let voz = $state<"parado" | "falando" | "pausado">("parado");
  let vozPossivel = $state(false);
  let idiomaDoLivro: string | null = null;

  // Reaplica sempre que a escala do sistema ou as preferências mudarem (inclusive com o
  // painel aberto: o livro funciona como prévia ao vivo).
  $effect(() => {
    const css = cssDoLivro(preferencias, escala.fator, temaEfetivo());
    const animado = !movimentoReduzido();
    const largura = `${preferencias.larguraMaxima}px`;
    const colunas = String(preferencias.colunas);
    if (!pronto || !view) return;
    view.renderer.setStyles(css);
    view.renderer.setAttribute("max-inline-size", largura);
    view.renderer.setAttribute("max-column-count", colunas);
    view.renderer.toggleAttribute("animated", animado);
  });

  function fecharAparencia() {
    aparenciaAberta = false;
    // O foco estava dentro do painel, que some: devolve ao botão que o abriu.
    botaoAparencia.focus();
  }

  const porcento = new Intl.NumberFormat("pt-BR", { style: "percent" });

  onMount(() => {
    window.addEventListener("keydown", aoTeclar);
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
      // Fechar o livro encerra a leitura em voz alta.
      if (voz !== "parado") pararVoz().catch(() => {});
      pararDeOuvir?.();
      view?.close();
      view?.remove();
    };
  });

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
    const v = await criarView();
    v.addEventListener("relocate", (e) => {
      const { fraction, tocItem, cfi } = (e as CustomEvent<DetalheRelocate>).detail;
      progresso = fraction;
      hrefAtual = tocItem?.href;
      if (cfi) onProgresso?.(cfi, fraction);
      const capitulo = tocItem?.label.trim();
      // O primeiro posicionamento não é anunciado: o foco no título já informa o livro.
      if (capitulo && capitulo !== capituloAnunciado) {
        if (capituloAnunciado !== undefined) anuncio = `Capítulo: ${capitulo}`;
        capituloAnunciado = capitulo;
      }
    });
    // Cada capítulo é um iframe: teclas pressionadas lá dentro não chegam à janela. Uma cópia
    // é reenviada à janela, onde ficam todos os atalhos (inclusive o F1 do App).
    v.addEventListener("load", (e) => {
      const doc = (e as CustomEvent<{ doc: Document }>).detail.doc;
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
    indice = v.book.toc ?? [];
    await v.init({ lastLocation: inicio ?? null, showTextStart: !inicio });
    // Foco no título: o leitor de tela anuncia qual livro foi aberto.
    tituloEl.focus();
  }

  async function irParaCapitulo(href: string) {
    if (!view) return;
    await view.goTo(href);
    // Leva o foco ao texto: o leitor de tela continua a leitura dali.
    view.renderer.focusView();
  }

  function aoTeclar(e: KeyboardEvent) {
    // Com um diálogo aberto (ex.: atalhos), as teclas são dele.
    if (e.target instanceof Element && e.target.closest("dialog")) return;
    if (e.key === "Escape" && aparenciaAberta) {
      e.preventDefault();
      fecharAparencia();
      return;
    }
    // Setas dentro de controles (ex.: deslizantes do painel) são do controle, não do livro.
    if (e.target instanceof HTMLInputElement) return;
    if (!view || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // Setas seguem a direção visual (livros RTL invertem); PageUp/PageDown seguem a ordem de leitura.
    const acoes: Record<string, () => Promise<void>> = {
      ArrowLeft: () => view!.goLeft(),
      ArrowRight: () => view!.goRight(),
      PageUp: () => view!.prev(),
      PageDown: () => view!.next(),
    };
    const acao = acoes[e.key];
    if (acao) {
      e.preventDefault();
      acao();
    }
  }
</script>

<div class="leitor">
  <header>
    <button
      type="button"
      aria-expanded={indiceAberto}
      aria-controls="indice"
      onclick={() => (indiceAberto = !indiceAberto)}
    >
      Índice
    </button>
    <h1 tabindex="-1" bind:this={tituloEl}>{titulo}</h1>
    <button
      type="button"
      bind:this={botaoAparencia}
      aria-expanded={aparenciaAberta}
      aria-controls="aparencia"
      onclick={() => (aparenciaAberta ? fecharAparencia() : (aparenciaAberta = true))}
    >
      Aparência
    </button>
    <button type="button" onclick={onFechar}>Voltar à biblioteca</button>
  </header>

  <nav id="indice" aria-label="Índice" hidden={!indiceAberto}>
    <Indice itens={indice} atual={hrefAtual} onNavegar={irParaCapitulo} />
  </nav>

  <div class="palco" bind:this={palco}>
    {#if erro}
      <p role="alert">{erro}</p>
    {/if}
  </div>

  <aside id="aparencia" aria-label="Aparência" hidden={!aparenciaAberta}>
    <PainelTema
      {preferencias}
      onMudar={atualizarPreferencias}
      temaDoSistema={resolverTema("sistema", sistema)}
    />
    <PainelLeitura
      {preferencias}
      onMudar={atualizarPreferencias}
      onRestaurar={restaurarPadrao}
    />
  </aside>

  <footer>
    <div class="voz" role="group" aria-label="Leitura em voz alta">
      {#if voz === "parado"}
        <button type="button" onclick={lerEmVozAlta}>Ler em voz alta</button>
      {:else}
        <button type="button" onclick={pausarOuRetomar}>
          {voz === "pausado" ? "Continuar leitura" : "Pausar leitura"}
        </button>
        <button type="button" onclick={pararLeitura}>Parar leitura</button>
      {/if}
    </div>
    <button type="button" onclick={() => view?.prev()}>Anterior</button>
    <span>{porcento.format(progresso)}</span>
    <button type="button" onclick={() => view?.next()}>Próxima</button>
  </footer>

  <p class="so-leitor-de-tela" aria-live="polite">{anuncio}</p>
</div>

<style>
  .leitor {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "topo topo topo"
      "indice palco aparencia"
      "rodape rodape rodape";
    height: 100vh;
  }

  header {
    grid-area: topo;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    border-block-end: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }

  h1 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  nav {
    grid-area: indice;
    width: 18rem;
    overflow-y: auto;
    padding: 0.5rem;
    border-inline-end: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }

  aside {
    grid-area: aparencia;
    width: 20rem;
    overflow-y: auto;
    padding: 0.75rem;
    border-inline-start: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }

  aside[hidden],
  nav[hidden] {
    display: none;
  }

  .palco {
    grid-area: palco;
    /* Itens de grid têm min-width: auto e cresceriam até caber as colunas do livro;
       aí o paginador mede uma largura maior que a visível e as páginas saem cortadas. */
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .palco :global(foliate-view) {
    display: block;
    width: 100%;
    height: 100%;
  }

  footer {
    grid-area: rodape;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1.5rem;
    padding: 0.5rem 1rem;
    border-block-start: 1px solid color-mix(in srgb, currentColor 15%, transparent);
  }

  /* Controles de voz à esquerda; a navegação continua no centro. */
  .voz {
    display: flex;
    gap: 0.5rem;
    margin-inline-end: auto;
  }
</style>
