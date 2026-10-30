// Configuração do pdf.js e geração de capa (primeira página) para a biblioteca.
import * as pdfjs from "pdfjs-dist";
import urlDoWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// O parsing roda num Web Worker, fora da thread da interface.
pdfjs.GlobalWorkerOptions.workerSrc = urlDoWorker;

// pdf_viewer.mjs não importa o pdf.js: lê `globalThis.pdfjsLib` assim que é carregado.
(globalThis as { pdfjsLib?: typeof pdfjs }).pdfjsLib = pdfjs;

/** Componentes do visor (PDFViewer, busca, links). Import dinâmico: precisa vir depois da linha acima. */
export function carregarVisor() {
  return import("pdfjs-dist/web/pdf_viewer.mjs");
}

/** Estado "terminada" de uma página no pdf.js (RenderingStates.FINISHED). */
const RENDERIZADA = 3;
/** Limite de espera pela renderização: depois disso, anima assim mesmo. */
const ESPERA_MAXIMA_MS = 400;

/** O mínimo do PDFViewer de que a espera precisa. */
interface VisorComEventos {
  getPageView(i: number): { renderingState: number } | undefined;
  eventBus: {
    on(nome: string, f: (e: { pageNumber: number }) => void): void;
    off(nome: string, f: (e: { pageNumber: number }) => void): void;
  };
}

/**
 * Espera o pdf.js desenhar a página `n` (para a virada só animar com ela pronta), até 400 ms.
 * Igual nos dois lados (M25c).
 */
export function paginaRenderizada(v: VisorComEventos, n: number): Promise<void> {
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

/**
 * A camada de texto da página (o `.page` que `pagina()` devolve), esperando o pdf.js terminar de
 * montá-la (até 1,5 s). Igual nos dois lados (M25c).
 */
export async function camadaDeTexto(
  v: VisorComEventos | undefined,
  pagina: () => Element | null,
  n: number,
): Promise<Element | null> {
  const pronta = () => pagina()?.querySelector(".textLayer:has(span)") ?? null;
  if (pronta() || !v) return pronta();
  await new Promise<void>((resolver) => {
    const aoMontar = ({ pageNumber }: { pageNumber: number }) => {
      if (pageNumber === n) terminar();
    };
    const limite = setTimeout(terminar, 1500);
    function terminar() {
      clearTimeout(limite);
      v!.eventBus.off("textlayerrendered", aoMontar);
      resolver();
    }
    v.eventBus.on("textlayerrendered", aoMontar);
  });
  return pronta();
}

/** Recursos copiados para public/pdfjs por scripts/copiar-pdfjs.mjs. */
const RECURSOS = `${import.meta.env.BASE_URL}pdfjs/`;

export function carregarPdf(dados: ArrayBuffer): pdfjs.PDFDocumentLoadingTask {
  return pdfjs.getDocument({
    data: new Uint8Array(dados),
    wasmUrl: `${RECURSOS}wasm/`,
    cMapUrl: `${RECURSOS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${RECURSOS}standard_fonts/`,
    iccUrl: `${RECURSOS}iccs/`,
  });
}

/** Largura da capa em pixels; a biblioteca mostra capas com cerca de 10rem. */
const LARGURA_CAPA = 400;

/** Renderiza a primeira página como JPEG, para usar de capa. */
export async function gerarCapa(dados: ArrayBuffer): Promise<Blob> {
  const tarefa = carregarPdf(dados);
  try {
    // Dentro do try: um PDF que não abre (com senha, danificado) também libera a tarefa.
    const documento = await tarefa.promise;
    const pagina = await documento.getPage(1);
    const viewport = pagina.getViewport({ scale: LARGURA_CAPA / pagina.getViewport({ scale: 1 }).width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await pagina.render({ canvas, viewport }).promise;
    return await new Promise((resolver, rejeitar) =>
      canvas.toBlob(
        (blob) => (blob ? resolver(blob) : rejeitar(new Error("falha ao codificar a capa"))),
        "image/jpeg",
        0.85,
      ),
    );
  } finally {
    // Libera o worker e a memória do documento.
    await tarefa.destroy();
  }
}
