# Folio — leitor de EPUB e PDF

> Antes chamado "Leitor" (nome provisório até out/2026). Repositório: `nunes90/folio` no GitHub (era `nunes90/leitor`;
> o GitHub redireciona). A pasta local continua `~/Projects/leitor`. Atualize este arquivo ao fim de cada sessão.

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
- Logs: `tracing` + `tracing-subscriber` (`RUST_LOG=folio=debug`), `tracing-appender` com rotação.
  Diretório de logs via crate `directories`: Linux `~/.local/state/folio/logs`, macOS `~/Library/Logs/folio`.
  `tauri-plugin-log` encaminha os logs do frontend para o mesmo arquivo. Usar `#[instrument]` nas operações principais.
- Testes: unitários + integração com fixtures (`crates/core/tests/`), `insta` (snapshots),
  `proptest` (parsers não podem dar panic), Vitest (frontend), `axe-core` (a11y),
  `tauri-driver` para E2E (Linux/Windows; no macOS os testes são manuais), `criterion` mais tarde.
- **Svelte 5, `$effect` e bibliotecas com eventos síncronos** (pdf.js, foliate-js): chamar a biblioteca dentro de um
  efeito pode disparar, na hora, tratadores que leem estado reativo, e essas leituras viram dependências do efeito
  (ele passa a rodar quando não devia). Pôr essas chamadas em `untrack(() => …)`.
- **Atalhos como linguagem**: a leitura inteira deve ser operável sem o mouse. Todo recurso novo ganha atalho (sem
  letra sozinha, WCAG 2.1.4) ou comando na paleta (Ctrl+K), e entra no F1 (`lib/atalhos.ts`).
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
  listar por atividade recente, progresso. Dados em `~/.local/share/io.github.nunes90.folio`, capas em
  `~/.cache/io.github.nunes90.folio/capas` (até o nome Folio, `…nunes90.leitor`: ver "Nome Folio" abaixo). Para testar sem tocar nos dados reais: `XDG_DATA_HOME`/`XDG_CACHE_HOME`.
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
- **v0.6.0** (out/2026): tag assinada `v0.6.0` (M16) e Release no GitHub como pre-release.
- **Plano até a v1.0** no ROADMAP ("Rumo à v1.0"): v0.7 blocos e frases (M17a/b), AppImage de teste na CI (M6a) e
  destaques com motivo (M18);
  v0.8 uma ideia por vez, sessões e metas, progresso honesto, continuação (M19–M22); v0.9 voz, tipografia, comparar
  trechos lado a lado (M23–M25); v1.0 acabamento (M26) e AppImage final (M6b). Nome definitivo do app em aberto
  ("Leitor" é provisório; trocar o identificador exige migrar as pastas de dados).
- **M17a** (branch `feat/m17a-frases-epub`): `lib/frases.ts` com as regras do `tts.js` do foliate-js (mesmas tags de
  bloco; frases pelo `Intl.Segmenter`): `blocosDe`, `frasesDe`, `frasesDoDocumento`, `indiceDaFraseEm`, `unir`.
  Quebras de linha no meio do parágrafo viram espaço antes de dividir (o segmentador as trata como fim de frase).
  `textosDe` percorre só do início ao fim do bloco: percorrer o ancestral comum era quadrático (5 mil frases: 3,8 s →
  36 ms); as frases de cada capítulo ficam num `WeakMap` por documento. Modo frase no `Leitor`: Ctrl+D sem seleção
  seleciona de verdade a frase atual (a seleção é a prévia; `scrollToAnchor(trecho, true)` + `addRange`, porque o
  foliate só seleciona quando a página vira) e abre a barra pelo caminho da seleção; Alt+↑/↓ trocam de frase,
  Alt+Shift+↑/↓ encolhem ou estendem (`onTrecho` na `BarraDestaque`, `MudancaDeTrecho`); o `relocate` não esconde
  a barra no modo frase; virar a página à mão a fecha (`aoFecharBarra` no adaptador zera o modo). Durante a voz,
  a frase lida já é a seleção: Ctrl+D a destaca, pausando a voz enquanto a barra está aberta (a página viraria e a
  barra fecharia) e retomando quando ela fecha (`retomarVozAoFechar`; "Ouvir" recomeça em vez de retomar).  **Pausar
  cancela a fala e retomar fala de novo a partir da última frase marcada** (`tts.resume()` do foliate-js; eventos
  com a voz pausada são ignorados): o `PAUSE` do speech-dispatcher só pausava na marca seguinte (o destaque andava e a
  página virava durante a pausa) e, ao retomar, dava o bloco por terminado, pulando o resto dele. O `pausar`/`retomar`
  do core ficam sem uso no frontend. "Ouvir" na barra (`onOuvir`, só com voz): lê a partir da frase,
  da seleção ou do destaque (`resolveCFI`); `lerEmVozAlta(desde?)` recomeça se já estiver lendo.
