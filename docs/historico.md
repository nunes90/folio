# Histórico do Folio, marco a marco

O que cada marco entregou, com os detalhes de implementação e o que se aprendeu no caminho, na ordem em que
aconteceu. Até nov/2026 isto era a seção "Estado atual" do `CLAUDE.md`; saiu de lá para ele caber numa leitura
(M33a). Ao fim de cada marco, acrescente a entrada **aqui**, no fim. O que virar regra para o código novo vai
também para "Armadilhas conhecidas" ou "Convenções" do `CLAUDE.md`.

Entradas antigas citam arquivos que mudaram de nome ou saíram (o app se chamava "Leitor"; o suporte ao Orca foi
retirado em `chore/sem-orca`): são histórico, não instrução.

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
  confere que nada sai da metade nem da janela. A barra de destaque pertence a um lado (`barra.doLado`):
  `esconderDe(doLado)` só a fecha se o zoom ou a página mudarem naquele lado; ao abrir o lado, o principal refaz o
  zoom e fechava a barra do lado (só na CI: o WebKitGTK 2.52 entrega isso mais tarde que o 2.54).
  **Falta executar o roteiro com o Orca** (só o Lucas).
- **M26e** (branch `docs/m26e-licenca-readme`): licença **GPL-3.0-or-later** (`LICENSE`; `license` no Cargo, nos
  `package.json` e no `tauri.conf.json`). As dependências são todas permissivas (MIT, Apache-2.0, BSD, Zlib, OFL,
  MPL-2.0 por arquivo), então a escolha foi pelo projeto: um app, não uma biblioteca, e forks devem abrir o código.
  `scripts/avisos_de_terceiros.py` gera `THIRD-PARTY-NOTICES.md` dos lockfiles (o que vai no binário, com os textos
  de licença, sem repetir); vai no AppImage (`bundle.resources`) e é gerado de novo no workflow do AppImage. O
  arquivo commitado precisa existir: o `tauri build` falha sem o recurso. `Sobre.svelte` (paleta "Sobre o Folio"):
  versão, licença e aviso de garantia. `README.md` e `docs/guia.md`. A velocidade da voz, que só estava na seção
  Texto (o PDF não a tem), foi também para a seção Página no PDF e para a paleta (`comandosDaVelocidade`).
- **Queda com o Orca** (branch `fix/orca-crash-atributos`): o WebKitGTK (2.54) aborta o `WebKitWebProcess` quando um
  leitor de tela pede os atributos de texto (`GetAttributeRun`) de certos objetos; bug aberto do WebKit, muito
  provavelmente o 284246 (duplicata do 270354), sem símbolos para confirmar. O que derruba: um contêiner sem texto
  próprio com botões da mesma fonte e cor (`li > button`, `div[role=group] > button`) e versos com `<br>` e espaço antes
  de `</p>`. **Regra: contêiner só de botões não tem caixa própria**: `li { display: contents }` (segue item de lista
  na árvore) ou `<div class="grupo-barra"><div class="grupo-sem-caixa" role="group" …>`; `font-weight` diferente no
  botão não basta (a queda volta com botões vizinhos iguais). Nos livros, `tirarEspacoAposUltimaQuebra`
  (`lib/contornosWebkit.ts`, no `load` dos dois lados); outra marcação de livro ainda pode derrubar: o defeito é do
  WebKit. Teste: `./virtual.sh npm run test:leitor-de-tela` em `e2e/` (`atspi/rodar.sh`: barramento próprio, sem Orca;
  `atspi/percorrer.py` percorre cada tela e todas as seções do Dom Casmurro; passo na CI). `./virtual.sh` em vez de
  `xvfb-run … dbus-run-session`: sem portais (`XDG_DESKTOP_PORTAL_DIR` vazio), senão o `xdg-desktop-portal-hyprland` é
  ativado na sessão isolada e cai a cada execução.
- **Queda do processo da página** (branch `fix/recuperar-processo`): `crates/app/src/processo.rs` ouve o
  `web-process-terminated` do WebKitGTK e recarrega a página; o frontend pergunta ao iniciar (`processo_recuperado`,
  consome o valor), avisa como erro (`role="alert"`) e fica na biblioteca, sem reabrir o livro (poderia cair de novo;
  vale também para o livro do "Abrir com"). `core::recuperacao`: mais de 3 quedas em 60 s fecha o app (código 1; erro no
  log). Conferido à mão (`kill -9` no `WebKitWebProcess`, numa tela virtual): sem teste E2E, porque o WebDriver encerra a
  sessão quando a página cai.
- **M6b** (branch `ci/m6b-appimage-final`): `scripts/testar_appimage.sh` (`.desktop`, licenças, um livro aberto numa
  tela virtual: a sessão de leitura no banco prova que o leitor desenhou). O workflow do AppImage o roda em Ubuntu
  24.04, Debian, Fedora e Arch, em contêineres, e só depois anexa à Release. O AppImage não leva as bibliotecas gráficas
  do sistema (o linuxdeploy as deixa de fora); a `libGLESv2` é carregada durante a execução, e o README diz o que
  instalar se faltar. No Hyprland, a `class` da janela é `folio`, igual ao `StartupWMClass`.
- **v1.0.0-rc.1** (out/2026): tag assinada e Release como pre-release, com o AppImage da CI. A `v1.0.0` estável só depois
  do roteiro do Orca (decisão do Lucas).
- **Virada e painéis** (branch `fix/aparencia-e-virada`): virada padrão `nenhuma` (a preferência já gravada não muda).
  A rolagem horizontal da Aparência vinha de `.area-aparencia :global(.painel)`, que também pegava as seções internas
  (mesma classe): agora com `>`, e o E2E confere `scrollWidth`. O **AppImage leva o WebKitGTK do Ubuntu 22.04 (2.50.4)**;
  o sistema aqui tem o 2.54.1. O `for await` do `getTextContent` do pdf.js falhava no 2.50 (`permitirForAwaitEmStreams`).
- **Animações mais curtas** (na mesma branch): `DURACOES` = 100/140/200 ms (eram 160/280/450; o Lucas as achou lentas). A
  abertura do livro espera a transição: o tempo dela soma no de abrir. Com NVIDIA, o DMABUF continua necessário (com o
  driver 615 e o WebKitGTK 2.54, ligado, a janela fecha), e o AppImage não teve diferença perceptível do binário do sistema.
- **M6b concluído**: "Abrir com" pelo menu do sistema e AppImage no Hyprland com NVIDIA conferidos pelo Lucas (nov/2026).
- **PDF por trechos** (branch `perf/pdf-por-trechos`): o arquivo não passa mais inteiro para a página.
  `carregarPdfPorTrechos` (`lib/pdf.ts`: `PDFDataRangeTransport`, `disableAutoFetch`, `disableStream`, trechos de 256 KB) pede
  ao comando `trecho_livro` (`biblioteca::ler_trecho`; a biblioteca só é travada para achar o arquivo). Vale para abrir e
  para a capa. Medido num PDF de 86 MB, em tela virtual: abrir 1236 → ~740 ms. Virar uma página cujos dados ainda não
  vieram pode pedir trechos (máx. 31 → ~90 ms). Medições: `FOLIO_MEDIR=<pdf> ./virtual.sh npm test`, em `e2e/`.
- **Memória medida** (nov/2026, tela virtual): somar RSS engana (as bibliotecas contam em cada processo): usar PSS/anon de
  `/proc/<pid>/smaps_rollup`. Biblioteca vazia: ~221 MB de PSS nos três processos. O PDF grande custa na memória anônima
  do processo da página (52 → ~350 MB), que **não acompanha o tamanho do arquivo** (24 MB, 995 páginas: 357; 83 MB, 742
  páginas: 351). O sumário responde por 30–70 MB (resolve a página de cada entrada, para marcar a seção atual: mantido).
  12 ciclos de abrir e fechar: PDF oscila 458–664 MB sem subir em linha reta; EPUB +31 MB. Falta uma ferramenta de heap
  para os ~180 MB restantes. Liberar os canvas ao fechar não teve ganho acima do ruído (descartado). Filtrar 5.000 livros:
  ~7,7 ms por passada (sem debounce).
