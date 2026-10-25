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
- **Setas rolam o que transborda**: no WebKitGTK, ↓/→ rolam a página inteira se algo passar da janela (inclusive um
  elemento só deslocado por `transform`) e rolam contêineres com `overflow: hidden`. A moldura e a área do livro usam
  `overflow: clip` (não é contêiner de rolagem). O Chromium não reproduz: testar no app.
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
- **M4b**: temas claro/escuro/sépia/alto contraste (cores em `ui/src/lib/temas.ts`; desde o M13, só da interface,
  e sépia virou página; testes de contraste WCAG) e opção "sempre reduzir animações". Padrão: seguir o sistema
  (`prefers-color-scheme`, `prefers-contrast`, `prefers-reduced-motion`; reativo em `lib/ambiente.svelte.ts`).
  Foco visível global (`:focus-visible`). Painel de tema na biblioteca e no leitor de EPUB. Páginas de PDF não seguem o tema (presets próprios no M12).
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
- Pendências: origem dos logs do frontend aponta para o wrapper.
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
- **M9a** (branch `feat/m9a-estantes-core`): migração 3 (`para_ler_em`, `lido_em`, `removido_em` em `livros`; datas,
  NULL = não). `Biblioteca`: `definir_para_ler`, `definir_lido` (lido manual vence o progresso:
  `Situacao::do_livro`), `mover_para_lixeira`, `restaurar`, `apagar_de_vez` (o antigo `remover`), `esvaziar_lixeira`,
  `listar_lixeira`; `listar` exclui a lixeira; `marcar_aberto` tira "para ler"; importar um livro da lixeira devolve
  `Importado::Restaurado` ("… voltou da lixeira."). O comando `remover_livro` ainda apaga de vez até o M9c.
- **M9b** (branch `feat/m9b-barra-lateral`): `Estantes.svelte` (Todos · Lendo · Para ler · Lidos, contagem,
  `aria-current="page"`, roving tabindex com ↑↓/Home/End) numa barra lateral (`<nav aria-label="Estantes">`) à
  esquerda da biblioteca; em janela estreita, botão "Estantes" abre um `PainelLateral` com véu (Esc/véu/escolher fecham
  e devolvem o foco). `lib/filtro.ts`: `Filtro` = `todos | lendo | para-ler | lidos`. Os filtros em pílula do M8c
  saíram; o card diz "Lido".
- **M9c** (branch `feat/m9c-acoes-lixeira`): comandos finos `listar_lixeira`, `definir_para_ler`, `definir_lido`,
  `mover_para_lixeira`, `restaurar_livro`, `apagar_livro` (async; substitui `remover_livro`), `esvaziar_lixeira`
  (async). `MenuLivro.svelte` (padrão ARIA de menu: ⋯ no card, tecla Menu/Shift+F10, clique direito; ↑↓/Home/End,
  Esc/Tab fecham e devolvem o foco ao livro). Lixeira na barra (separada das vistas; `Filtro` ganha `lixeira`; as
  outras estantes excluem `removidoEm`). Delete: na estante, vai para a lixeira sem confirmar (aviso com "Desfazer",
  `avisar(texto, tipo, acao)`); na lixeira, "Apagar de vez" com confirmação. "Esvaziar lixeira…" confirma. `App.aoAcao`
  + `executar` (faz, recarrega, avisa). Abrir pelo sistema abre o livro mesmo se já estava na biblioteca.
- **M9d** (branch `feat/m9d-icones-card`): migração 4 (`favorito_em`), `definir_favorito` e comando
  `definir_favorito`; estante "Favoritos" (entre Todos e Lendo). No card, linha de ações no pé (alinhada entre cards):
  ☆ Favorito, 🔖 Para ler e ✓ Lido como botões `aria-pressed` (fora do Tab; marcados com cor, fundo suave e forma
  cheia; o ✓ fica `aria-disabled` quando o livro está lido pelo progresso) e o ⋯ no fim. `Icone` ganhou `preenchido`.
  "Favoritar" também no menu (teclado).