- **M17b** (branch `feat/m17b-frases-pdf`): `lib/frasesPdf.ts`: `agruparEmLinhas` (spans da camada de texto em
  linhas pelo meio vertical), `quebrasDeBloco` (bloco novo com espaço > meia linha ou letra de outro tamanho, ex.:
  título), `frasesDaCamada` (frases de cada bloco pela `frasesDe` do EPUB) e `textoDoTrecho` (o `<br>` de fim de
  linha do pdf.js vira espaço: o `toString()` o ignorava e juntava palavras de linhas diferentes no destaque e no
  Markdown; vale também para a seleção com o mouse). No `LeitorPdf`: Ctrl+D sem seleção entra no modo frase na
  primeira frase da página (`camadaDeTexto` espera o `textlayerrendered`, até 1,5 s; `WeakMap` por camada);
  Alt+↑/↓ passam para a página vizinha nas pontas; Alt+Shift+↑/↓ só dentro da página; `pagechanging` não esconde a
  barra no modo frase; virar à mão a fecha. Sem "Ouvir" no PDF até a voz no PDF (M23).  Bug achado
  aqui: o `$effect` do modo do PDF mudava o zoom, o pdf.js chamava na hora o tratador de `scalechanging`, e o estado
  lido ali (o zoom, a barra) virava dependência do efeito: mudar o zoom voltava para "página inteira" e abrir a
  barra a fechava em 4 ms. As chamadas ao pdf.js nos efeitos agora ficam em `untrack`. Também: a barra só fecha se
  a escala mudar de fato, e o `ResizeObserver` do M15 só reaplica o zoom se o tamanho do contêiner mudar. Nos dois
  leitores, a seleção do modo frase (a prévia) é limpa quando a barra fecha (`aoFecharBarra`): sem isso, o Ctrl+D
  seguinte a tratava como seleção do mouse, fora do modo frase, e o Alt+↑/↓ não fazia nada.
- **M6a** (branch `ci/m6a-appimage`): empacotamento ligado só para AppImage (`bundle.targets`), ícones 32/64/128/256
  (gerados do `icon.png` provisório com `cargo tauri icon -p`), `category` Productivity (vira `Office`),
  `fileAssociations` EPUB e PDF. Modelo próprio do `.desktop` (`crates/app/leitor.desktop`, via
  `bundle.linux.deb.desktopTemplate`, que o AppImage também usa): o do Tauri não punha `%f` no `Exec`, e o "Abrir
  com" abria o app sem o arquivo. Workflow `.github/workflows/appimage.yml` (Ubuntu 22.04: glibc mais antiga roda
  em mais distribuições): na Release publicada, gera e anexa o AppImage; à mão e em PRs do empacotamento, só como
  artefato. Local: `cargo tauri build --bundles appimage` → `target/release/bundle/appimage/` (~108 MB, com o
  WebKitGTK e o GStreamer embutidos).
- **M18** (branch `feat/m18-motivo`): migração 7 (`motivo` em `destaques`; NULL = sem motivo). `enum Motivo { Duvida,
  Citar, Revisar }` (kebab-case; texto desconhecido → sem motivo; `rotulo()` e `nome()` para o Markdown), campo
  `motivo` em `Destaque`/`NovoDestaque` (`#[serde(default)]`), `definir_motivo_do_destaque` e comando
  `definir_motivo_destaque`. `para_markdown(…, so)`: sem filtro, cada trecho mostra o motivo em itálico; com
  `so`, só os daquele motivo e o título diz qual ("— para citar"); `exportar_destaques(…, so)` conta só esses.
  Frontend: `MOTIVOS` em `lib/destaques.ts` (ícones `duvida`, `citar`, `revisar`); na barra, os motivos entre as
  cores e a Nota (numa seleção, criam o destaque amarelo com o motivo; num destaque, liga/desliga com
  `aria-pressed`); `ControleDestaques.escolherMotivo`/`definirMotivo`/`exportar(motivo)`; na aba Destaques, filtro
  Todos · Dúvida · Citar · Revisar com contagem (`aria-pressed`), seletor de motivo em cada item (teclado, sem
  abrir a barra) e "Exportar só …" seguindo o filtro; paleta: "Exportar só …" para os motivos que existem.
- **Nome Folio** (branch `feat/nome-folio`): o app passou de "Leitor" a **Folio** (o "Folio" de notas do Flathub,
  `com.toolstack.Folio`, e a semelhança com o Foliate foram considerados e aceitos). Crates `folio` e `folio-core`
  (`use folio_core::…`; snapshots do `insta` renomeados, porque o nome do crate entra no arquivo), identificador
  `io.github.nunes90.folio`, título e `productName` Folio, logs em `~/.local/state/folio/logs`, `CLIENT_NAME` do
  speech-dispatcher, `.desktop` (`crates/app/folio.desktop`), `<title>` e o plugin de capas do Vite. Migração das
  pastas: `core::pastas::pasta_migrada(nova, antiga)` move (`rename`, sem copiar) a pasta antiga para a nova se só a
  antiga existir; se mover falhar, segue a antiga. O `main` a chama para dados e cache **antes do Tauri**
  (`pastas_do_app`, com `directories::BaseDirs`, que dá as mesmas pastas que o Tauri): o WebKitGTK cria a pasta de
  dados nova para o cache dele ao iniciar, e a primeira versão (que migrava no `setup`) achou a pasta nova "já
  existente" e abriu uma biblioteca vazia. Os logs antigos ficam em `~/.local/state/leitor`. Ícone: página com lombada (cantos
  brancos tornados transparentes e a orla clara removida), fonte em `crates/app/icons/folio-1024.png` e tamanhos
  32/64/128/256/512 gerados com `cargo tauri icon -p`. O repositório no GitHub virou `nunes90/folio` (`gh repo rename`).
