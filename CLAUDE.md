# Leitor — leitor de EPUB e PDF

> Nome provisório. Atualize este arquivo ao fim de cada sessão de trabalho.

## Visão
Leitor de ebooks (EPUB e PDF) para **Linux**. **macOS e Windows ficam para o futuro** (ADR 0006).
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
- CI (GitHub Actions): Ubuntu. fmt, clippy, test, `cargo deny`, build/teste do frontend. (macOS adiado, ADR 0006.)

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
- **Não usar a View Transitions API**: o WebKitGTK 2.54 a anuncia (`document.startViewTransition` existe), mas o
  `WebKitWebProcess` aborta (SIGABRT) ao capturar a tela, mesmo numa transição mínima. Transições são feitas à mão.
- foliate-js tem alterações locais marcadas com `LEITOR:` e listadas em `ui/src/vendor/foliate-js/PATCHES.md`.
- Empacotamento: Flatpak (preferido) / AppImage. (`.dmg` quando o macOS voltar.)

## Estado atual
- **M0**: workspace (`leitor-core` + `leitor`), Tauri 2, logging tracing → stderr + arquivo (rotação diária),
  logs do frontend via `tauri-plugin-log`, `deny.toml`, CI (Ubuntu + frontend), hook em `.githooks/`.
- **Frontend**: Svelte 5 + Vite + TS (ADR 0003).
- **M1**: `formato::detectar` (tolerante a EPUBs irregulares) e `livro::abrir`; foliate-js em
  `ui/src/vendor/foliate-js/` (commit 78914ae, sem `pdf.js`: o Vite troca por um stub); `Leitor` e `Indice`;
  escala de texto via CSS (ADR 0004).
- **M2**: `epub::ler` (metadados + capa), `biblioteca` em SQLite (ADR 0005): importar (copia, id = SHA-256),
  listar por atividade recente, progresso. Dados em `~/.local/share/io.github.nunes90.leitor`, capas em
  `~/.cache/io.github.nunes90.leitor/capas`. Para testar sem tocar nos dados reais: `XDG_DATA_HOME`/`XDG_CACHE_HOME`.
- **M3**: `pdf::ler` (lopdf: título/autores do `Info`); PDFs entram na biblioteca e a capa é
  gerada pelo pdf.js no frontend (`definir_capa`, bytes crus com cabeçalhos `livro`/`tipo`). `LeitorPdf` com
  `PDFViewer`, busca, zoom e páginas; progresso `pagina:N`. Detalhes na ADR 0002.
- **M4a**: preferências de leitura (`core::preferencias`, normalizadas no core,
  JSON na tabela `preferencias`, migração 2). Fontes OFL embutidas via Fontsource (Literata, Atkinson Hyperlegible,
  Lexend, OpenDyslexic; `ui/src/lib/fontes.ts`), tamanho × escala do sistema, entrelinha, espaçamentos, largura,
  colunas, alinhamento, hifenização. Painel "Aparência" no leitor de EPUB (prévia ao vivo; Esc fecha e devolve o foco).
- **M4b**: temas claro/escuro/sépia/alto contraste (cores em `ui/src/lib/temas.ts`, fonte
  única para interface e livro; testes de contraste WCAG) e opção "sempre reduzir animações". Padrão: seguir o sistema
  (`prefers-color-scheme`, `prefers-contrast`, `prefers-reduced-motion`; reativo em `lib/ambiente.svelte.ts`).
  Foco visível global (`:focus-visible`). Painel de tema na biblioteca e no leitor de EPUB. Páginas de PDF não mudam de cor.
- **M4c**: F1 abre os atalhos do contexto (`ui/src/lib/atalhos.ts` é a fonte; evitar
  atalhos de uma letra, WCAG 2.1.4); setas/Home/End na grade da biblioteca (roving tabindex); foco gerenciado (título
  ao abrir, livro de volta ao fechar, texto ao escolher capítulo); mudança de capítulo anunciada por `aria-live`;
  teclas do iframe do EPUB reenviadas à janela. Roteiro manual do Orca em `docs/testes/orca.md`.
- **M4d**: leitura em voz alta de EPUB (ADR 0007). `core::voz` (trait `MotorDeVoz`, máquina de
  estados pura + `SpeechDispatcher`) e `core::ssip` (cliente SSIP próprio, sem dependências). Frontend converte o SSML
  do `tts.js` do foliate-js para `<s><mark/>frase</s>` (`ui/src/lib/voz.ts`); destaque da frase lida e passagem
  automática de parágrafo e capítulo. Velocidade nas preferências. Sem speech-dispatcher, a voz fica indisponível.
- **Remover livro**: `Biblioteca::remover` (registro, progresso, cópia e capa; o
  original não é tocado). Delete no livro focado ou botão × na capa; confirmação (`Confirmacao.svelte`, foco em
  Cancelar); foco vai ao livro vizinho.
- **M5a**: `MolduraLeitor.svelte` é a estrutura comum aos leitores de EPUB e PDF (mesmo
  cabeçalho, painéis `PainelLateral` com a mesma animação, Esc, anúncios "Seção: …"). O PDF ganhou Índice (sumário do
  arquivo, `lib/sumario.ts`) e Aparência (tema). Animações: durações e curva em `lib/animacao.ts` (variáveis CSS
  `--duracao-*`/`--curva` e `duracao()` para o Svelte), zeradas com movimento reduzido. Diálogos com `class="modal"`.
  Regra: animações e padrões visuais iguais nos dois formatos.
- **M5b** (branch `feat/m5b-transicoes`): transição biblioteca ↔ leitor feita à mão (FLIP) em `lib/transicao.ts`, no
  estilo do app Livros da Apple: uma cópia da capa (`data-capa-livro`) cresce, só com transform/opacity, até a área do
  livro na moldura (`data-area-livro`) e volta; a tela nova (`data-tela`) esmaece. Os leitores esperam
  `aguardarTransicao()` antes de carregar o livro. Vale igual para EPUB e PDF.
- **Animações no estilo Apple**: a curva de `lib/animacao.ts` é uma mola criticamente amortecida (como a "smooth" do
  SwiftUI), em CSS via `linear()`; só animar transform e opacity; nada pesado durante o movimento.
- Rodar: `cargo tauri dev` (requer `cargo install tauri-cli` e `npm ci` em `ui/`). Build: `cargo tauri build --no-bundle`.
  No dev, a página vem de `http://localhost:5173` e o WebKitGTK não carrega `asset://`: as capas vêm do próprio Vite
  (`/__capas/`, plugin `capasNoDev` em `ui/vite.config.ts`). Na build de produção, `asset://` normal.
- Pendências: regerar capas se o cache for limpo;
  progresso gravado com debounce de 1 s (fechar a janela nesse intervalo perde a última página);
  origem dos logs do frontend aponta para o wrapper.
- Roteiro do Orca executado (out/2026): navegação funcional. A voz do sistema (espeak-ng) é muito robótica:
  afeta o Orca e a leitura em voz alta. Alternativas (Piper no speech-dispatcher, voz neural local) em aberto.
- Próximo passo: **M5** (animações e polimento). Pendências do M4d: leitura em voz alta de PDF; conferir à mão o
  destaque da frase lida.