- **M9 concluído.**
- **M10a** (branch `feat/m10a-colecoes-core`): migração 5 (`colecoes` e `livros_colecoes`, com `ON DELETE CASCADE` dos
  dois lados). `Biblioteca`: `listar_colecoes` (ordem alfabética, `quantidade` sem a lixeira), `criar_colecao`,
  `renomear_colecao`, `apagar_colecao`, `adicionar_a_colecao` (idempotente), `remover_da_colecao`. Nome aparado; vazio
  → `NomeDeColecaoVazio`; repetido → `ColecaoJaExiste` (comparação com `to_lowercase` no Rust: o `NOCASE` do SQLite
  só cobre ASCII). `LivroNaBiblioteca.colecoes` vem de um `group_concat`. Comandos finos e tipos TS prontos.
- **M10b** (branch `feat/m10b-colecoes-ui`): `Filtro` = `Vista | colecao:<id>` (`idDaColecao`, `contarPorColecao` em
  `lib/filtro.ts`). Barra lateral: vistas, seção "Coleções" (com contagem e "+ Nova coleção", fora das setas) e
  Lixeira; as setas andam por vistas, coleções e lixeira. Vista da coleção com "Renomear…" e "Apagar coleção…" (os
  livros ficam); se a coleção sumir, volta para Todos. `PedirNome.svelte` (nova/renomear; erro do core ligado ao campo,
  diálogo continua aberto) e `EscolherColecoes.svelte` ("Adicionar à coleção…": caixas que aplicam na hora e "Criar e
  adicionar"). Menu do livro: "Adicionar à coleção…" e, dentro de uma coleção, "Tirar desta coleção" (aviso com
  Desfazer). Na linha de ícones do card, a pasta "Coleções" abre o mesmo diálogo (`aria-haspopup="dialog"`, não é
  liga/desliga; destacada e cheia se o livro está em alguma coleção, `title` com a quantidade).
- **M10 concluído.**
- **M11** (branch `feat/m11-autores`): só Autores (Séries adiado). `lib/autores.ts`: `agruparPorAutor` (chave =
  `normalizar(nome)`; grafia mais comum; "Autor desconhecido" no fim; lixeira fora; `termo` filtra) e
  `chavesDoLivro`. `Filtro` ganha `autores` (a lista) e `autor:<chave>` (os livros do autor). Barra: item "Autores"
  depois de Lidos (atual também dentro de um autor). `ListaAutores.svelte` (roving ↑↓/Home/End; ao voltar, foco no
  autor de onde se saiu). Vista do autor com "‹ Autores" e o nome (foco no título ao abrir).
- **v0.3.0** (out/2026): tag assinada `v0.3.0` (M9 + M10 + M11) e Release no GitHub como pre-release.
- **M12** (branch `feat/m12-pagina-pdf`): `PaginaPdf` (original | creme | sepia | noite) em
  `core::preferencias` (`paginaPdf` no JSON; padrão original). `lib/paginaPdf.ts` (hoje `lib/pagina.ts`): `PAGINAS_PDF` (hoje `PAGINAS`) (papel/tinta para a
  amostra e o teste de contraste ≥ 7:1; `camada` multiply em creme/sépia; noite = `invert(0.9) hue-rotate(180deg)`),
  `inverter`, `inverterPixels` e `inverterCanvas`. No `LeitorPdf`: creme/sépia via `.page::after` com
  `mix-blend-mode: multiply`; noite inverte os pixels no `pagerendered` (registrado antes da espera da virada; ignora
  `cssTransform`) e `visor.refresh()` ao entrar ou sair da noite. **Não usar `filter` CSS no canvas do PDF**: o
  WebKitGTK o recalcula a cada quadro (esmaecer caiu de ~60 para ~30 qps; `will-change` piora). `ctx.filter` é aceito
  mas não tem efeito no WebKitGTK 2.54. Inverter custa ~60 ms por página de 1492×1932, uma vez por desenho.
  "Exibição do PDF" ganhou o grupo "Página" com amostras.
  Sem clarão na noite: `inverterCanvas` marca o canvas (`data-invertida`) e o CSS esconde canvas sem a marca, então
  nunca aparece um canvas claro (o pdf.js mostra o desenho parcial de páginas que passam de 500 ms,
  `minDurationToUpdateCanvas`). O `refresh()` não pisca: o canvas antigo fica até o novo terminar, e a troca e o
  `pagerendered` (onde se inverte) acontecem na mesma tarefa. A camada de creme/sépia precisa de `display: block`: o
  pdf.js esconde `.page::after` fora do carregamento.