- **v0.7.0** (out/2026): tag assinada `v0.7.0` (M17a, M17b, M6a, M18 e o nome Folio) e Release como pre-release;
  o AppImage é anexado pela CI ao publicar a Release (primeira vez do M6a).
- **M19** (branch `feat/m19-uma-ideia`): "uma ideia por vez", opcional e igual nos dois formatos.
  `MolduraLeitor`: `umaIdeia` bindable, `alternarUmaIdeia()`, botão (ícone `ideia`, `aria-pressed`), Ctrl+Shift+B
  (Ctrl+Shift+I é o inspetor do WebKit; Ctrl+Shift+U, a entrada Unicode do IBus), anúncio; o Esc desliga por
  último (depois do modo foco e dos painéis; `escOcupado` com a barra de destaque aberta). Não é lembrado. Ligado,
  o livro passa a **rolagem contínua** (sem mudar a preferência; ao desligar, volta) e o bloco atual fica no meio
  da tela: ↑/↓ passam de bloco (nas pontas, o capítulo ou a página vizinha), a rolagem anima com a mola
  (`duracao("longa")`), clicar num bloco o escolhe, rolar com o mouse troca de bloco quando o atual sai da tela,
  Ctrl+D começa o modo frase no bloco. Paginado, a página virava a cada bloco e o PDF não tinha para onde rolar.
  `lib/umaIdeia.ts`: `blocosDoDocumento` (de `blocosDe`, com `aparar`), `emVolta`/`esmaecer` (EPUB: os irmãos de
  cada elemento no caminho do bloco até o body ganham `data-folio-fora`, opacidade 0,35 com transição; a
  opacidade de um ancestral alcançaria o bloco), `cruza`, `blocoNaTela`, `vizinho`, `veuNaPagina`, `uniao`,
  `rolarSuave`. EPUB: `flow="scrolled"` e `Paginator.centerAnchor` (alteração local no foliate-js, PATCHES.md).
  PDF: um véu da cor do papel sobre a página com um furo no bloco atual (`box-shadow` do furo; o furo vai ao
  bloco por translate + scale, só transform; em creme/sépia o véu é branco e a camada multiply o tinge); as
  outras páginas visíveis ficam esmaecidas por inteiro. Véus separados por bloco se sobrepunham nas folgas.
  **Ordem de leitura no PDF** (`lib/frasesPdf.ts`): o pdf.js entrega o texto na ordem do arquivo (cabeçalho,
  figuras e equações em qualquer lugar). `ordemDeLeitura` = recorte XY (colunas quando os dois lados têm 3+
  linhas ou numa linha só; senão, o maior vão entre faixas; o recuo de código não vira coluna);
  `blocosEmOrdem` (blocos contínuos no DOM; legenda abre bloco); `ideiasEmOrdem` (curtos próximos juntos:
  rótulos de figura, equação com o número; legenda com a continuação); `soOPrincipal` (sai o que está fora da
  coluna principal, legendas e os rótulos logo antes delas, o curto acima ou abaixo de todo o texto). O modo
  frase usa a mesma ordem, mas passa por tudo. Testado com páginas reais pelo pdf.js no Node (`node` roda `.ts`).
- **M20a** (branch `feat/m20a-sessoes-core`): sessões de leitura. Core `sessoes.rs` (outro `impl Biblioteca`):
  migração 8 (`sessoes`: livro, início, fim = último aviso, `ativo` em segundos, de/até com localização e
  fração; `ON DELETE CASCADE`). `iniciar_sessao`, `registrar_na_sessao` (soma o intervalo desde o último aviso
  até `PAUSA_MAXIMA` = 5 min: um livro esquecido aberto não vira horas; relógio que volta não desconta; com
  `onde`, muda o ponto), `encerrar_sessao` (sessão de menos de `SESSAO_MINIMA` = 30 s que não saiu do lugar é
  apagada: só abriu e fechou), `listar_sessoes` (mais recente primeiro). Cada aviso grava: fechar a janela
  sem avisar não perde a sessão. Comandos finos e tipos TS. Frontend: `lib/sessao.svelte.ts`
  (`SessaoDeLeitura`: começa no primeiro progresso do leitor, `mover` a cada mudança de lugar, `atividade`
  no máximo 1×/min com tecla, clique ou roda; chamadas numa fila, na ordem), ligada no `App` (`abrir`,
  `aoProgredir`, `fechar`). Eventos dentro do iframe do EPUB (clique, roda) não chegam à janela; as teclas
  sim (são reenviadas) e as mudanças de página também contam.