- Se o arquivo de um PDF aberto não puder ser lido, o leitor mostra o erro (`aoFalhar` em `carregarPdfPorTrechos`).
- **Interface como aplicativo** (branch `test/orca-sem-audio`): `<body role="application">`, porque no modo de navegação o
  Orca ficava com as setas e, ao percorrer os cards, derrubava o WebKitGTK. Caso mínimo da queda (posição por posição):
  `<div><button>x</button><span>Texto</span><!----></div><p>Depois</p>`: contêiner com objeto dentro, texto, último nó sem
  caixa (âncora do Svelte, `display: none`) e conteúdo depois. Ela segue possível com Orca+A na interface. O texto do
  livro é iframe ou `role="document"`: lá o Orca lê com as setas. **Ao foco no próprio `role="document"`, o Orca não diz
  nada**: focar algo dentro dele (F1: o título). O Índice ganhou ↑↓/Home/End. `./virtual.sh npm run orca` em `e2e/`: Orca real sem áudio
  (`orca/falas.tsv`); as teclas chegam ao app, não a ele, então atalhos parecem mudos ali (Ctrl+F no PDF fala na sessão real).
- **Avisos ao Orca** (branch `feat/falar-avisos`): `lib/regioesVivas.ts` observa `aria-live`/`status`/`alert` (`main.ts`; espera de
  150 ms, só o que entrou) e o comando `anunciar_ao_leitor_de_tela` (`crates/app/src/orca.rs`) chama `PresentMessage` no
  serviço D-Bus do Orca, sem abri-lo (`NO_AUTO_START`): voz e braille de quem usa; sem o Orca, nada. Conferido no 51
  (`org.gnome.Orca1.Service`); versões sem o serviço seguem mudas. Paleta: o status traz a opção ativa. `recuperarFoco`
  (`lib/foco.ts`) depois de fechar diálogo ou de ação em livro: `setTimeout`, porque a restauração do `<dialog>` vem depois do `close`.
  No F1, as setas andam pelas linhas e o texto vai ao anúncio (o Orca não lê `tr` com foco; o modo foco ou de navegação ao abrir varia
  na sessão real, sem causa achada). Na `BarraPdf`, só o zoom pedido nos botões é anunciado.
- **Texto acessível do PDF** (branch `feat/pdf-texto-acessivel`): o Orca não percorre a camada de texto do pdf.js no WebKitGTK
  (o `↓` saía do documento ou repetia o número da página). A `.pdfViewer` é `aria-hidden` e, ao lado, `.texto-acessivel` (fora da
  tela, 40rem de largura, para haver linhas de verdade) tem a página atual em parágrafos (`paragrafosDaCamada`, na ordem de
  `blocosDaCamada`), com "Página N de T" e um fim que diz o que fazer. Só no principal, não no lado.
- **Queda do card ao voltar do leitor**: reproduzida (biblioteca com vários livros, depois de ler um PDF até o fim) e reduzida a
  `<ul><li><div><div><button><svg aria-hidden></svg></button></div></div></li><li></li></ul>`. O `Icone` tem `role="img"` além
  do `aria-hidden` (sem efeito para o leitor de tela; o axe aceita), e a queda some. O `percorrer.py` pede posição por posição
  também nos itens de lista: ao focar um livro, mesmo no modo foco, o Orca pede os atributos da linha do item.
- **v1.0.0-rc.2** (nov/2026): tag assinada e Release como pre-release, com o AppImage da CI.
- **Orca com voz real** (nov/2026): as partes principais do roteiro (biblioteca, paleta, índice, F1, avisos, leitura do EPUB e do
  PDF); o roteiro inteiro de `docs/testes/orca.md` (12 partes) não foi repetido.
- **v1.0.0** (nov/2026): tag assinada e Release estável, com o AppImage da CI.
- **M27a** (branch `feat/m27a-kokoro-core`): voz neural, síntese no core (`core::kokoro`). Kokoro v1.0 int8
  (`model.int8.onnx`, `voices.bin` cru com 54 vozes × 510 estilos × 256 `f32`, `tokens.txt`) no ONNX Runtime pela
  `ort` (=2.0.0-rc.15, `load-dynamic`, `api-31`): a `libonnxruntime.so` oficial da Microsoft (1.31, MIT, glibc 2.28)
  é baixada junto com a voz e carregada durante a execução. O binário que a `ort` baixaria ao compilar exige a glibc
  2.38 (`__isoc23_strtol`) e não ligaria no Ubuntu 22.04 do AppImage. Fonemas: `EspeakNg::carregar` carrega a
  `libespeak-ng.so.1` com `libloading` e devolve sempre o mesmo `Arc` (iniciar o espeak-ng duas vezes ao mesmo
  tempo derrubou o processo; as chamadas passam por um `Mutex`, porque ele tem estado global). Sem as duas
  bibliotecas, o app abre e só a voz neural falta; `fonemas_com_pontuacao` devolve a pontuação que o espeak-ng engole (não
  corta "3.5" nem "1,000"); trocas do inglês (r → ɹ…). `Vocabulario` (`tokens.txt`, a linha do espaço é "  16"),
  `dividir` (até 510 tokens, corta na pontuação ou no espaço), `Vozes::estilo(voz, tokens)`, `VOZES`,
  `idioma_da_voz` (a primeira letra). `Kokoro::carregar(pasta, fonemizador)` e `sintetizar(frase, voz, velocidade)`
  → `Vec<f32>` a 24 kHz. Testes reais: `FOLIO_KOKORO=<pasta> cargo test -p folio-core --release -- --ignored
  kokoro_de_verdade espeak_de_verdade` (a pasta precisa ter também a `libonnxruntime.so`). `deny.toml`: ISC
  (libloading). A sherpa-onnx 2.0 foi descartada (sem espeak-ng, pula palavras fora do dicionário).
- **M27b** (branch `feat/m27b-motor-neural`): `core::voz_neural` — `MotorNeural` (implementa `MotorDeVoz`): uma thread
  sintetiza frase a frase (`frases_do_ssml`: o `<s><mark/>…</s>` do frontend) e põe na fila da saída um aviso (a marca)
  e o áudio; o aviso dispara quando a saída chega nele, então o destaque acompanha a voz. Cada `falar`/`parar` aumenta a
  `geracao` e limpa a saída: o que a thread ainda gerava de um bloco antigo é descartado. O modelo e a saída (rodio,
  `SaidaRodio`) só são criados na primeira fala (~0,7 s); se falhar, `Interrompido`. Velocidade: `2^(v/100)`.
  Sintetizador e saída são traits (testes com falsos). `core::voz_por_idioma` — `MotorPorIdioma` (`escolher`: "en",
  "en-*" à neural se houver; o resto e sem idioma ao sistema): troca de motor para o anterior e só deixa passar os
  eventos do motor em uso (um `Interrompido` atrasado pararia a leitura). Temporário até o M27c:
  `FOLIO_VOZ_NEURAL=<pasta do modelo>` (e `FOLIO_VOZ_NEURAL_VOZ`, padrão `af_heart`) liga a voz. O app passa a precisar
  da `libasound.so.2` (ALSA); `libasound2-dev` nos workflows. Testado pelo Lucas com áudio real num EPUB em inglês.
