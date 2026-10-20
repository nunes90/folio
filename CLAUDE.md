# Leitor — leitor de EPUB e PDF

> Nome provisório. Atualize este arquivo ao fim de cada sessão de trabalho.

## Visão
Leitor de ebooks (EPUB e PDF) para **Linux e macOS**, com **Windows possível no futuro**.
Prioridades: **acessibilidade ampla** e **animações fluidas**. Linguagem principal: **Rust**.

## Sobre o desenvolvedor
- Lucas está estudando Rust (The Rust Programming Language, 3ª ed.). O projeto também é aprendizado.
- Modos de trabalho, escolhidos por tarefa:
  - **Lucas escreve, Claude revisa**: núcleo em Rust (parsing, biblioteca, modelo de dados). Explique o porquê das sugestões; não reescreva tudo.
  - **Claude escreve, Lucas revisa**: boilerplate e configuração (Tauri, CI, empacotamento, partes do frontend).
  - **Pareamento**: Claude explica o design, Lucas implementa.
- Responder em português.
- Ambiente principal: Linux com compositores Wayland tiling (Hyprland / MangoWM). Testar lá cedo.

## Stack (ver docs/decisions/)
- **Tauri 2**: núcleo em Rust, interface em webview.
- **EPUB**: foliate-js (MIT) na webview. EPUB é HTML/CSS, então a webview resolve o layout e o leitor de tela.
- **PDF**: pdf.js para começar (camada de texto acessível); pdfium-render no Rust se a performance exigir.
- **Proibido**: dependências AGPL (ex.: MuPDF). Isso é verificado por `cargo deny`.
- **Frontend**: Svelte 5 + Vite + TypeScript, sem SvelteKit (ADR 0003). Testes: Vitest + Testing Library + axe-core.

## Arquitetura
```
crates/core/   # lógica pura, SEM dependência de Tauri. Toda lógica testável vive aqui.
crates/app/    # Tauri: comandos finos (3–5 linhas) que só chamam o core.
ui/            # frontend Svelte + foliate-js + pdf.js
tests/fixtures/  # EPUBs/PDFs de teste (domínio público + casos quebrados)
docs/decisions/  # ADRs
```

## Convenções
- Erros: `thiserror` no core (erros tipados), `anyhow` no app.
- Logs: `tracing` + `tracing-subscriber` (`RUST_LOG=leitor=debug`), `tracing-appender` com rotação.
  Diretório de logs via crate `directories`: Linux `~/.local/state/leitor/logs`, macOS `~/Library/Logs/leitor`.
  `tauri-plugin-log` encaminha os logs do frontend para o mesmo arquivo. Usar `#[instrument]` nas operações principais.
- Testes: unitários + integração com fixtures (`crates/core/tests/`), `insta` (snapshots),
  `proptest` (parsers não podem dar panic), Vitest (frontend), `axe-core` (a11y),
  `tauri-driver` para E2E (Linux/Windows; no macOS os testes são manuais), `criterion` mais tarde.
- Git: uma branch por funcionalidade, PRs pequenos, Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`).
- Antes de commitar: `cargo fmt`, `cargo clippy -- -D warnings`, `cargo test`.
- CI (GitHub Actions): Ubuntu + macOS. fmt, clippy, test, `cargo deny`, build/teste do frontend.

## Fluxo de uma sessão
1. Ler este arquivo e o ROADMAP.md.
2. Combinar o objetivo e um plano curto.
3. Escrever o teste primeiro, depois o código.
4. Rodar fmt, clippy e os testes.
5. Commit e atualização da seção "Estado atual" abaixo e do ROADMAP.md.

## Linux: cuidados (Wayland)
- Diálogos de arquivo, atalhos globais e screenshots passam por xdg-desktop-portal.
- O app não controla a posição da janela; o compositor decide.
- Testar com decorações client-side (GNOME) e server-side (KDE/wlroots).
- WebKitGTK é o ponto fraco do Tauri no Linux. Ficar atento a NVIDIA/Wayland.
  Com driver NVIDIA, o renderizador DMABUF derruba a janela ("Error 71 (Protocol error)");
  o app define `WEBKIT_DISABLE_DMABUF_RENDERER=1` sozinho (ver `crates/app/src/main.rs`).
- **Nunca usar zoom da webview**: no WebKitGTK ele é aplicado duas vezes em iframes e quebra o foliate-js.
  A escala de texto do sistema é anulada no zoom e reaplicada via CSS (ADR 0004). Interface em `rem`.
- Empacotamento: Flatpak (preferido) / AppImage; `.dmg` no macOS.

## Estado atual
- **M0**: workspace (`leitor-core` + `leitor`), Tauri 2, logging tracing → stderr + arquivo (rotação diária),
  logs do frontend via `tauri-plugin-log`, `deny.toml`, CI (Ubuntu + macOS + frontend), hook em `.githooks/`.
- **Frontend**: Svelte 5 + Vite + TS (ADR 0003).
- **M1** (branch `feat/m1-abrir-epub`): `formato::detectar` e `livro::abrir` no core (proptest + fixtures em
  `tests/fixtures/`); diálogo via `tauri-plugin-dialog`; `leitor caminho.epub` abre direto; foliate-js copiado em
  `ui/src/vendor/foliate-js/` (commit 78914ae, sem `pdf.js`: o Vite troca por um stub); componentes `Leitor` e
  `Indice`; escala de texto via CSS (ADR 0004).
- Rodar: `cargo tauri dev` (requer `cargo install tauri-cli` e `npm ci` em `ui/`). Build: `cargo tauri build --no-bundle`.
- Pendências: janela não testada no macOS; detecção de EPUB é estrita (`mimetype` precisa ser o 1º arquivo, sem
  compressão), relaxar no M2; `abrir_livro` aceita qualquer caminho; origem dos logs do frontend aponta para o wrapper.
- Próximo passo: **M2** (biblioteca).