- **Avisos acima do rodapé** (branch `fix/avisos-acima-do-rodape`): a `MolduraLeitor` publica a altura real do
  rodapé em `--rodape-leitor` (no `<html>`, com `ResizeObserver`; removida ao fechar o livro) e os avisos ficam
  `calc(var(--rodape-leitor, 0px) + 1rem)` acima da borda: não cobrem mais a barra de páginas.
- **v0.3.1** (out/2026): tag assinada `v0.3.1` (M12 + correções) e Release no GitHub como pre-release.
- **M13** (branch `feat/m13-aparencia`): aparência em três seções, iguais nos dois formatos. Core: `Tema` (interface:
  sistema | claro | escuro | alto-contraste; sem sépia) e `Pagina` (automatica | original | creme | sepia | noite,
  padrão automática) no lugar de `PaginaPdf`; `migrar` converte o JSON antigo antes de ler (tema sépia → claro +
  página sépia; `paginaPdf` → `pagina`, e o "original" dele → automática). `lib/pagina.ts` (antes `paginaPdf.ts`):
  tabela única `PAGINAS` (papel, tinta, link, esquema; camada/filtro para o PDF), `resolverPagina` (automática:
  interface clara → original, escura ou alto contraste → noite) e `cssDaPagina` (CSS do EPUB; interface em alto
  contraste força branco sobre preto). `lib/temas.ts` só da interface. Painel Aparência: `PainelTema` = seção
  "Interface" (cores e animações), `PainelPagina` = seção "Página" (cor com amostras, frase EPUB × PDF, aviso do alto
  contraste no EPUB, virada e, no PDF, exibição; substitui o `PainelPdf`), `PainelLeitura` = seção "Texto" (só EPUB).
  Na biblioteca, só Interface.
- **Painéis flutuantes** (branch `feat/paineis-flutuantes`): os painéis laterais do leitor e a barra de estantes da
  biblioteca são cartões com margem de 0,75rem da borda: `--painel`, borda `--divisoria` (`--borda` no alto contraste),
  `--raio-grande` e `--sombra`. No `PainelLateral`, `.painel` é só a margem (transparente) e `.conteudo` é o cartão
  (é ele que anima); na janela estreita, a moldura não põe fundo nem sombra na área do painel.
- **Capas e progresso** (branch `fix/capas-e-progresso`): `Biblioteca::abrir` chama `conferir_capas`, que conserta
  as capas que sumiram do cache (EPUB: extrai de novo da cópia do livro; PDF: apaga a referência e o frontend a gera
  de novo com o pdf.js, como ao importar); erro ali só vai para o log. O progresso é gravado a cada mudança de página,
  sem espera (um upsert no SQLite, < 1 ms; os comandos rodam na ordem): a espera de 1 s perdia a última página ao
  fechar a janela. **Não interceptar o fechamento da janela** (`onCloseRequested`): com o tratador registrado, o Tauri
  segura o fechamento até o JS liberar, e em testes o JS às vezes não recebia o pedido (janela impossível de fechar).
- **v0.4.0** (out/2026): tag assinada `v0.4.0` (M13 + capas e progresso + painéis flutuantes) e Release no GitHub
  como pre-release.