- **M27c-1** (branch `feat/m27c-catalogo-vozes`): `core::catalogo_vozes` (`Modelo`, `Arquivo`, `VozDoCatalogo`;
  `KOKORO` com URLs do Hugging Face presas a um commit e o `.tgz` oficial do ONNX Runtime 1.31.1 da arquitetura, de que
  só saem a `.so`, a licença e os avisos; 5 vozes em inglês: Heart, Bella, Michael, Isabella, George; a Emma saiu, ver abaixo). `core::baixar`:
  `baixar_modelo(rede, modelo, vozes, progresso, cancelar)` grava em `<id>.parcial/`, confere tamanho e SHA-256 enquanto
  chega e renomeia no fim (instalado = a pasta existe); `RedeHttp` = `ureq` com os certificados do sistema
  (`platform-verifier`, provedor ring). `cargo deny` agora só olha os alvos Linux (`[graph] targets`): a
  `webpki-root-certs` (CDLA) só entra no wasm32. `MotorNeural::configurar(Option<ConfigNeural>)` (pasta recarregada
  só se mudar; a voz vai em cada fala), `amostra(texto, voz)` sem eventos, e modelo e saída de som fechados depois de
  `OCIOSO` = 2 min sem falar. `MotorDeVoz::disponivel` (a neural só com o modelo baixado); `MotorPorIdioma::usar_neural`.
  Preferências `vozNatural` (vazio = padrão; fora do catálogo volta ao padrão) e `vozNaturalEmIngles` (padrão sim).
  App: `voz_natural.rs` (`EstadoVoz`: o motor por idioma, o neural e `<dados>/vozes`; `aplicar(preferencias)` no
  início, ao salvar as preferências, ao baixar e ao remover); comandos `vozes_naturais` (catálogo, instalado, baixando,
  espeak-ng presente), `baixar_voz_natural` (thread; evento `voz-natural`: progresso a cada 150 ms, concluído,
  cancelado, falhou), `cancelar_download_voz`, `remover_voz_natural`, `ouvir_amostra_voz`. O `FOLIO_VOZ_NEURAL` saiu.
  O PDF manda o idioma do arquivo (`/Lang`, `info.Language` do pdf.js, conferido por `idiomaValido`: há PDFs com lixo
  ali); sem ele, vai ao sistema.
  Teste real do download: `FOLIO_BAIXAR=<pasta> cargo test -p folio-core --release -- --ignored kokoro_baixado`
  (152 MB em ~5 s aqui).
- **M27c-2** (branch `feat/m27c2-secao-voz`): `lib/vozNatural.svelte.ts` (estado único do app, `vozNatural`: catálogo,
  `espeak`, `baixando` com o andamento do evento `voz-natural`, `mudancas` a cada instalação ou remoção; `baixar`,
  `cancelar`, `remover`, `amostra`; avisos de instalada, cancelada e falha). O download continua com o painel fechado.
  `PainelVoz.svelte` = seção "Voz" do painel Aparência, a última nos dois formatos: a velocidade (saiu de Texto e de
  Página), e a voz natural: baixar (botão primário com o tamanho), barra de progresso com "Cancelar o download", e,
  instalada, "Usar a voz natural em livros em inglês", as vozes (rádio com idioma e gênero), "Ouvir amostra (<voz>)" e
  "Remover a voz natural…" com confirmação no próprio lugar. Sem o espeak-ng, diz o que instalar em vez de oferecer o
  download. Paleta (`comandosDaVozNatural`, grupo Voz): baixar, cancelar (com a %), "Voz: <nome>" (a atual marcada),
  amostra, usar/não usar em inglês, remover. Os leitores perguntam de novo `voz_disponivel` quando `mudancas` muda.
  `AvisoDePreparo`: "Preparando a voz…" se a primeira marca demorar mais de 400 ms (ao começar e ao retomar: depois de
  2 min o modelo fecha). Testes simulam o Tauri com `vi.mock("@tauri-apps/api/core")` (primeira vez no projeto).
  Achado no teste do Lucas: as vozes britânicas não falavam, porque `espeak_SetVoiceByName` quer o nome do **arquivo**
  da voz (`gmw/en` → "en"; `roa/fr` → "fr"), não o código do idioma ("en-gb" falha); `idioma_da_voz` corrigido e o
  teste real confere todas. E toda frase falhando virava um laço: o motor pulava a frase sem som mas emitia a marca e
  o fim, e o frontend atravessava o livro mudo. Agora voz ou idioma desconhecido interrompem na hora, um bloco em que
  nada falou para (`Interrompido`), e a marca de uma frase que falhou antes de alguma falar não sai. Logs da `ort`
  só a partir de `warn` (o `info` dela despejava centenas de linhas ao carregar o modelo).
  **Qualidade do som**: a saída abre já a 24 kHz mono (`SaidaRodio::abrir`; se o dispositivo recusar, a padrão). Na taxa
  do dispositivo (48 kHz no PipeWire daqui), o rodio 0.23 convertia por interpolação linear, que deixa réplicas acima de
  12 kHz: a voz soava áspera. Assim quem converte é o servidor de som, com um reamostrador de qualidade (teste
  `saida_de_som_na_taxa_do_modelo`, ignorado, só abre a saída). **Amostra com feedback**: `MotorNeural::amostra` espera
  o áudio entrar na fila e devolve a duração (`Trabalho.pronto`; se nada falar, `ErroVoz::NaoFalou`); o comando é
  `async` e devolve os ms. `vozNatural.amostraAtual` (preparando → tocando pela duração → nada); o botão mostra
  "Preparando a voz…" (girando, `aria-busy`) e "Tocando <voz>…" (ondas), com um `role="status"` só para o leitor de
  tela; da paleta, `avisarSeDemorar`.
  **int8 × fp32** (medido aqui, mesma frase e voz, pelo nosso código; `kokoro_gerar_wav`, teste ignorado que gera um WAV
  e mede o tempo): o fp32 do mesmo autor (`csukuangfj/kokoro-multi-lang-v1_0`, 325 MB, mesmas entradas e `voices.bin`)
  gera ~4,2× o tempo real contra ~3,7× do int8, e o som medido é praticamente igual. Nos "s" os dois põem ~90% da
  energia entre 8 e 12 kHz (é do vocoder), mas ouvindo os WAVs pelo `pw-play` o Lucas achou bons, com e sem passa-baixa.
  Fica o int8 (download menor). O chiado que ele sentiu no começo da fala era a voz Emma (ver "Chiado da voz").
- **M27c concluído.**
- **Chiado da voz** (branch `fix/voz-isabella`): era a Emma (`bf_emma`), não o app. Gravado por uma saída de som
  virtual (`pactl load-module module-null-sink`; `PIPEWIRE_NODE=<nome>` leva a saída do rodio até ela; `parec` grava
  o monitor), o som do app bate com o do modelo (< 1 dB por janela, sem ruído no começo). Ouvindo o mesmo trecho em
  todas as vozes, a Emma chia (ruído de fundo nos agudos) e um passa-baixa não a limpa; a **Isabella** (`bf_isabella`)
  entra no lugar (quem tinha a Emma volta à voz padrão). O teste ignorado `tocar_de_verdade` toca uma frase pela saída
  do app; `kokoro_gerar_wav` aceita uma frase por linha e `FOLIO_KOKORO_VELOCIDADE`. Uma frase que falha (fora voz ou
  idioma desconhecidos) é tentada mais uma vez: o ONNX Runtime deu uma vez "GetElementType is not implemented" numa
  frase longa que, repetida depois, sempre saiu.
- **M27d-1** (branch `feat/m27d-normalizar`): `kokoro::normalizar_ingles` (só nas vozes em inglês, antes do espeak-ng;
  `regex`): moeda ("$5.50" → "5 dollars and 50 cents", "£3.5M" → "3.5 million pounds"), anos de 1001 a 1999 e de 2010 a
  2099 por extenso ("nineteen oh five"; o espeak-ng lia "nineteen hundred ninety nine"; não depois de page/p./No./line,
  nem colado a outro número ou a %), décadas ("1990s", "’60s"), romanos depois de Chapter/Part/Book/War… ("Chapter 4") e
  de nomes, com 2+ letras ("Henry the 8th"; o "I" sozinho é o pronome), abreviações que ele não conhece (Nov., p.,
  pp., vol., fig., No. antes de número, St. antes de nome, e.g., i.e.) e travessão entre números ("to"). Números
  seguem em algarismos onde o espeak-ng os lê bem. `pedacos_da_frase` (motor): frase acima de 150 caracteres é
  falada em pedaços cortados depois da pontuação seguida de espaço (vírgula, ponto e vírgula, dois-pontos, travessão,
  fim de frase), nenhum com menos de 40; cada pedaço vai à fila quando fica pronto (a fala começa antes) e a marca
  sai antes do primeiro. Uma corrida no teste da amostra (falhava às vezes) corrigida.
