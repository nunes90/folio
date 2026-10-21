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
  const documento = await tarefa.promise;
  try {
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
