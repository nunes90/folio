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