- **M27d-2** (branch `feat/m27d2-appimage-espeak`): o AppImage leva um espeak-ng próprio em `usr/lib/folio/espeak-ng`
  (biblioteca, `espeak-ng-data` só com os dicionários do inglês e do português, `COPYING`, `LEIA-ME` com a versão e o
  código). O workflow o compila (1.52.0, tarball conferido por SHA-256, CMake sem som, mbrola, sonic, klatt,
  speechplayer, async nem dicionários extras: o pacote do Ubuntu puxaria o PulseAudio e uma dúzia de bibliotecas) e o
  põe no AppImage por `--config` (`bundle.linux.appimage.files`; no `tauri.conf.json` o build local falharia sem a
  pasta). `EspeakNg::carregar(None)` procura `<exe>/../lib/folio/espeak-ng` antes do sistema (`pasta_embutida`) e diz
  no log qual carregou. `testar_appimage.sh` confere os arquivos e que o `ldd` não acusa falta.
- **M27d-3** (branch `docs/m27d3-adr-voz`): ADR 0008 (voz natural: Kokoro int8 no ONNX Runtime oficial carregado
  durante a execução, o espeak-ng para a pronúncia e embutido no AppImage, download conferido, escolha por idioma, e o
  que foi descartado: sherpa-onnx, o ONNX Runtime da `ort`, o pacote do espeak-ng do Ubuntu, o fp32, a Emma). Guia
  (seção Voz na Aparência, as duas vozes, a pasta `vozes`, a internet só no download), README (a voz natural;
  `libasound2-dev` para compilar) e o roteiro do Orca (9.5–9.12: seção Voz, download, vozes, amostra, remover,
  leitura por idioma, paleta). 9.5–9.12 executados com o Orca sem áudio (ver "Roteiro da voz com o Orca").
- **M27d concluído.**
- **Idioma pelo texto** (branch `fix/idioma-pelo-texto`): a maioria dos PDFs não declara `/Lang` no catálogo (5 dos 8
  da biblioteca daqui; o "Learn C Programming" tem lixo no campo e o `/Lang` só nas marcações internas, que o pdf.js
  não expõe), e sem idioma a leitura ia à voz do sistema. `lib/idioma.ts`: `idiomaDoTexto` (en, pt, es, fr, de pelas
  palavras curtas mais comuns de cada um; `null` com menos de 30 palavras, com menos de 10% delas comuns ou sem
  vencer o segundo por 2×). O `LeitorPdf` junta o texto de até 6 páginas a partir da salva (`getTextContent`, sem
  desenhar) até dar para dizer; no log, "idioma do PDF: …". Conferido com os PDFs da biblioteca pelo pdf.js no Node.