- **M20b** (branch `feat/m20b-meta`): meta da sessão. `lib/meta.svelte.ts`: `Meta` = minutos (os dois
  formatos) | páginas (só PDF: no EPUB as páginas mudam com a letra) | capítulo (só EPUB, até o fim dele);
  `MetaDaSessao` (`definir`, `mover(ponto)`, `atividade`, `tique(visivel)`, `continuar`, `repetir`; `texto`,
  `progresso`, `resumo`). O tempo conta como no core: com a janela à vista e até 5 min depois da última
  atividade. Páginas = a maior página alcançada menos a do início (voltar não desconta); capítulo = fração da
  seção desde onde a meta começou, cumprida ao chegar numa seção seguinte. `comandosDaMeta` (paleta, grupo
  "Sessão": 10/20/30/45/60 min, 5/10/20/30 páginas ou até o fim do capítulo; "Tirar a meta") e `metaPorTermo`
  ("25 min", "12 páginas"). `MolduraLeitor` recebe `meta`: tique de 1 s, atividade por tecla/clique/roda (na
  captura), "Meta: 12 de 20 min" + barra decorativa + botão "Tirar a meta" no rodapé, e `ResumoDaMeta.svelte`
  (diálogo "Meta cumprida": "Você leu 20 minutos: de página 128 até página 141."; Continuar lendo em foco,
  Esc = continuar, "Mais 20 min", "Voltar à biblioteca"). Os leitores só movem a meta (EPUB: capítulo pela
  seção e `getSectionFractions`; PDF: a página).
