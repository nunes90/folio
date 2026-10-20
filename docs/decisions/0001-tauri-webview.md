# 0001 — Usar Tauri (núcleo Rust + webview) em vez de toolkit nativo

**Status:** aceita

## Contexto
O app é um leitor de EPUB e PDF com muitas opções de acessibilidade e animações, para Linux e macOS (Windows talvez no futuro). A linguagem principal é Rust.

## Decisão
Usar Tauri 2. A lógica fica em Rust; a interface e a renderização dos livros ficam na webview.

## Motivos
- EPUB é XHTML/CSS, então a webview resolve layout, fontes, RTL, imagens e MathML sem implementação própria.
- Leitores de tela já navegam texto dentro de motores web. Um toolkit que desenha em canvas exigiria expor manualmente todo o conteúdo do livro na árvore de acessibilidade.
- As opções de leitura viram CSS injetado; as animações saem com CSS e Web Animations, respeitando `prefers-reduced-motion`.
- O Foliate (leitor de ebooks popular no Linux) prova que a abordagem funciona: usa foliate-js em WebKitGTK.

## Alternativas consideradas
- **Qt / GTK**: não são Rust de primeira classe; GTK é fraco no macOS.
- **egui / Slint / Iced / Masonry** (via AccessKit): nenhum renderiza HTML/CSS para EPUB.
- **Blitz (Dioxus native)**: motor HTML/CSS em Rust puro, ainda pré-alfa. Reavaliar no futuro.

## Consequências
- No Linux a webview é WebKitGTK, mais lenta e com bugs ocasionais (NVIDIA/Wayland). Testar cedo.
- Cada SO usa um motor web diferente (WebKitGTK, WKWebView, WebView2). Testar nos três.
