<script lang="ts">
  import { onMount } from "svelte";
  import Indice from "./Indice.svelte";
  import Carregando from "./Carregando.svelte";
  import Icone from "./Icone.svelte";
  import MolduraLeitor from "./MolduraLeitor.svelte";
  import PainelLeitura from "./PainelLeitura.svelte";
  import PainelPagina from "./PainelPagina.svelte";
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
  import { sistema, temaEfetivo } from "../lib/ambiente.svelte";
  import { resolverTema } from "../lib/temas";
  import { aguardarTransicao } from "../lib/transicao";
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
    inicio,
    onFechar,
    onProgresso,
    onComandos,
  }: {
    arquivo: File;
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
    v.addEventListener("relocate", (e) => {
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
    itensIndice = v.book.toc ?? [];
    await v.init({ lastLocation: inicio ?? null, showTextStart: !inicio });
    moldura.focarTitulo();
  }

  async function irParaSecao(href: string) {
    if (!view) return;
    await view.goTo(href);
    // Leva o foco ao texto: o leitor de tela continua a leitura dali.
    view.renderer.focusView();
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
    if (!view || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
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
    {#if itensIndice.length}
      <Indice itens={itensIndice} atual={hrefAtual} onNavegar={irParaSecao} />
    {:else}
      <p>Este livro não tem índice.</p>
    {/if}
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