- **M20c** (branch `feat/m20c-foco-planejado`): modo foco com saída planejada e barras só pelo teclado.
  `MolduraLeitor.focarPor(meta | null)` entra no foco (se preciso) com uma saída contada por outra
  `MetaDaSessao` (`saidaDoFoco`, que os leitores movem junto com a meta: `moverContagens`); ao cumprir, o foco
  acaba sozinho, sem diálogo, só com o anúncio ("Modo foco encerrado como planejado, depois de 10 minutos de
  leitura."); sair antes desfaz a saída. Paleta (`comandosDoFoco`): "Modo foco por 5/10/15/30 min", "por 1/5/10
  páginas" (PDF), "até o fim do capítulo" (EPUB) e "Ficar no modo foco sem hora para sair". No canto, ao lado
  da porcentagem, "foco: 3 de 10 min". Preferência `barrasSoPeloTeclado` (core `barras_so_pelo_teclado`,
  padrão desligado; seção "Modo foco" do painel Página): sem as faixas `.sensor` e sem o `pointerenter` do
  cabeçalho e do rodapé (o mouse que entra na janela pela borda acertava a beira deles, escondidos), as barras
  só aparecem com o foco nelas (Tab). Nos dois modos, o `focusin` que o navegador repete ao devolver o foco
  quando a janela volta a ser ativa (no Hyprland, o mouse entrar nela basta) não revela as barras.
- **M20 concluído.**
- **M21a** (branch `feat/m21a-ritmo`): ritmo e estimativas. Migração 9: `sessoes.avanco` (fração lida em
  sequência: só passos para a frente de até `SALTO_MAXIMO` = 5% do livro por aviso; voltar e saltar pelo índice,
  pela busca ou por um destaque não contam) e só depois de `PERMANENCIA_MINIMA` = 5 s no ponto anterior
  (folhear e clicar no sumário de capítulo em capítulo não é ler; medido desde a última mudança de lugar,
  `movido_em`, migração 11, e não desde o último aviso: a tecla de virar a página avisa atividade logo antes).
  A migração 11 zerou o avanço gravado pela regra anterior. `ritmo(sessoes)` (puro) = avanço ÷ tempo ativo das sessões de 1 min
  ou mais que avançaram; `None` com menos de `RITMO_MINIMO` = 5 min (sem dado, sem estimativa).
  `Biblioteca::ritmo_de_leitura` e o comando. As sessões gravadas antes da migração ficam com avanço 0 (não
  entram). `lib/estimativa.ts`: `estimar(fracao, ritmo, fimDoCapitulo)`, `duracaoAproximada` ("~12 min",
  "~1 h 20 min"), `textoDoRodape`, `textoCompleto`, `comandoQuantoFalta` (paleta "Quanto falta?", anuncia). Os
  leitores buscam o ritmo ao abrir e de 5 em 5 min; o fim do capítulo é o da seção (EPUB) ou a página antes da
  próxima entrada do sumário (PDF; sem sumário, só o documento). A moldura mostra `estimativa` no rodapé.
- **M21b** (branch `feat/m21b-revisitas`): trechos revisitados. Core `visitas.rs` (migração 10: `visitas`,
  chave livro + `trecho` = a ordem do trecho no livro; rótulo, `local` para onde ir, voltas, primeira visita,
  última volta). `visitar_trecho`: na primeira vez registra; depois é **volta** se o trecho fica antes do mais
  adiantado já visitado (ler um capítulo longo em várias sessões não conta; abrir pela primeira vez um capítulo
  pulado também não) e a última volta foi há mais de `INTERVALO_ENTRE_VOLTAS` = 30 min (ir e vir conta uma
  vez); devolve `voltou`. `trechos_revisitados(livro, minimo)`. Frontend `lib/revisitas.svelte.ts`
  (`Revisitas.entrar`: só a entrada no trecho vai ao core; aviso discreto a partir da 3ª volta, "Você voltou a
  “Capítulo 3” 3 vezes."; paleta "Ir para trecho revisitado: …" com 2+ voltas). Trecho: EPUB = seção
  (`secao:N`, `view.goTo(N)`); PDF = seção do sumário (`pagina:N`) ou, sem sumário, blocos de 10 páginas
  (`trechoDePaginas`); no PDF, as visitas só começam com o sumário carregado (para não misturar os dois jeitos
  no mesmo livro).
- **M21 concluído.**
- **M22** (branch `feat/m22-continuacao`): continuação ao reabrir. `lib/continuacao.ts`: `deveMostrar` (com
  progresso e a última leitura há `AUSENCIA_MINIMA` = 1 h ou mais, ou sem sessão), `haQuanto`
  (`Intl.RelativeTimeFormat`: "há 3 horas", "ontem", "anteontem"; menos de 1 min, "há instantes"),
  `ultimasFrases` (Intl.Segmenter), `textoDaContinuacao`. O `App` busca a sessão mais recente em `abrir`,
  antes de a nova começar, e passa `ultimaLeitura` aos leitores. EPUB: o capítulo e as frases em volta do ponto
  salvo (as duas anteriores e a que a página cortou, pelas frases do M17). PDF: a seção do sumário e a página
  salva, com as 3 últimas frases da página anterior (`getTextContent` do pdf.js); montado depois do sumário.
  `CartaoContinuacao.svelte` (não é diálogo: não prende o foco), mostrado pela `MolduraLeitor` (`continuacao`)
  no alto da área do livro e anunciado; some com "Continuar lendo", com Esc (antes de tudo) ou ao virar a
  página (`virarPagina`); paleta "Mostrar onde eu tinha parado" (`mostrarContinuacao`). Pelo botão ou pelo Esc,
  a moldura chama `onContinuar` e o leitor faz o ponto piscar (`lib/piscar.ts`: caixas com o amarelo e a
  mistura dos destaques, opacidade 0 → 1 → 0 em 1,6 s; com movimento reduzido, sem transição): no EPUB, a frase
  que a página cortou (no documento do capítulo); no PDF, o primeiro bloco de texto da página salva.
- **M22 concluído. v0.8 completa** (M19–M22).
- **v0.8.0** (out/2026): tag assinada `v0.8.0` (M19–M22) e Release como pre-release, com o AppImage da CI.
- **M23a** (branch `feat/m23a-voz-pdf`): leitura em voz alta no PDF, com o modelo do EPUB. `blocoDasFrases` em
  `lib/voz.ts` (as frases de uma página como `<s><mark name="i"/>…</s>`; marcas = índice da frase na página, a
  partir de onde a leitura começa). No `LeitorPdf`: `lerEmVozAlta(n, frase)`/`lerDesde` (uma página por vez,
  com as frases do M17b na ordem de leitura; só o texto principal do `soOPrincipal` é lido, menos a frase de
  onde se pediu para ouvir: `frasesParaFalar`; páginas sem texto são puladas; `vez` descarta uma leitura antiga que
  acorda depois de um `await`), `aoEventoVoz` (a frase marcada vira a seleção na camada de texto; se a página
  mudou à mão, volta a ela; no fim, a página seguinte), pausar = cancelar e retomar da frase marcada, parar.
  Ctrl+D com a voz lendo pausa enquanto a barra está aberta e retoma ao fechar (`retomarVozAoFechar`), como no
  EPUB. "Ouvir" na barra de destaque do PDF (`ouvirDaqui`: do modo frase, da seleção ou do destaque, achando a
  frase pelo ponto). Comum aos dois: `ControlesVoz.svelte` (rodapé), `comandosDaVoz` (paleta) e `EstadoVoz`.
- **M23b** (branch `feat/m23b-voz-estavel`): frase lida estável e velocidade por trecho, iguais nos dois formatos.
  A frase lida é desenhada como um destaque, na cor de destaque da interface (`corDoRealce`, `lib/realce.ts`), e
  não mais pela seleção: um clique não a desfaz e ela fica na pausa; some ao parar. EPUB: uma anotação a mais do
  foliate-js (`realceVoz` = CFI da frase; `draw-annotation` usa a cor da interface; se o CFI for o de um
  destaque, ele é redesenhado ao trocar), via `initTTS("sentence", mostrarFraseLida)` + `scrollToAnchor(frase)`.
  PDF: camada `.camada-voz` com os retângulos por linha (`retangulosNaPagina`, em frações), refeita no
  `pagerendered`. **A CSS Custom Highlight API foi descartada**: no WebKitGTK 2.54 a frase anterior continuava
  pintada e as caixas não seguiam as linhas. Ctrl+D com a voz lendo põe a
  frase lida na seleção para abrir a barra (e tira ao retomar). Velocidade: `velocidadeDoTrecho` (lista −15,
  código −30 na escala do speech-dispatcher, uma mensagem por trecho). EPUB: o bloco do `tts.js` (`block`,
  alteração local) → `tipoDoElemento` (`pre` = código; `li`/`dt`/`dd` = lista). PDF: `tipoDaFrasePdf` (código se a
  maioria das letras está em `font-family: monospace`, que o pdf.js põe nas fontes de largura fixa; lista pelo
  marcador, `tipoDoTexto`) e `trechoDeFala` dividem a página em mensagens do mesmo tipo (`leitura.fim`; no "fim",
  o trecho seguinte). `frasesParaFalar(…, lerAPrimeira)`: ao continuar (outra página, outro trecho), a primeira
  frase não é mais forçada (o M23a lia o número da página no alto de cada página nova).
- **M23 concluído.**
- **M24** (branch `feat/m24-tipografia`): tipografia que reage ao texto (EPUB), em `cssDoLivro`. Código (`pre`,
  `code`, `kbd`, `samp`, `tt`) sempre na **Atkinson Hyperlegible Mono** (`MONO` em `lib/fontes.ts`, OFL, via
  Fontsource; com o nome antes de `monospace`, o WebKit não reduz a 13 px), sem os espaçamentos e a hifenização do
  texto; `pre` quebra as linhas longas (`pre-wrap`) em vez de vazar da coluna. Títulos: entrelinha
  `max(1,15; entrelinha × 0,8)`, `text-wrap: balance`, sem hifenizar, `break-after: avoid`; margens 1,6em/0,6em
  só como padrão (sem `!important`: as do livro vencem). Largura da coluna em **caracteres por linha**
  (`caracteresPorLinha`, 40–160, padrão 90; `larguraDaColuna` = caracteres × 0,5em × 16 px × escala × tamanho):
  aumentar a letra alarga a coluna junto. O core migra `larguraMaxima` (px ÷ 8, arredondado e como inteiro: o
  serde não lê um float num `u32`, e o JSON inteiro viraria o padrão).
- **M25a** (branch `feat/m25a-fixar-ao-lado`): destaques fixados ao lado do texto, iguais nos dois formatos.
  `ControleDestaques`: `fixados` (derivado dos ids, na ordem em que foram fixados: seguem cor, nota e motivo;
  o de um destaque apagado some e volta com o Desfazer), `estaFixado`, `fixar`, `desafixar(d)`,
  `desafixarTodos` (devolvem o foco ao texto se ele estava nos cartões), `alternarFixado` (aba Destaques) e
  `fixarDaBarra` (numa seleção, cria em amarelo e fixa; num fixado, desafixa). Paleta: "Fixar ao lado: …"
  (os não fixados), "Ir ao fixado: …", "Desafixar: …" e, com 2+, "Desafixar todos". "Fixar ao lado" na barra
  (ícone `fixar`, `aria-pressed` num destaque) e na aba Destaques. `CartaoFixado.svelte` (`aside`: trecho
  inteiro, cor · motivo · capítulo, nota; Ir até lá, Nota, Desafixar). `MolduraLeitor.fixado` (snippet):
  coluna `fixado` de cartões entre o livro e a Aparência (o livro repagina, como ao abrir um painel); sem largura
  para a coluna (`cartoesEmbaixo` em `lib/destaques.ts`: sobrariam menos de 40rem para o livro, contando os
  painéis abertos), uma faixa embaixo do livro, cartões lado a lado e roláveis, sem cobrir o texto; some no
  modo foco. Medido na moldura (`ResizeObserver`), não por media query: com o monitor 4K a 1,6 e a escala de
  texto 1,36, meia tela tem ~1190 px de CSS, acima de qualquer limite fixo razoável.
- **M25b** (branch `feat/m25b-lado-a-lado`): dois pontos do EPUB lado a lado. `LadoEpub.svelte`: uma segunda
  `<foliate-view>` com o mesmo arquivo, o mesmo CSS e a mesma largura (`cssLivro`/`larguraLivro` derivados no
  `Leitor`), uma coluna; lê e destaca com o mesmo `ControleDestaques` (o adaptador desenha e limpa a seleção nos
  dois; `focarTexto` volta ao lado que tinha a seleção); voz, meta, sessão e progresso só no principal. Setas e
  PageUp/PageDown viram o lado com a virada das preferências quando o foco está nele (teclas do iframe dele
  tratadas ali; as outras seguem para a janela); Ctrl+D destaca a seleção do lado. `selecaoNoEpub` e
  `posicaoNoIframe` em `lib/destaques.ts` (comuns aos dois). Abrir: botão "Abrir ao lado" no cabeçalho
  (`onAlternarLado`, ícone `dividir`, `aria-pressed`) e **Ctrl+Shift+L**, no mesmo ponto; ao abrir assim, o
  principal vai ao mesmo CFI e, depois de os dois assentarem (`assentar`: 150 ms sem mudar de página), o lado vai
  ao início da página do principal. Paleta (`comandosDoLado`): "Abrir este ponto ao lado", "Abrir ao lado: <seção>",
  aberto: "Alternar entre os lados" (**F6**), "Fechar o lado", "Lado: ir para <seção>"; "Abrir ao lado" no cartão
  fixado. Moldura: coluna `lado` (`minmax(0,1fr)` dos dois lados; também na janela estreita: empilhados
  confundiam); sem barra própria no lado: os controles (`ControlesLado.svelte`: seção, ‹ % ›, fechar) ficam no
  rodapé (`rodapeLado`), que vira `subgrid` e põe os de cada livro embaixo dele. **As duas áreas precisam ter a
  mesma largura e altura**: com a barra no alto, ou com 1 px de borda no lado (a linha divisória agora é um
  `::before` por cima), os dois paginavam diferente e as quebras de página saíam desalinhadas. `cartoesEmbaixo`
  conta a largura dividida. Medido: memória +1–2 MB (o lado roda no mesmo WebKitWebProcess); virada esmaecer
  ~47–65 qps com o lado aberto (~60 sem).
- **M25c** (branch `feat/m25c-lado-pdf`): o lado no PDF. `LadoPdf.svelte`: um segundo `PDFViewer` sobre o mesmo
  `PDFDocumentProxy` (o principal o guarda em `documentoPdf`; o lado não o destrói ao fechar), com o modo, o zoom
  (`escalaLado`, o do principal ao abrir), a cor da página e os destaques do principal; abre na mesma página
  (páginas de PDF são fixas: os dois mostram a mesma). Lê e destaca (seleção com o mouse, Ctrl+D, clique num
  destaque); setas e PageUp/PageDown viram com a virada das preferências (na rolagem, as setas rolam). Comum aos
  dois lados: `desenharCamadaDestaques` e `selecaoNoPdf` (`lib/destaquesPdf.ts`), `paginaRenderizada`
  (`lib/pdf.ts`) e o CSS das páginas (`lib/paginasPdf.css`, classe `paginas-pdf`; a camada de creme/sépia num
  seletor mais específico que o `.pdfViewer .page:not(.loading)::after` do pdf.js). Paleta: "ao lado 87"/"lado 87"
  (`ladoPorTermo`), "Abrir ao lado: <seção>" (página pelo sumário); "Abrir ao lado" no cartão fixado vai à página
  do destaque. O `aoTeclar` do PDF ignora teclas já tratadas (`defaultPrevented`). Rodapé com o lado aberto, nos
  dois formatos: no lado, os mesmos controles do principal (`ControlesLado` só envolve e põe "Fechar o lado"; no
  PDF, a `BarraPdf` ligada ao visor do lado, com zoom e largura), sem textos que mudam de tamanho (a seção fazia os
  controles pularem); "Ler em voz alta" sai do principal (fica na paleta; lendo ou pausada, os controles ficam).
  Cada metade é um flex: controles de página no começo (mesma posição nos dois), o que é só daquele lado
  (`data-fim-rodape`: voz, "Fechar o lado") no fim, os botões só com o ícone (`.com-lado footer .rotulo`), quebra
  de linha sem espaço. Um grid de três colunas centralizado sobrepunha o "Fechar o lado" na meia tela.
- **M25 concluído. v0.9 completa** (M23–M25).
- **v0.9.0** (out/2026): tag assinada `v0.9.0` (M23–M25) e Release como pre-release, com o AppImage da CI.
- **M26a** (branch `feat/m26a-densidade`): densidade do leitor. `MenuLeitor.svelte` ("Mais opções", ⋯ no
  cabeçalho, entre Aparência e Voltar): padrão ARIA de menu (foco no primeiro item, ↑↓/Home/End, Enter escolhe e
  devolve o foco ao botão, Esc fecha só o menu com `stopPropagation`, Tab e clique fora fecham); itens de
  liga/desliga são `menuitemcheckbox` com ✓ e a tecla ao lado. "Uma ideia por vez" e "Abrir ao lado" saíram da
  barra para ele (regra: o que não se usa em toda sessão vai para o menu, a paleta e o atalho; o modo foco fica).
  F1 agrupado: `Atalho.grupo` (`GRUPOS`: Navegação, Leitura, Marcar, Comparar, Livros, Geral), `porGrupo` e uma
  tabela por grupo no `Atalhos.svelte`; listas comuns aos dois formatos (`LEITURA`, `MARCAR`, `COMPARAR`): o F1 do
  PDF ganhou Ctrl+D, a barra de destaque e PageUp/PageDown. F6 anuncia o lado do foco ("Ao lado: <seção>, 45%";
  "Documento principal, página 12").
- **M26a-2** (branch `feat/m26a2-rotulos-que-cabem`): rótulos quando cabem. `lib/densidade.ts` (`medirRotulos`,
  puro): com rótulos, transbordar (`scrollWidth` > `clientWidth`) passa a só ícones e guarda quanto precisava; os
  rótulos voltam com 2rem de folga além disso (sem piscar). A moldura mede o cabeçalho e o rodapé (cada um por si)
  com `ResizeObserver` e `MutationObserver` (o conteúdo muda: página, estimativa, voz) e marca
  `.cabecalho-compacto`/`.rodape-compacto` (rótulos escondidos só da tela, `app.css`). Sem pontos de quebra fixos.
  Rodapé (sem o lado) em três colunas: a voz (`data-fim-rodape`) à esquerda, encostada, numa coluna
  `minmax(min-content, 1fr)` (encolhendo, a voz transbordava para baixo dos controles sem a medição perceber); os
  controles de página e zoom no centro; a estimativa e a meta (`.rodape-info`) à direita, cortadas com "…". Só no
  modo compacto o rodapé vira uma linha que quebra. Números de largura fixa: o campo da página do PDF com os
  dígitos do total, o zoom (6ch), a porcentagem do EPUB (4,5ch), `tabular-nums`; a `BarraPdf` não quebra sozinha.
- **M26b** (branch `feat/m26b-robustez`): arquivos problemáticos. Fixtures novas em `tests/fixtures/quebrados/`
  (geradas pelo `gerar.py`; os PDFs criptografados pelo `qpdf`): EPUB sem índice (entra) e com OPF inválido
  (recusado); PDF protegido só com senha de dono, AES e RC4 (entra com metadados: o `lopdf` lê com a senha vazia),
  com senha de usuário (entra com o nome do arquivo), com `startxref` errado (entra; o pdf.js reconstrói) e cortado
  (recusado: o pdf.js também não o abre). Mensagens: "o PDF está danificado ou incompleto" e "o EPUB está
  danificado: não foi possível ler o conteúdo" (a causa técnica fica na cadeia de erros, no log); ao abrir,
  `mensagemAoAbrir` (`lib/errosAoAbrir.ts`) troca o nome da exceção por uma frase. PDF com senha: `onPassword` do
  pdf.js → `PedirSenha.svelte` (não guarda a senha; `erradas` conta as recusadas: o alerta e o campo limpo a cada
  uma); Cancelar fecha e volta à biblioteca, sem erro (o pdf.js rejeita a abertura com o último motivo:
  `senhaCancelada`). Várias falhas de importação viram um aviso só. A capa de um PDF que não abre é tentada uma
  vez por sessão (`semCapa` no `App`), e o `gerarCapa` libera a tarefa do pdf.js mesmo quando falha. Roteiro de
  desempenho em `docs/testes/desempenho.md` (10 cenários e os arquivos problemáticos) e `scripts/memoria.sh`.
- **M26c** (branch `test/m26c-e2e`): testes E2E em `e2e/` (projeto próprio: WebdriverIO + `tauri-driver` +
  WebKitWebDriver), no app compilado, numa tela virtual (`xvfb-run`). Workflow `.github/workflows/e2e.yml`. Uma
  sessão do app por arquivo: `epub.e2e.js` (abrir, virar, F1, modo foco, destacar, lado a lado, voltar),
  `pdf.e2e.js` (abrir, texto, virar, destacar, "ao lado 3") e `senha.e2e.js` (Cancelar, senha errada e certa);
  14 testes, ~21 s. O livro chega por `tauri:options.args`, como no "Abrir com" (o WebDriver não alcança o diálogo
  de arquivo), e cada sessão usa `XDG_*` numa pasta temporária. Fixture `texto.pdf`. **Rodam aqui sem incomodar**:
  o Xvfb é invisível (requer `xorg-server-xvfb`; com o `cargo tauri dev` aberto, compilar em outra pasta e passar
  `FOLIO_APP`; `CARGO_TARGET_DIR` relativo é resolvido a partir de `crates/app`: usar caminho absoluto). Isso depende
  de o `wdio.conf.js` forçar `GDK_BACKEND=x11` e tirar `WAYLAND_DISPLAY`: sem isso, numa sessão Wayland, o GTK abre as
  janelas no compositor de verdade (e o tamanho e a escala não são os da CI). Ao falhar, um teste salva a captura em
  `e2e/falhas/` (artefato na CI) e registra o estado da página no log (`[falha]`). Armadilhas
  do WebKitWebDriver: `getText` não enxerga títulos com `text-overflow` (ler `textContent`, `texto()` em
  `specs/ajuda.js`); o seletor `aria/` acha também os itens da paleta fechada (procurar dentro do cabeçalho).
- **M26d** (branch `docs/m26d-orca`): roteiro do Orca reescrito (`docs/testes/orca.md`, 12 partes, com tudo o que
  entrou depois do M5). Revisão "tudo sem mouse": a lacuna era destacar no lado novo, então o **modo frase foi para
  os dois lados** (`LadoEpub`, `LadoPdf`: Ctrl+D sem seleção começa na frase da página; `temModoFrase`,
  `mudarTrecho`, `sairDoModoFrase`; a barra manda o Alt+↑/↓ ao lado certo). Regra comum em `trechoSeguinte`
  (`lib/frases.ts`) e camada de texto comum em `lib/pdf.ts`. A barra aberta no lado não oferece "Ouvir"
  (`barra.doLado`): a voz é só do principal, e no PDF leria o início da página dele. Os testes E2E cobrem o modo
  frase no lado. O foliate ignora navegação nos 100 ms seguintes a uma virada (`#locked`): nos testes, esperar.
  Rodapé com o lado aberto numa janela apertada (a captura da CI mostrou: 1000 px com o índice aberto): a `BarraPdf`
  sem `flex-wrap` transbordava para a outra metade e saía da janela. Agora os grupos dela entram direto na linha
  da metade (`display: contents`), que quebra sem invadir; "Página" é um `.rotulo`, e "[3] de 3" não quebra. O E2E
  confere que nada sai da metade nem da janela. **Falta executar o roteiro com o Orca** (só o Lucas).
- Próximo passo: executar o roteiro do Orca e corrigir o que aparecer; M26e (README, guia e licença) e M6b. Séries
  continua adiado.