- **M14a** (branch `feat/m14a-paleta`): paleta de comandos com Ctrl+K em qualquer tela (não abre sobre outro
  diálogo; no F1). `lib/comandos.ts`: `Comando` (id, título, grupo, dica, palavras, teclas, executar) e
  `filtrarComandos` (todas as palavras em título, dica ou palavras, sem acentos; o que começa com o termo primeiro).
  `Paleta.svelte`: `dialog.modal` com combobox + listbox (`aria-activedescendant`; ↑↓, PageUp/PageDown, Enter,
  clique) e contagem em `role="status"`; o comando só roda depois de o diálogo fechar e devolver o foco. O `App`
  monta a lista conforme a tela: na biblioteca, importar, buscar, estantes, coleções, nova coleção, esvaziar
  lixeira e "Abrir <livro>" (dica = autores); no leitor, voltar à biblioteca; em ambas, interface, animações e
  atalhos. A `Biblioteca` expõe `mostrar(filtro)` e `buscar()` (via `bind:this`).
- **M14b** (branch `feat/m14b-comandos-leitor`): os leitores publicam comandos para a paleta por `onComandos`
  (`ComandosDoLeitor`: `comandos` e `porTermo`, num `$effect`; o `App` guarda em `doLeitor` e zera ao fechar).
  Geradores puros em `lib/comandos.ts`: `comandosDoIndice` ("Ir para: <seção>", atual marcado), `comandosDaPagina`
  (página e virada), `comandosDoTexto` (tamanho ± 0,1, some no limite; fontes, alinhamento, hifenização, restaurar)
  e `irParaPagina` ("42", "página 42" → "Ir para a página 42", só no PDF, via `porTermo`, que vem antes da lista).
  EPUB: páginas, painéis, voz conforme o estado, índice, página, texto. PDF: páginas, primeira/última, busca, zoom,
  exibição, índice, página. `MolduraLeitor.mostrarPainel(painel)` abre (sem alternar) e foca o painel. O campo da
  paleta muda o texto de exemplo conforme a tela (`textoDoCampo`).
- **M14 concluído.**
- **M15** (branch `feat/m15-modo-foco`): modo foco na `MolduraLeitor` (`modoFoco` bindable, `alternarFoco()`
  exposto; botão "Modo foco" com `aria-pressed`, Ctrl+Shift+F, paleta; Esc sai). Ao entrar, os painéis fecham (e
  voltam ao sair; abrir um painel sai do foco) e o grid fica só com o livro: cabeçalho e rodapé viram `position:
  absolute` por cima, escondidos com transform/opacity (`.foco:not(.revelada)`), então revelar não repagina.
  Revelam com o foco dentro deles (`focusin`/`focusout`; continuam no Tab e no leitor de tela) ou com o ponteiro nas
  faixas `.sensor` das bordas (necessárias: o iframe do EPUB engole o ponteiro), somem 700 ms depois de ele sair.
  Entrar pelo botão leva o foco a `.conteudo` (`tabindex="-1"`). Anúncio próprio (`aria-live`). `--rodape-leitor` vai a
  0 com o rodapé escondido. Progresso decorativo no canto. No PDF, um `ResizeObserver` refaz o zoom "página
  inteira"/"largura" quando a área muda (foco, painéis, janela); as setas não rolam (→/← viram e, com a página
  inteira na tela, ↑/↓ também), e a busca (Ctrl+F) ignora Ctrl+Shift+F. Não é lembrado entre as sessões.
- **v0.5.0** (out/2026): tag assinada `v0.5.0` (M14 + M15) e Release no GitHub como pre-release.
- **M16a** (branch `feat/m16a-destaques-core`): `core::destaques` com um segundo `impl Biblioteca` (campos `conexao` e
  `relogio` e `gravar` viraram `pub(crate)`). Migração 6: `destaques` (livro, `local` = CFI de intervalo no EPUB,
  trecho, cor, nota, capítulo, `posicao` 0–1 para a ordem de leitura, datas; `ON DELETE CASCADE`). `Cor` (amarelo |
  verde | azul | rosa, kebab-case; texto desconhecido → amarelo). `criar_destaque` (trecho/nota/capítulo aparados;
  trecho ou local vazio → erro; posição cortada em 0–1, NaN → 0), `listar_destaques` (posição, criação),
  `definir_cor_do_destaque`, `definir_nota_do_destaque` (vazia apaga), `apagar_destaque` (devolve o apagado) e
  `restaurar_destaque` (mesmo id e datas: Desfazer), `exportar_destaques` / `para_markdown` (puro; `##` quando o
  capítulo muda, trecho em citação, nota abaixo; snapshot). `LivroNaBiblioteca.destaques` (contagem). Comandos finos
  e tipos TS (`Destaque`, `NovoDestaque`, `CorDestaque`) prontos.
