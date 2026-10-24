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
- **M5c** (branch `feat/m5c-virada`): virada de página igual para EPUB e PDF, via `MolduraLeitor.virarPagina(sentido,
  navegar)` e `lib/virada.ts`. Estilos nas preferências (`virada`): esmaecer (padrão), deslizar (3%), virar a folha
  (giro 3D a partir da lombada), nenhuma; 160 ms. A virada se repete centenas de vezes: o padrão deve ser quase
  imperceptível (deslizar 8%/280 ms foi achado "muito motion"). A curvatura real da folha é inviável (a página do EPUB vive num iframe). A área fica
  invisível até `navegar` terminar (no PDF, até o pdf.js desenhar a página, limite de 400 ms) e só então anima. O
  `animated` do foliate saiu. PDF: `modoPdf` página a página (padrão) ou rolagem contínua (sem virada). Medido no
  release: EPUB ~60 qps em todos; PDF esmaecer ~60, deslizar/virar ~30–40 (compor uma página grande transformada no
  WebKitGTK custa caro; esconder a camada de texto quase não ajuda).
- **M5d** (branch `feat/m5d-estreitas`): janela estreita (`sistema.estreita`, `max-width: 56rem` em
  `lib/ambiente.svelte.ts`): na moldura, os painéis cobrem o livro (mesma célula do grid, véu por trás; o livro não é
  repaginado), um por vez, o índice começa fechado, o foco vai ao painel e Esc/véu fecham e devolvem o foco.
  Botões da barra com ícone (`Icone.svelte`) + `<span class="rotulo">`: na janela estreita, só o ícone aparece e o
  rótulo segue como nome acessível (regra `.estreita .rotulo` no `app.css`).
  `Carregando.svelte`: aviso discreto (`role="status"`) que só aparece após 400 ms, nos dois leitores.
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
- **v0.1.0** (out/2026): tag assinada `v0.1.0` (M0–M5) e Release no GitHub como pre-release.
- **Redesign**: análise do design system proposto em `docs/design/redesign.md` (o que entra, o que não entra e
  por quê; tokens adaptados com contraste conferido). Regras para qualquer componente novo: contraste WCAG, `rem`,
  animações de `lib/animacao.ts`, nada só no hover, foco visível, ícones SVG, cores só em `lib/temas.ts`.
- **M7a** (branch `feat/m7a-tokens`): tokens de superfície em `Cores` (`app`, `painel`, `card`, `hover`, `divisoria`,
  `destaque`, `sobreDestaque`, `destaqueSuave`, `sombra`), publicados por `aplicarTema` como `--app`, `--painel`,
  `--sobre-destaque` etc.; `fundo` continua sendo a página do livro. Contraste de cada combinação testado nos 4 temas.
  Raios `--raio-*` no `app.css`. Ainda sem uso visual: entram no M7b/M7c.
- **M7b** (branch `feat/m7b-leitor`): moldura dos leitores sobre `--app`, barras e painéis em `--painel` com
  `--divisoria`; botões das barras sem borda (fundo `--hover` sob o ponteiro; borda no alto contraste); cabeçalho em grid
  `minmax(min-content, 1fr) auto minmax(min-content, 1fr)` (título centralizado quando cabe); barra de progresso
  decorativa (`progresso` da moldura, `scaleX`); `.grupo-barra` no `app.css` para grupos compactos ("‹ 12% ›", página e
  zoom do PDF); índice com item atual em `--destaque-suave` + barra lateral; `PainelLateral` com cabeçalho (título e
  botão "Fechar …" que devolve o foco).
- **M7c** (branch `feat/m7c-biblioteca`): biblioteca sobre `--app`; "Importar livros…" como botão primário
  (`--destaque`/`--sobre-destaque`) e Aparência sem borda, ambos com ícone; cards com capa em `--sombra`, barra de
  progresso decorativa na capa (`.progresso-capa`, cor de destaque, só se a leitura começou), selo EPUB/PDF e
  situação ("37% lido", "Concluído" quando arredonda para 100%); estado vazio com ícone, título e o único botão de
  importar. Painel de aparência da biblioteca em `--painel`. `dialog.modal` em `--card` com `--sombra`; `kbd` como tecla.
- **M7 concluído.**
- **M8a** (branch `feat/m8a-toasts`): `Biblioteca::importar` devolve `Importado::{Novo, JaExistia}`; o comando
  `importar_livros` separa `importados`/`jaExistentes`/`falhas`. Avisos (toasts) em `lib/avisos.svelte.ts`
  (`avisar(texto, tipo)`, `mensagensDaImportacao`) e `Avisos.svelte` (montado no `App`): sucesso some após 6 s com pausa
  sob ponteiro/foco, erro fica até fechar; regiões `status`/`alert` sempre no DOM. A antiga linha de aviso da
  biblioteca saiu.
- **M8b** (branch `feat/m8b-situacao`): `enum Situacao { NaoIniciado, Lendo, Concluido }` no core
  (`Situacao::da_fracao`: `None` → não iniciado; ≥ 0,995 → concluído), campo `situacao` em `LivroNaBiblioteca`
  (JSON em kebab-case). O card da biblioteca usa a situação do core.
- **M8c** (branch `feat/m8c-busca`): `lib/filtro.ts` (funções puras: `normalizar` sem acentos/maiúsculas,
  `filtrarLivros` com todas as palavras em título ou autores, `contarPorFiltro`). Na biblioteca: campo de busca
  (`<search>`, Ctrl+F, registrado em `atalhos.ts`), filtros Todos · Lendo · Concluídos com `aria-pressed` e contagem,
  anúncio "N livros encontrados" (`role="status"`), mensagem sem resultado com "Limpar busca"/"Mostrar todos"; setas,
  Delete e foco seguem só os livros visíveis.
- **M8d** (branch `feat/m8d-arrastar`): arrastar arquivos para a janela importa (`lib/arrastar.ts`:
  `tratarArraste`, puro, e `ouvirArraste` com `onDragDropEvent` do Tauri; permissão já no `core:default`). Só com a
  biblioteca na tela; área "Solte para importar" (`arrastando`, decorativa). Ctrl+O importa (botão com
  `aria-keyshortcuts`; no F1). Importar mostra "Importando…" (`avisarSeDemorar`, aviso tipo `progresso`) se passar
  de 400 ms.
- **Desempenho**: comandos Tauri sem `async` rodam na thread principal e congelam a janela. Os que leem ou copiam o
  livro inteiro (`importar_livros`, `abrir_livro`, `arquivo_livro`, `definir_capa`) são `#[tauri::command(async)]`.
  No perfil dev, `sha2`, `lopdf`, `miniz_oxide` e `zip` são compilados com `opt-level = 3` (importar um PDF de
  86 MB: 2,4 s → 0,1 s no `cargo tauri dev`).
- **M8 concluído.**
- **v0.2.0** (out/2026): tag assinada `v0.2.0` (M7 + M8) e Release no GitHub como pre-release. Versão nos 4 lugares:
  `Cargo.toml` (workspace), `crates/app/tauri.conf.json`, `ui/package.json` e os lockfiles.
- Próximo passo: definir o M9 (ou o M6, empacotamento). M6 (empacotamento) em aberto. M6 (empacotamento) em aberto. Pendências do M4d: leitura em voz alta de PDF; conferir à mão o
  destaque da frase lida.
