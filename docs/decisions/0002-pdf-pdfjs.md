# 0002 — PDF com pdf.js primeiro

**Status:** aceita

## Decisão
Renderizar PDFs com pdf.js na webview. Se a performance com arquivos grandes incomodar, migrar para pdfium-render no Rust.

## Motivos
- pdf.js já entrega camada de texto (seleção, busca e leitor de tela), zoom e busca.
- pdfium-render é robusto e rápido, mas a acessibilidade do texto ficaria por nossa conta e há dependência binária em C++.
- hayro (Rust puro) é promissor, mas experimental: ainda não abre PDFs criptografados e só renderiza na CPU, sem otimização. Acompanhar.

## Restrição
Nenhuma dependência AGPL (ex.: MuPDF), verificado via `cargo deny`.

## Implementação (M3)
- `pdfjs-dist` (npm) com o `PDFViewer` de `pdf_viewer.mjs`: camada de texto, zoom próprio (`increaseScale`/`currentScaleValue`, nunca o zoom da webview — ADR 0004) e `PDFFindController` para a busca.
- `pdf_viewer.mjs` lê `globalThis.pdfjsLib`; por isso é importado dinamicamente depois de `ui/src/lib/pdf.ts` defini-lo.
- WASM, CMaps, fontes padrão e perfis de cor são copiados de `node_modules` para `ui/public/pdfjs` por `ui/scripts/copiar-pdfjs.mjs` (scripts `predev`/`prebuild`).
- CSP: `script-src 'wasm-unsafe-eval'`, `worker-src 'self' blob:` e `connect-src 'self'`.
- Metadados (título, autores) lidos no Rust com `lopdf`; a capa é a primeira página renderizada pelo pdf.js e devolvida ao core.