- **pt-BR** (branch `feat/ptbr-voz`): a **Dora** (`pf_dora`) no catálogo (das três vozes do Brasil, a que soou boa
  num trecho de livro). `kokoro::normalizar_portugues` (`normalizar_pt.rs`, usa `re`/`substituir`/`romano` do
  `normalizar`): todo número solto por extenso (`por_extenso`, até 999 trilhões, "e" antes do último grupo só se
  < 100 ou centena redonda; feminino para horas e libras), porque o espeak-ng juntava "mil oitocentos e sessenta e
  nove" numa palavra só nos fonemas e o modelo tropeçava; ponto de milhar e vírgula decimal; não em versões,
  "10:30", "1º" nem colados a letras. Moeda ("R$ 5,50" → "cinco reais e cinquenta centavos"; "R$ 3,5 milhões" → "…
  de reais"), romanos depois de capítulo/século… (cardinal) e de nomes (ordinal até 10: "Dom Pedro Segundo", "Luís
  Catorze"; "I" sozinho vale, "V"/"X" não), "D." → Dom/Dona, Sr./Sra./Dr./Profa./pág./p./nº/séc., "10h30", "50%".
  Motor: `ConfigNeural.vozes` (idioma base → voz; `voz_para`), `Trabalho.voz`; `MotorPorIdioma::usar_neural_em`
  (os idiomas ligados) e `idioma_base`; `Modelo::voz_do_idioma`/`idiomas`. Preferência `vozNaturalEmPortugues`
  (padrão sim); `vozNatural` é só do inglês (uma voz de outro idioma volta à padrão). Seção Voz: um grupo por
  idioma ("Livros em inglês": caixa, rádios e amostra; "Livros em português": caixa, "Voz: Dora" e amostra). Paleta:
  "Ouvir amostra da voz em português", "Usar/Não usar a voz natural em livros em português". Amostra em português.
  Ouvido pelo Lucas no app: a Dora apitava no "s" (metálico) → `kokoro::corte_da_voz` (8 kHz só nela; 6 kHz abafava)
  e `filtro::passa_baixa` (Butterworth de 4ª ordem, duas biquads). E o Dom Casmurro soava picado: cada pedaço do
  corte do M27d-1 é sintetizado sozinho e o modelo fecha a entonação no fim dele (a pausa na emenda era a mesma da
  frase inteira; era a entonação). O `pedacos_da_frase` (150/40) saiu: agora `cortar(frase, cabe)` só corta se a
  frase não ficaria pronta antes de a fila acabar; o motor estima o fim da fila (`fim_da_fila`) e os segundos por
  letra (média com a medida anterior, começa em 0,02) e dá `FOLGA` = 400 ms. No começo de um parágrafo (fila vazia),
  só a primeira oração vai antes; com ela tocando, o resto cabe. Ainda picado: o `Intl.Segmenter` corta onde não é
  fim de frase ("—Abaixo ou acima?" | "perguntou-lhe tio Cosme", "—D." | "Gloria…", "mamãe!" | "» Ella"; 212 vezes
  no Dom Casmurro). O motor junta essas frases (`juntar_frases`: a seguinte em minúscula ou com a aspa de fecho, ou a
  anterior numa abreviação ou inicial) e sintetiza de uma vez; a marca de cada uma vai no ponto do áudio estimado pela
  proporção das letras (`dividir_audio`). O modo frase segue a mesma regra
  (`continua` em `lib/frases.ts`, no `frasesDe`: EPUB e PDF), e a voz do PDF, que usa essas frases, também.
  E o `tts.js` do foliate-js (as frases da voz no EPUB) não trocava as quebras de linha do XHTML por espaço, como o
  `lib/frases.ts` já fazia: cada linha do Dom Casmurro virava uma frase (alteração local, `PATCHES.md`).
  Ferramenta: `fonemas_de_uma_frase` (ignorado).
- **Voz sem espera entre parágrafos** (branch `feat/voz-preparar`): cada bloco novo esperava o modelo gerar a primeira
  frase (0,4 a 1,2 s; no diálogo do Dom Casmurro, toda hora). `MotorDeVoz::preparar(ssml, config)` (padrão: nada; o
  `MotorPorIdioma` manda ao motor do idioma, sem trocar o em uso) e o comando `preparar_voz` (`prepararVoz` em
  `lib/voz.ts`), chamado logo depois de `falar` com o bloco seguinte. O `MotorNeural` o põe na fila sem aumentar a
  geração (não interrompe): depois de gerar o bloco atual, gera o começo do seguinte (`cortar` com o tempo que falta
  tocar) e o guarda num lugar só (`Preparado`); o `falar` seguinte o usa se a voz, a velocidade e o começo do texto
  baterem (`comeco_pronto`; no log, "começo preparado usado" em debug). EPUB: `TTS.peekNext` (alteração local no
  `tts.js`: o bloco seguinte sem avançar nem mexer nas marcas); no fim do capítulo, `lib/vozNaSecao.ts` carrega à parte a
  próxima seção linear (`createDocument` do foliate-js, sem ir até ela) e pega o primeiro bloco com texto de um `TTS`
  temporário (branch `feat/voz-preparar-capitulo`). PDF:
  `prepararSeguinte` (o resto da página ou o começo da seguinte, se a camada de texto dela já existir).
- **Roteiro da voz com o Orca** (branch `fix/voz-com-orca`): os passos 9.5–9.12 rodam com o Orca de verdade, sem áudio
  (`ORCA_SPECS=voz ./virtual.sh npm run orca` em `e2e/`; `e2e/orca/voz.e2e.js`; baixa a voz duas vezes). A voz natural fala por
  um ALSA nulo (`e2e/orca/asound.conf`, via `ALSA_CONFIG_PATH`, só nessa sessão); `ORCA_SPECS` escolhe os roteiros e
  `ORCA_GUARDAR_LOG=<arquivo>` guarda o log do Orca (apagar depois). Fixtures `ingles.epub` e `espanhol.epub` (`gerar.py`).
  Achados e corrigidos: **duas quedas do WebKitGTK** (mesma família do `atspi/rodar.sh`; o Orca pede os atributos de texto
  do grupo "Voz natural" na posição do objeto focado): (1) no download, com o rótulo "Baixando… X MB de 154 MB" mudando a
  cada 150 ms (o texto acessível muda e a posição fica velha; o `aria-hidden` não tira o texto do grupo no WebKitGTK) e o
  bloco terminando em barra + botão: agora o rótulo é fixo ("Baixando a voz natural (154 MB)", só o valor da barra muda,
  de 10 em 10%: o Orca anuncia cada mudança, mesmo com o foco em outro lugar)
  e o bloco é `display: contents`; (2) ao focar "Remover a voz natural…", o último objeto do grupo: o status da amostra
  foi para depois dele. **Regras**: num contêiner com texto, nada do texto acessível muda enquanto o leitor de tela pode
  estar nele, e um objeto focável não fica por último (algo depois dele). As sondas AT-SPI (posição por posição) não
  reproduziram a (2): o diagnóstico foi com o Orca real e variações do DOM aplicadas no teste. **Foco**: "Baixar" →
  "Cancelar o download" → a primeira opção da voz (concluído) ou "Baixar" (cancelado); "Remover…" → o "Cancelar" da
  confirmação (com a pergunta em `aria-describedby`) → "Remover…" de novo ou, removida, "Baixar". O aviso de instalada
  cita o português; o modelo fica instalado já no aviso de concluído (antes, "Baixar" piscava até o catálogo voltar).
  **"Ler em voz alta" na capa não fazia nada**: a seção só com a imagem não tem bloco, o `tts.from` do foliate-js lança e o
  "Preparando a voz…" ficava na tela; agora `blocoInicial` (`lib/vozNaSecao.ts`) segue ao próximo capítulo, e um erro
  ao começar a ler (EPUB e PDF) para a leitura e anuncia o motivo (`textoDaFalhaDaVoz`: "não há voz para o idioma es").
- **Voz sem o Orca por cima** (branch `fix/voz-sem-atropelar`): ouvido pelo Lucas com o Orca ligado, as falas do Orca
  atropelavam a voz natural. Amostra: o status dizia "Tocando a amostra de <voz>." quando ela começava, e o nome do
  botão mudava ("Preparando a voz…", "Tocando <voz>…"); agora o nome é fixo (só o ícone muda) e o status só diz
  "Preparando a voz…" se a geração passar de 400 ms. Leitura: "Ler em voz alta" e "Pausar/Continuar leitura" são o
  mesmo botão (o foco não cai no body ao começar) e "Parar leitura" devolve o foco a ele; o `AvisoDePreparo` espera
  1 s (era 400 ms: o modelo aberto gera a primeira frase em 0,4–1 s, e o aviso saía junto com a voz). Conferido com
  o Orca real (`voz.e2e.js`, passos 9.10d): ao começar pelo rodapé, o Orca não fala nada.
- **Slider de posição** (branch `feat/slider-posicao`): `Posicao.svelte` no rodapé, entre ‹ e ›, nos dois formatos e
  nos dois lados (EPUB: 0–1000, décimos de 1%; PDF: as páginas, dentro da `BarraPdf`). Arrastar mostra um balão com o
  destino (`textoDaFracao`/`textoDaPagina` em `lib/posicao.ts`: "78% · Capítulo", "Página 42 de 300 · Seção") e navega
  ao soltar; no teclado (`valorPelaTecla`: ←/→ e ↑/↓ um passo, PageUp/PageDown um décimo, Home/End; → volta em livro
  RTL) os passos se somam e só navega 350 ms depois da última tecla, sem balão (texto que muda perto do foco derruba o
  WebKitGTK com o Orca; o leitor de tela ouve o `aria-valuetext`); a tecla não chega ao leitor (não vira a página).
  O valor escolhido fica até o livro chegar (ou 1,5 s). Capítulo de um ponto no EPUB: `rotuloNoPonto` (o `itemAtual`
  do sumário) sobre `posicoesDoIndice`; o índice de muitos EPUBs aponta para âncoras dentro de poucos arquivos (o Dom
  Casmurro: 153 entradas em 4), então, depois de abrir, cada seção com 2+ entradas é carregada à parte uma vez
  (`createDocument`) e `fracoesDasAncoras` acha o ponto de cada âncora numa passada pelo texto. **O paginador do
  foliate-js ignora, sem erro, um `goTo` nos 100 ms seguintes a uma virada** (`#locked`): `irParaFracao` confere pelo
  número de `relocate` e tenta de novo. No WebKitGTK, o `input[type=range]` mede 129 px no cálculo do grupo
  (flex-basis não vale): o slider tem `width: 14rem` e encolhe; o grupo de páginas da `BarraPdf` também encolhe (com o
  lado aberto, transbordava a metade). Paleta do EPUB: "37%" → "Ir para 37% do livro" (`irParaPorcentagem`). F1:
  linha do slider em Navegação. Conferido com o Orca real (passos 3.10 e 4.8 de `orca/epub.e2e.js` e `pdf.e2e.js`).
- **Sem o Orca** (branch `chore/sem-orca`): saíram `orca.rs` e o comando `anunciar_ao_leitor_de_tela`, `lib/regioesVivas.ts`,
  `e2e/orca/`, `e2e/atspi/`, os specs `leitor-de-tela*` (e o passo da CI) e `docs/testes/orca.md`. Os contornos já no código
  ficaram. Tudo descrito em `docs/leitor-de-tela.md`, com o commit (`b3aaf78`) para recuperar os arquivos. As entradas
  acima que citam esses arquivos são histórico.
- **Alex** (branch `feat/voz-alex`): a voz masculina do português (`pm_alex`), ouvida de novo pelo Lucas e aprovada, com o
  mesmo passa-baixa de 8 kHz da Dora (`corte_da_voz`). Preferência `vozNaturalPortugues` (vazio = Dora; só uma voz do
  português, senão volta à padrão: `voz_do_idioma` no core), aplicada em `voz_natural.rs`. Frontend: `IDIOMAS_DA_VOZ`
  ganhou `escolha` (a preferência da voz de cada idioma); o grupo do português passa a ter rádios; paleta "Voz em
  português: Alex".
- **M28 — clareza** (revisão de design, sem recursos novos; PRs: componentes, Ajustes rápidos + Preferências, leitor e
  biblioteca em todos os tamanhos de tela). Capturas: `FOLIO_TELA=2600x1600 FOLIO_CAPTURAS=<pasta> ./virtual.sh npm test`
  em `e2e/` (`specs/capturas.e2e.js`: biblioteca, EPUB, Aparência e PDF em 360, 600, 800, 1000, 1400 e 2560 px;
  `FOLIO_TAMANHOS` escolhe; `FOLIO_TELA` aumenta a tela virtual do `virtual.sh`).
- **M28a** (branch `feat/m28a-componentes`): **botões em três variantes no `app.css`** — padrão (secundário: `--card`,
  borda `--divisoria`, `--raio`), `.primario` (destaque; um por superfície) e `.discreto` (sem caixa até o ponteiro);
  no alto contraste, borda forte. As 6 cópias locais do `.primario` saíram; "Continuar lendo" (cartão e meta) é primário.
  **`fieldset` sem caixa** (global): `legend` pequena, em `--suave`, e espaço, em vez de borda dentro do painel.
  Com `pointer: coarse`, alvos de 44 px. Regra: componente novo não inventa botão nem grupo; usa estes.
- **M28b** (branch `feat/m28b-abas-aparencia`): a Aparência em **três abas** (`AbasAparencia`): Leitura (a página e,
  no EPUB, o texto, tudo aberto: decisão do Lucas), Voz e Interface (cores, animações e as barras do modo foco, que
  saíram da Página). Na biblioteca, só Voz e Interface (abre na Interface). A aba é lembrada enquanto o app está aberto
  (`lib/aparencia.svelte.ts`; abrir na biblioteca não muda a escolha). Um diálogo de Preferências foi descartado: cobre
  o livro e a prévia ao vivo é o que faz a Aparência útil. `Abas.svelte`: abas genéricas (ARIA, setas, Home/End; do
  tamanho do nome). Escolhas compactas no `app.css`, com rádios de verdade: `.segmentado` (poucas opções curtas:
  animações, virada, exibição do PDF, colunas, alinhamento) e `.amostras` (grade de cartões: cor da página e da
  interface; a linha `.ajuda` embaixo diz o que a escolhida faz).
- **M28c** (branch `feat/m28c-leitor-tamanhos`): o leitor em todos os tamanhos. O índice só começa aberto em janela
  larga (`sistema.larga`, `min-width: 75rem`, fora da estreita): a 1000 px tomava um terço do livro. Painéis laterais
  com `clamp` (índice 18–24rem, Aparência 20–26rem). Rodapé compacto: a `.barra` do PDF se desfaz em grupos e o das
  páginas tem base de 15rem e cresce (o slider encolhe antes de quebrar): a 600 px, uma linha; a 360 px, duas (voz e
  páginas; zoom). Busca do PDF na janela estreita: lupa (`aria-expanded`) que abre o campo por cima do cabeçalho; Esc
  ou ✕ fecham e devolvem o foco à lupa (o Esc não segue para a moldura); Ctrl+F e a paleta chamam `abrir()`.
- **M28d** (branch `feat/m28d-biblioteca-tamanhos`): no card, só a estrela (favorito) e o ⋯; "Para ler", "Lido" e
  "Coleções" ficam no menu (que já os tinha), e a situação diz "Para ler" num livro marcado e não começado. Grade com
  `minmax(clamp(8.5rem, 10vw, 13rem), 1fr)` e espaço com `clamp`: duas colunas a 360 px, capas maiores numa tela de
  2560. Janela estreita (`main.estreita`): título e ações só com ícones numa linha, a busca inteira na de baixo.
- **M28 concluído** (nov/2026; PRs #114–#117, revisado pelo Lucas no app).
- **M27e-1** (branch `feat/m27e-piper-core`): Piper no core (`core::piper`). Licenças levantadas voz a voz (o
  `MODEL_CARD` de cada uma e o da voz de onde ela foi ajustada): **nenhuma do pt-BR é limpa** (faber, cadu e jeff vêm da
  lessac, cuja licença Blizzard 2013 é só para pesquisa; edresson vem da ryan, CC BY-NC-SA), e no inglês só as treinadas
  do zero com dados em domínio público (Kristin, LJSpeech, Norman, Cori; John vem da Kristin). Ouvidas pelo Lucas: entram
  **Kristin, LJSpeech, Norman e John** (a Cori não). `ConfigPiper::ler` (o `.onnx.json`: taxa, voz do espeak-ng,
  `phoneme_id_map`, escalas), `ids_dos_fonemas` (`^`, cada símbolo seguido de `_`, `$`; símbolo desconhecido é pulado),
  `Piper::carregar(modelo, onnx_runtime, fonemizador)` e `sintetizar(frase, velocidade)` (entradas `input`,
  `input_lengths`, `scales` = ruído, duração ÷ velocidade, ruído_w; 22 050 Hz). Fonemas: `fonemas_pontuados` (o de
  antes, sem as trocas do Kokoro, que agora ficam só em `fonemas_com_pontuacao`). Medido aqui: ~32× o tempo real (o
  Kokoro, ~3,4×). Ferramenta: `piper_gerar_wav` (ignorado; `FOLIO_PIPER`, `FOLIO_ONNX_RUNTIME`, `FOLIO_PIPER_WAV`).
- **M27e-2** (mesma branch): as vozes do Piper no app. Catálogo: `Modelo.tipo` (`Tipo::Kokoro | Piper`), uma voz por
  modelo (`voz_piper!`; `piper-en_US-<voz>-medium`, arquivos presos ao commit `e7229f7` do `rhasspy/piper-voices`:
  `modelo.onnx`, `modelo.onnx.json`, `MODEL_CARD` e o ONNX Runtime em cada pasta). `ConfigNeural` troca `pasta` por
  `pastas` (a de cada voz baixada; `pasta_da_voz`): o motor carrega o modelo da voz do trabalho e o troca quando outra
  pede (a fábrica escolhe Piper se a pasta tem `modelo.onnx`). `Sintetizador for Piper` reamostra 22 050 → 24 000 Hz
  (`kokoro::reamostrar`, sinc com janela de Blackman e pesos por fase). `catalogo_vozes::vozes_instaladas` e
  `vozes_dos_idiomas` (puras): em cada idioma, a escolhida se baixada, senão a primeira baixada; `EstadoVoz::aplicar` as
  usa. Aba Voz: "Livros em inglês/português" aparecem com qualquer voz baixada (rádios com as do Kokoro e do Piper; a do
  Piper diz "leve"); "Voz natural" (o Kokoro) e "Vozes leves" (uma linha por voz: Baixar, ou Remover com confirmação);
  um download por vez. `lib/vozNatural.svelte.ts`: `vozesInstaladas`, `idiomasInstalados`, `vozEscolhida(modelos, …)`
  (a mesma regra do core), `textoDeInstalado`; paleta "Baixar/Remover a voz leve <nome>".
  **Um ambiente do ONNX Runtime por processo** (`kokoro::ambiente_onnx`, `OnceLock`): ele recusa um segundo ("only one
  environment is allowed per process") mesmo depois de o primeiro ser descartado. Cada modelo criava o seu: no teste do
  Lucas, depois da amostra da Kristin (Piper), toda leitura dava "voz neural indisponível", até com o Kokoro; o mesmo
  devia acontecer ao reabrir o Kokoro depois de 2 min parado. O aviso agora diz a causa (`erro`, `voz`). O
  `piper_no_motor` (ignorado) abre o Piper, o Kokoro e o Piper de novo e lê com eles.
- **M27e concluído** (PR #119; testado pelo Lucas no app). **M27 concluído.**
- **v1.1.0** (nov/2026; branch `chore/v1.1.0`): versão nos 4 lugares (`Cargo.toml`, `tauri.conf.json`, `ui/package.json`
  e os lockfiles) e `THIRD-PARTY-NOTICES.md` gerado de novo (estava parado desde o M26e, sem as dependências da voz
  natural; o workflow do AppImage já o regerava ao empacotar). Tag assinada e Release pelo Lucas.
- **"Ouvir" só o trecho** (branch `fix/ouvir-so-o-trecho`): pedido do Lucas testando a v1.1.0. O "Ouvir" da barra de
  destaque lia a partir do trecho e seguia pelo livro; agora lê só ele (a seleção, a frase do modo frase ou o destaque) e
  para, nos dois formatos; o livro inteiro é o "Ler em voz alta" (a barra não ganhou um "Ler daqui": decisão do Lucas).
  `frasesDoTrecho` (`lib/frases.ts`): as frases que o trecho alcança, cortadas nas pontas. EPUB: `ouvirTrecho` /
  `falarTrecho` e `trechoOuvido` (marca → realce; no fim, `pararLeitura`; pausar/continuar dentro do trecho). PDF:
  `falarTrecho` e `leitura.soOTrecho`; num destaque, as frases cujas linhas caem nos retângulos dele.
- **Seleção sem barra na v1.1.0** (branch `test/selecao-webkit-2.50`): o Lucas selecionou com o mouse (o texto marcou) e a
  barra não apareceu, ao reabrir um EPUB pela biblioteca e fechar o cartão "Onde você parou"; depois de abrir um PDF e
  voltar, funcionou. Não reproduz com o WebKitGTK 2.54 daqui. `specs/selecao.e2e.js` (a sessão envelhece a última leitura
  no banco, `FOLIO_DADOS_TESTE`, para o cartão aparecer) e o E2E também no Ubuntu 22.04, o WebKitGTK do AppImage
  (`webkit2gtk-driver`; um cache do Rust por sistema, senão o `cargo-tauri` do Ubuntu novo não roda lá).
- Diagnóstico da seleção (PR #121): o log diz `seleção sem barra: …` (texto selecionado e a barra não abre) e `barra
  de destaque fechada N ms depois de abrir: <origem>` (`ControleDestaques.esconder(origem)`), só no EPUB.
- **v1.1.1** (nov/2026; branch `chore/v1.1.1`): "Ouvir" só o trecho (#122) e o diagnóstico e os E2E no WebKitGTK do
  AppImage (#121). Versão nos 4 lugares; `THIRD-PARTY-NOTICES.md` sem mudança. Tag assinada e Release pelo Lucas.
- **Análise e plano** (nov/2026): `docs/analise/2026-11-analise.md` e, no ROADMAP, "Depois da análise" (M29–M43).
- **M29 — biblioteca sem travar a janela** (branch `perf/m29-biblioteca-sem-travar`): a trava da biblioteca só pode ser
  segurada pelo tempo de uma consulta, porque um comando sem `async` que a espere para a thread principal (a janela).
  `biblioteca::importar_sem_segurar` e `ler_sem_segurar` (para o `Mutex`): ler, SHA-256, metadados e cópia com a
  biblioteca solta; trava só para "já existe?" e o registro (`INSERT OR IGNORE`: o mesmo livro pode chegar duas vezes;
  se o registro falhar, a cópia e a capa são apagadas). `biblioteca::travar` recupera a trava envenenada por um pânico
  (no lugar dos `lock().unwrap()`). SQLite: `synchronous = NORMAL`, `journal_size_limit` de 1 MB, `busy_timeout` de 5 s.
  **Os comandos curtos continuam sem `async` de propósito**: na thread principal rodam na ordem das chamadas (o
  progresso de duas páginas seguidas não troca de lugar). Medido (`FOLIO_MEDIR_IMPORTAR=<pasta> ./virtual.sh npm test`,
  4 PDFs de 86 MB com um livro aberto): um comando leve esperava 443 ms (a importação inteira); agora, 23 ms no pior
  caso, mediana 2 ms. O `conferir_capas` ficou na abertura (um `stat` por capa; movê-lo deixaria a primeira lista com
  capas faltando).
- **M30 — instância única** (branch `feat/m30-instancia-unica`): `tauri-plugin-single-instance` (o primeiro plugin; no
  Linux, um nome no D-Bus da sessão). Um segundo "Abrir com" não inicia outro app: `crates/app/src/instancia.rs`
  (`arquivo_pedido`: `argv[1]` a partir da pasta de quem chamou) traz a janela para a frente e emite `abrir-arquivo`; o
  `App` (`ouvirAbrirArquivo`, `abrirPeloSistema`) importa e abre, um pedido por vez, fechando antes o livro aberto.
  **Desligada nas compilações de depuração** (o `cargo tauri dev` abre ao lado do Folio instalado);
  `FOLIO_INSTANCIA_UNICA=1` liga (só o `instancia.e2e.js`) e `=0` desliga. Fechar um PDF ainda carregando não é mais
  registrado como erro.
- **M31 — o livro não roda código** (branch `test/m31-epub-hostil`): o iframe do foliate-js tem `allow-same-origin
  allow-scripts`, então **a única barreira entre um script de EPUB e os comandos do app é a CSP** do `tauri.conf.json`
  (`script-src` sem `blob:` nem `'unsafe-inline'`; `img-src`, `frame-src` etc. sem `http:`). `hostil.epub`
  (`gerar.py`: `<script>` embutido e de arquivo, `onerror`, `javascript:`, imagem, CSS, fonte, iframe, objeto e áudio
  remotos) e `e2e/specs/seguranca.e2e.js` (sobe um servidor em 127.0.0.1:47811 e confere que nada roda e nenhum
  pedido chega). Conferido que o teste falha com a CSP afrouxada (`blob:` em `script-src`: o script do livro roda).
  **No `cargo tauri dev` a CSP não vale** (a página vem do Vite): não abrir livro de origem duvidosa no modo de
  desenvolvimento. Links externos de um livro não fazem nada (o `window.open` é ignorado) até o M35. pdf.js com
  `isEvalSupported: false`; sem `scriptingManager`, o JavaScript de um PDF não roda. `npm audit` informativo na CI.
- **M32 — busca no EPUB** (branch `feat/m32-busca-epub`): Ctrl+F igual nos dois formatos, com a mesma barra
  (`Busca.svelte`, antes `BuscaPdf`; `onLimpar` quando o campo fica vazio ou a busca fecha). No `Leitor`: `view.search`
  do foliate-js (o livro inteiro, sem diferenciar maiúsculas nem acentos; as ocorrências são contornadas por ele, com
  `Overlayer.outline` na cor de destaque da interface) e a ocorrência atual realçada por uma anotação a mais
  (`realceBusca`, como o `realceVoz`; refeita no `create-overlay`, porque a seção pode carregar depois do `goTo`).
  `lib/buscaEpub.ts` (puro): `ocorrenciasDoPasso`, `primeiraDesde` (começa de onde se está lendo, pelo `compare` dos
  CFIs), `vizinha` (dá a volta), `mesmoTermo`, `textoDaBusca`. Uma busca nova descarta a anterior (`vezDaBusca`; sair
  do `for await` encerra o gerador). Só no documento principal, como no PDF. No E2E, os destaques do livro também são
  `<g>` com `fill` no SVG do foliate-js: distinguir pela cor.
- **M33a — documentação** (branch `docs/m33a-claude-md-enxuto`): o `CLAUDE.md` tinha 106 KB, lidos em toda sessão, e a
  maior parte era este histórico. Agora ele tem ~11 KB (visão, como trabalhamos, stack, arquitetura, convenções, rodar
  e testar, **"Armadilhas conhecidas"** reunidas dos marcos, e um "Estado atual" de poucas linhas), e o histórico vive
  aqui. `CHANGELOG.md` (para quem usa o app), `CONTRIBUTING.md`, e o README diz que a 1.1 é estável e o que a
  acessibilidade cobre hoje (teclado, contraste, fontes, voz; o Orca ainda não).
- **M33b — CI fixada** (branch `ci/m33b-ci-fixada`): as actions nas versões atuais e **fixadas pelo SHA do commit** (o
  comentário ao lado diz a versão; as `@v4` rodavam em Node 20, em fim de vida); `ubuntu-26.04` no lugar de
  `ubuntu-latest` e o Node pelo `.nvmrc` (26) no lugar de `lts/*`: a troca de versão passa a ser uma decisão.
  `.github/dependabot.yml`: cargo, npm (`ui` e `e2e`) e actions, uma vez por semana, um PR agrupado por ecossistema.
  Na Release, o workflow do AppImage anexa também o `SHA256SUMS` e gera a atestação de proveniência
  (`gh attestation verify`; não impede a Release se o serviço falhar).
- **M33c — teste de migração** (mesma branch): `tests/fixtures/bancos/<versão>.sql`, um banco com o esquema de cada
  versão publicada (2, 5, 6, 7 e 11 migrações: v0.1.0, v0.3.0, v0.6.0, v0.7.0, v0.8.0), gerado pelo `gerar.py` de lá
  com as migrações **do código de cada tag** e alguns dados. `crates/core/tests/migracoes.rs`: cada um abre na
  versão de hoje, fica com o mesmo esquema de um banco novo (colunas, índices, `user_version`) e não perde livros,
  progresso, coleções, destaques, sessões, visitas nem preferências (as antigas: tema sépia, `paginaPdf`,
  `larguraMaxima`). Conferido que falha se uma migração publicada for editada. O `rusqlite` embutido liga as chaves
  estrangeiras por padrão: o `.sql` começa com `PRAGMA foreign_keys = OFF` (as tabelas saem em ordem alfabética).
- **M34a — `ControleVoz`** (branch `refactor/m34a-controle-voz`): a leitura em voz alta estava escrita duas vezes, uma em
  cada leitor. `lib/controleVoz.svelte.ts` (classe com runes, como o `ControleDestaques`): o estado, `possivel`, o aviso
  de preparo, `ler(desde)`, `falar` (para o adaptador), `acabou(anúncio)`, `ouvirTrecho(frases)` (o "Ouvir" da barra),
  `aoEvento`, `pausarOuRetomar`, `parar`, a pausa do Ctrl+D (`pausarParaDestacar`, `retomarDepoisDaBarra`,
  `naoRetomar`), `comandos()` e `vez`/`novaVez` (quem acorda de um `await` com a vez antiga desiste). O
  `AdaptadorVoz<D>` de cada formato: `comecar`, `aoMarcar`, `seguir`, `retomar`, `aoParar`, `mostrarFrase`,
  `blocoDoTrecho`, `anunciar`. EPUB: `D` = um trecho (`Range`), sobre o `tts.js`. PDF: `D` = página e frase; o
  `leitura` dele guarda só a leitura do documento (o trecho do "Ouvir" é do controle, e a página da frase vem do DOM:
  `paginaDaFrase`). O motor é trocável (`MotorDoControle`): 16 testes de unidade com um motor e um livro de mentira.
  Sem mudança de comportamento pretendida; uma diferença: ao chegar ao fim do livro, o realce da última frase sai.
  `Leitor.svelte` 1.590 → 1.469 linhas; `LeitorPdf.svelte` 1.834 → 1.735. **A voz não tem teste E2E** (tocaria som):
  conferir à mão ler, pausar, retomar, parar, "Ouvir" e Ctrl+D lendo, nos dois formatos.
- **M34d — comandos do app** (branch `refactor/m34d-comandos-do-app`): `lib/comandosDoApp.ts` (`comandosDoApp(estado,
  acoes)`, puro, com testes) monta a lista da paleta por tela; o `App.svelte` só passa o estado e liga as ações (733 →
  657 linhas). **M34b e M34c não foram feitos**: no lado a lado e na uma ideia por vez, os dois leitores têm funções de
  mesmo nome, mas o corpo é de cada formato, e o que era comum já estava em `lib/`. A análise contou nomes iguais como
  duplicação; só a voz era (M34a).
- **E2E da uma ideia por vez e do "onde você parou"** (mesma branch do M34d): no lugar dos controles M34b/M34c, testes
  de ponta a ponta nos dois formatos (`epub.e2e.js`, `pdf.e2e.js`; o cartão do EPUB conferido em `selecao.e2e.js`;
  `envelhecerUltimaLeitura` e `cartaoOndeParou` em `specs/ajuda.js`). **Acharam um defeito que vinha do M19**: em
  `blocosDoDocumento`, `inicio instanceof Element` dava falso para os nós do livro (são do iframe, outra janela), o
  bloco virava o pai do parágrafo e, num capítulo de parágrafos soltos no `body` (o Dom Casmurro), só o que vinha
  **depois** do bloco atual esmaecia. Agora pelo `nodeType`. Os testes de unidade não pegavam: no jsdom tudo era da
  mesma janela (há um teste novo com um `iframe`).
- **M34e — moldura** (branch `refactor/m34e-moldura`): `InfoDoRodape.svelte` (a estimativa e a meta da sessão, com o
  CSS delas; a moldura só posiciona, com `:global(.rodape-info)`). O texto da meta não quebra mais em duas linhas a
  1000 px: quem cede espaço é a barrinha decorativa. `.github/workflows/capturas.yml`: nos PRs que mexem em arquivos de
  layout (e à mão), roda o `capturas.e2e.js` e guarda as telas em seis larguras como artefato. O rodapé inteiro e o
  modo foco não saíram da moldura (o CSS deles depende das classes de estado dela). **M34 concluído.**
- **Ctrl+D com a voz lendo fechava a barra** (branch `refactor/m34e-moldura`): achado pelo Lucas ao testar o
  `ControleVoz`, mas não era dele. O foliate-js marca `isKeyboardSelecting` no `keydown` do livro e desmarca no
  `keyup`; o Ctrl+D leva o foco à barra de destaque com a tecla ainda apertada, o `keyup` não chega ao livro e a marca
  ficava ligada para sempre. Do segundo Ctrl+D em diante, a seleção da frase lida (posta pelo app) rolava a página, e
  o `relocate` fechava a barra em ~15 ms ("a página mudou" no log). Alteração local no `paginator.js`: a marca cai
  quando a janela do livro perde o foco (`PATCHES.md`). Teste E2E sem voz (uma seleção por código depois de um Ctrl+D
  não gera `relocate`). **Como testar a voz sem som**: uma saída virtual do PipeWire (`pactl load-module
  module-null-sink sink_name=folio_teste`), `PIPEWIRE_NODE=folio_teste` no ambiente do app e as vozes já baixadas
  ligadas por um link na pasta de dados do teste; toca em tempo real, em silêncio (o `type null` do ALSA consome o
  áudio rápido demais). O WebDriver solta as teclas na hora: para imitar a mão, `action("key")` com pausa.
- **M35a — de onde vim** (branch `feat/m35a-voltar`): `lib/caminho.svelte.ts` (`Caminho<P>`: pilha de até 30 pontos,
  `sair(ponto)` devolve se entrou, `voltar()`, `quantos` reativo, `comandos()` da paleta; `ehVoltar` = Alt+←). EPUB
  (`P` = CFI): `vouSaltar()` antes do índice, de um destaque, de um trecho revisitado, do slider e da porcentagem, da
  primeira ocorrência de uma busca, e no evento `link` do foliate-js (link do livro: aviso com "Voltar (Alt+←)"). PDF
  (`P` = página): `saltarPara(n)` (campo da página, slider, primeira/última, paleta, destaque; só conta se não for a
  página vizinha) e o `goToDestination` do `PDFLinkService` embrulhado (links das páginas e o nosso índice; o aviso só
  para os links). O Alt+← é sempre consumido no leitor (na webview, voltaria na navegação da página). F1 e E2E nos
  dois formatos.
- **M35b — notas de rodapé** (branch `feat/m35b-notas`): `lib/notas.ts` (as regras do `footnotes.js` do foliate-js,
  MIT, sem `instanceof`: `chamadaDeNota` = sim (`noteref`, `doc-noteref`…) | talvez (número em sobrescrito) | não;
  `tipoDaNota`, `elementoDaNota` (do alvo inline sobe ao bloco), `paragrafosDaNota` (tira os links de volta, inclusive o
  número que aponta para o `id` da chamada), `notaDoLink`: `null` sem texto ou, no "talvez", acima de 1.500
  caracteres). O balão do foliate-js abriria uma segunda `<foliate-view>` por nota; o nosso (`BalaoNota.svelte`,
  `role="dialog"` não modal, posição como a da barra de destaque) mostra o texto: no `link` do foliate-js, uma chamada
  de nota é impedida (`preventDefault`, síncrono) e a nota é achada no documento da seção de destino
  (`book.resolveHref` + `createDocument`); se não der, o link segue como link (com o aviso do M35a). O foco vai ao
  balão; Esc, "Fechar", clique fora (também no iframe: um `pointerdown` no documento do livro) ou virar a página
  fecham. "Ir até a nota" salta com Alt+← de volta. Fixture `notas.epub` e `notas.e2e.js` (a nota marcada, a de fim,
  o link comum).