- **M16b** (branch `feat/m16b-destaques-epub`): destaques no leitor de EPUB. `lib/destaques.ts`: `CORES_DESTAQUE`
  (nome + hex), `estiloDoMarcaTexto` (papel claro: multiply 0,4; noite e alto contraste: screen 0,3; publicado nas
  variáveis `--overlayer-highlight-*` do `<foliate-view>`), `misturar` + teste de contraste ≥ 4,5:1 de cada cor em
  cada página, `posicaoNoLivro` (início da seção + `fracaoNoDocumento`), `resumo`, `descreverDestaque`. Foliate:
  `create-overlay` → `addAnnotation` de todos (só desenha os da seção carregada), `draw-annotation` →
  `Overlayer.highlight` (`desenhoMarcaTexto`, com `@ts-expect-error`: o foliate-js não tem tipos), `show-annotation`
  (clique) → barra do destaque. `BarraDestaque.svelte` (toolbar ARIA: cores com `aria-label`, `aria-pressed` só num
  destaque existente; Nota, Copiar, Apagar; não rouba o foco ao abrir pelo mouse; Ctrl+D a abre com foco; posição
  = retângulo do trecho + o do iframe). `EditarNota.svelte` (Ctrl+Enter salva; vazio apaga). `AbasIndice.svelte`
  (tabs ARIA "Índice" · "Destaques (n)", `mostrar()`; snippets `conteudoIndice`/`conteudoDestaques`).
  `ListaDestaques.svelte` (trecho, cor por extenso · capítulo, nota; Nota/Apagar; "Exportar em Markdown…").
  Apagar avisa com Desfazer (`restaurar_destaque`). Exportar: `save` do plugin-dialog (`dialog:allow-save`). Paleta:
  "Destacar a seleção", "Mostrar os destaques", "Exportar os destaques…", "Ir para destaque: …". `Leitor` recebe
  `livroId`. Selecionar texto só pelo teclado depende do leitor de tela (o WebKitGTK não tem cursor de navegação).
- **M16c** (branch `feat/m16c-destaques-pdf`): a lógica comum aos dois leitores saiu do `Leitor` para
  `lib/controleDestaques.svelte.ts` (`ControleDestaques`, classe com runes: lista, barra, nota, cor, copiar, apagar com
  Desfazer, exportar, comandos da paleta), com um `AdaptadorDestaques` por formato (`desenhar`, `apagarDesenho`,
  `irPara`, `focarTexto`, `limparSelecao`, `anunciar`, `mostrarLista`; `livroId` como getter). `DestaquesDoLeitor.svelte`
  = barra + diálogo da nota. `posicaoDaBarra` em `lib/destaques.ts`. PDF (`lib/destaquesPdf.ts`): `local` =
  `pdf:<página>:x,y,l,a;…` em frações da página (`localPdf`/`lerLocalPdf`), `retangulosNaPagina` (recorta na página,
  descarta os vazios e o "fim do conteúdo" do pdf.js, junta os da mesma linha), `posicaoNoPdf`, `acertou` (clique),
  `naJanela`. No `LeitorPdf`: seleção na camada de texto (`pointerup` no contêiner; Ctrl+D), camada
  `.camada-destaques` (divs em %, `pointer-events: none`) logo depois do `.canvasWrapper` de cada `.page`,
  redesenhada a cada `pagerendered` (o `reset()` do pdf.js tira nós desconhecidos); mistura e opacidade por variáveis
  CSS (`screen` na noite). Capítulo pelo sumário (`itemAtual`). Ir até o destaque = ir à página.
- **M16 concluído.**
- Próximo passo: a definir (v0.6.0 com M16; Séries; voz no PDF). (Séries, M6 empacotamento, ou novas features). Pendências do M4d: leitura em voz alta de
  PDF; conferir à mão o destaque da frase lida.
