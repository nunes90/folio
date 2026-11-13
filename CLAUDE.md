# Folio — leitor de EPUB e PDF

> Repositório: `nunes90/folio` no GitHub. A pasta local é `~/Projects/leitor` (o app se chamava "Leitor" até
> out/2026). O histórico marco a marco está em `docs/historico.md`; este arquivo fica curto de propósito.

## Visão
Leitor de ebooks (EPUB e PDF) para **Linux**. macOS e Windows ficam para o futuro (ADR 0006).
Prioridades: **acessibilidade ampla** e **animações fluidas**. Linguagem principal: **Rust**.

## Como trabalhamos
- Claude escreve (inclusive o Rust do core) e Lucas revisa. Lucas estuda Rust: explicar as escolhas de Rust.
- Responder em português.
- Ambiente principal: Linux com compositores Wayland tiling (Hyprland / MangoWM), NVIDIA. Testar lá cedo.
- Fluxo de um marco: ler este arquivo e o `ROADMAP.md`; combinar o objetivo; teste primeiro, depois o código;
  `cargo fmt`, `cargo clippy -- -D warnings`, `cargo test` (e, no frontend, `npm run check` e `npm test`);
  commit; entrada nova no fim de `docs/historico.md`, marco marcado no `ROADMAP.md` e, se nasceu uma regra, ela
  entra aqui.
- CI: actions fixadas pelo SHA (o Dependabot as atualiza), `ubuntu-26.04` e Node do `.nvmrc`.
- Git: uma branch por funcionalidade, PRs pequenos com base na `main`, Conventional Commits (`feat:`, `fix:`,
  `test:`, `refactor:`, `perf:`, `docs:`, `chore:`). Tags e Releases são do Lucas.
- Versão em 4 lugares: `Cargo.toml` (workspace), `crates/app/tauri.conf.json`, `ui/package.json` e os lockfiles.
  O `THIRD-PARTY-NOTICES.md` é gerado por `scripts/avisos_de_terceiros.py` (o arquivo commitado precisa existir).

## Stack (ver `docs/decisions/`)
- **Tauri 2**: núcleo em Rust, interface em webview (WebKitGTK).
- **Frontend**: Svelte 5 + Vite + TypeScript, sem SvelteKit (ADR 0003). Vitest + Testing Library + axe-core.
- **EPUB**: foliate-js (MIT) em `ui/src/vendor/foliate-js/`, com alterações locais marcadas com `LEITOR:` e
  listadas no `PATCHES.md` de lá.
- **PDF**: pdf.js, lido por trechos (`carregarPdfPorTrechos`); metadados pelo `lopdf` no core.
- **Biblioteca**: SQLite (`rusqlite`, embutido), cópia do livro com id = SHA-256 (ADR 0005).
- **Voz**: speech-dispatcher (ADR 0007) e voz natural local, Kokoro e Piper no ONNX Runtime (ADR 0008).
- **Licença**: GPL-3.0-or-later. **Proibido**: dependências AGPL (ex.: MuPDF); o `cargo deny` verifica.
- **Empacotamento**: AppImage (CI, Ubuntu 22.04: leva o WebKitGTK 2.50; o sistema daqui tem o 2.54).

## Arquitetura
```
crates/core/     # lógica pura, SEM dependência de Tauri. Toda lógica testável vive aqui.
crates/app/      # Tauri: comandos finos que só chamam o core.
ui/              # frontend Svelte + foliate-js + pdf.js (lógica pura em ui/src/lib, com teste)
e2e/             # testes de ponta a ponta (WebdriverIO + tauri-driver), numa tela virtual
tests/fixtures/  # EPUBs/PDFs de teste (gerar.py; casos quebrados em quebrados/)
docs/            # decisions/ (ADRs), historico.md, analise/, guia.md, testes/, leitor-de-tela.md
```
Dados em `~/.local/share/io.github.nunes90.folio` (banco, `livros/`, `vozes/`), capas em
`~/.cache/io.github.nunes90.folio/capas`, logs em `~/.local/state/folio/logs`. Para testar sem tocar nos dados
reais: `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`.

## Convenções
- **EPUB e PDF iguais**: todo recurso, animação e padrão visual vale para os dois formatos. O que é comum fica
  num controle com um adaptador por formato (`ControleDestaques` e `ControleVoz` são o modelo).
- **Atalhos como linguagem**: a leitura inteira deve ser operável sem o mouse. Todo recurso novo ganha atalho
  (sem letra sozinha, WCAG 2.1.4) ou comando na paleta (Ctrl+K), e entra no F1 (`lib/atalhos.ts`).
- **Componentes**: contraste WCAG testado, tudo em `rem`, foco visível, nada só no hover, ícones SVG
  (`Icone.svelte`), cores só em `lib/temas.ts` e `lib/pagina.ts`. Botões nas três variantes do `app.css` (padrão,
  `.primario`, `.discreto`); grupos de opções com `fieldset` sem caixa, `.segmentado` e `.amostras`. Componente
  novo não inventa botão nem grupo.
- **Animações**: durações e curva em `lib/animacao.ts` (mola, 100/140/200 ms), só `transform` e `opacity`, nada
  pesado durante o movimento, zeradas com movimento reduzido. O que se repete centenas de vezes (virada de
  página) deve ser quase imperceptível.
- **Barra do leitor**: o que não se usa em toda sessão vai para o menu ⋯, a paleta e o atalho.
- **Números honestos**: sem dado medido, sem estimativa; folhear não conta como leitura.
- Erros: `thiserror` no core (tipados), `anyhow` no app. Mensagens ao usuário em frases; a causa técnica vai
  para o log.
- Logs: `tracing` (`RUST_LOG=folio=debug`); os do frontend chegam ao mesmo arquivo pelo `tauri-plugin-log`.
- Testes: unitários e de integração com fixtures, `insta`, `proptest` nos parsers (não podem dar panic), Vitest
  e axe no frontend, E2E em `e2e/`. Ferramentas que precisam de arquivos baixados são testes `#[ignore]`.

## Rodar e testar
- `cargo tauri dev` (requer `cargo install tauri-cli` e `npm ci` em `ui/`). Build: `cargo tauri build --no-bundle`;
  AppImage: `cargo tauri build --bundles appimage`.
- **E2E sem incomodar**: compilar em outra pasta e rodar na tela virtual.
  `cd crates/app && CARGO_TARGET_DIR=<raiz>/target/e2e cargo tauri build --debug --no-bundle` (caminho absoluto),
  depois, em `e2e/`, `FOLIO_APP=<raiz>/target/e2e/debug/folio ./virtual.sh npm test`.
- Medições (não são testes): `FOLIO_MEDIR=<pdf>` (abrir e virar) e `FOLIO_MEDIR_IMPORTAR=<pasta>` (janela parada
  durante a importação) e `FOLIO_MEDIR_BIBLIOTECA=5000` (a grade com muitos livros). Capturas em seis larguras: `FOLIO_CAPTURAS=<pasta>` (com `FOLIO_TELA=2600x1600`); na CI,
  o workflow Capturas as guarda como artefato nos PRs de layout.
- Memória: PSS/anon de `/proc/<pid>/smaps_rollup`, não a soma do RSS (`scripts/memoria.sh`).

## Armadilhas conhecidas

### WebKitGTK
- **Nunca usar o zoom da webview**: ele é aplicado duas vezes em iframes e quebra o foliate-js. A escala de
  texto do sistema é anulada no zoom e reaplicada via CSS (ADR 0004).
- **Não usar a View Transitions API**: o 2.54 a anuncia, mas o processo da página aborta ao capturar a tela.
  Transições são feitas à mão (`lib/transicao.ts`).
- **Não usar `filter` CSS no canvas do PDF** (recalculado a cada quadro) nem a CSS Custom Highlight API (não
  apaga o realce anterior). `ctx.filter` não tem efeito.
- **Setas rolam o que transborda**, inclusive contêineres com `overflow: hidden`: a moldura e a área do livro
  usam `overflow: clip`. O Chromium não reproduz: testar no app.
- **NVIDIA**: o renderizador DMABUF derruba a janela; o app define `WEBKIT_DISABLE_DMABUF_RENDERER=1` sozinho.
- `input[type=range]` mede 129 px no cálculo do flex (usar `width`, não `flex-basis`). O `for await` de streams
  falha no 2.50 (`permitirForAwaitEmStreams`).
- **Não interceptar o fechamento da janela** (`onCloseRequested`): a janela pode ficar impossível de fechar. O
  progresso é gravado a cada página, sem espera.
- **Leitor de tela (Orca) adiado**: sem testes nem integração específica até a interface estabilizar; o que se
  aprendeu (as quedas do WebKitGTK) está em `docs/leitor-de-tela.md`. Os contornos que já estão no código ficam:
  contêiner só de botões não tem caixa própria (`display: contents` ou `.grupo-sem-caixa`), texto perto do foco
  não muda sozinho, `Icone` com `role="img"`. Teclado, ARIA, axe e foco continuam regra.

### Tauri e o core
- **A trava da biblioteca só pelo tempo de uma consulta.** Ela é um `Mutex`, e um comando sem `async` que a
  espere para a thread principal (a janela). Disco e CPU ficam fora dela (`importar_sem_segurar`,
  `ler_sem_segurar`, `trecho_livro`); pegar a trava com `biblioteca::travar` (recupera de um pânico).
- **Comandos curtos ficam sem `async`** de propósito: na thread principal rodam na ordem das chamadas (o
  progresso de duas páginas seguidas não troca de lugar). Os que leem ou copiam um livro são `async`.
- **A CSP é a única barreira entre um script de EPUB e os comandos do app** (o iframe do foliate-js tem
  `allow-same-origin allow-scripts`). Não pôr `blob:` nem `'unsafe-inline'` em `script-src`, nem `http:` nas
  outras; o `seguranca.e2e.js` confere. **No `cargo tauri dev` a CSP não vale**: não abrir livro de origem
  duvidosa no modo de desenvolvimento.
- **Um ambiente do ONNX Runtime por processo** (`kokoro::ambiente_onnx`); o espeak-ng tem estado global (um
  `Arc` só, atrás de um `Mutex`).
- **Um endereço que vem do livro só abre depois de `core::links::externo`** (só `http`/`https`) e da confirmação do
  usuário; o `tauri-plugin-opener` é usado só do Rust, sem permissão para a página. **A janela nunca navega para fora do
  app**: o plugin `navegacao` (`on_navigation`) barra, por `core::links::navegacao_do_app`.
- A instância única fica desligada nas compilações de depuração (`FOLIO_INSTANCIA_UNICA=1` liga).
- Migrações do banco: nunca editar uma já publicada; acrescentar outra (o `tests/migracoes.rs` abre um banco de
  cada versão publicada; ao publicar um esquema novo, acrescentar a tag em `tests/fixtures/bancos/gerar.py`). O `serde` não lê um float num `u32`
  (uma preferência inválida faz o JSON inteiro virar o padrão: migrar antes de ler).
- `to_lowercase` no Rust para comparar nomes: o `NOCASE` do SQLite só cobre ASCII.

### Svelte, foliate-js e pdf.js
- **`$effect` e bibliotecas com eventos síncronos**: chamar o pdf.js ou o foliate-js dentro de um efeito dispara
  na hora tratadores que leem estado reativo, e essas leituras viram dependências do efeito. Pôr as chamadas em
  `untrack(() => …)`.
- **O paginador do foliate-js ignora, sem erro, um `goTo` nos 100 ms seguintes a uma virada** (`#locked`):
  conferir pelo `relocate` e tentar de novo (`irParaFracao`); nos testes, esperar.
- O foliate-js só desenha as anotações da seção carregada: refazer no `create-overlay`.
- O foliate-js rola a página quando a seleção muda com uma tecla apertada **no livro**: seleção posta pelo app
  logo depois de um atalho pode gerar `relocate` (ver a alteração do `isKeyboardSelecting` no `PATCHES.md`).
- **Os nós do livro são de outra janela** (o iframe do EPUB): `no instanceof Element` dá falso para eles. Usar
  `nodeType` (ou `ownerDocument.defaultView`). Nos testes de unidade, montar o caso num `iframe`.
- O pdf.js tira nós desconhecidos da página no `reset()`: camadas próprias (destaques, voz) são refeitas a cada
  `pagerendered`. O texto vem na ordem do arquivo, não na de leitura (`ordemDeLeitura` em `lib/frasesPdf.ts`).
- O `Intl.Segmenter` corta frases onde não deve (diálogos, abreviações) e trata quebra de linha como fim de
  frase: usar `frasesDe` de `lib/frases.ts`.
- Os dois lados (lado a lado) precisam da mesma largura e altura, ou paginam diferente.

### Testes E2E
- Sempre pelo `./virtual.sh` (tela e D-Bus próprios, sem portais); o `wdio.conf.js` força `GDK_BACKEND=x11`.
- `getText` não enxerga títulos com `text-overflow` (usar `texto()` de `specs/ajuda.js`); o seletor `aria/` acha
  também os itens da paleta fechada; `clearValue` nem sempre dispara `input`.
- O WebDriver do sistema não dirige o WebKitGTK de outra versão (o do AppImage é testado na CI, no Ubuntu 22.04).

## Estado atual
- **v1.1.1** publicada (nov/2026). Em andamento: o plano "Depois da análise" do `ROADMAP.md`
  (`docs/analise/2026-11-analise.md`), versões 1.2 a 1.4, marcos M29–M43.
- **v1.2 completa, sem tag ainda**: M29 (biblioteca sem travar a janela), M30 (instância única), M31 (E2E do EPUB
  hostil), M32 (busca no EPUB), M33 (este arquivo enxuto e o histórico separado; CI fixada pelo SHA, Dependabot,
  `SHA256SUMS` e atestação na Release; teste de migração com um banco de cada versão publicada).
- v1.3 em andamento: M34 feito (`ControleVoz` comum aos dois leitores, comandos da paleta em
  `lib/comandosDoApp.ts`, `InfoDoRodape`, capturas na CI; M34b e M34c descartados, ver o ROADMAP).
- M35 feito: Alt+← volta de um salto (os dois formatos), notas de rodapé num balão (EPUB), links externos só com
  confirmação e só `http`/`https` (`core::links`; os dois formatos).
- M36 e M37 feitos: capas em miniatura (`core::miniatura`), a grade da biblioteca em lotes (`lib/lotes.ts`), a
  paleta com porta visível (`lib/paleta.svelte.ts`), dica de primeiro uso e a voz no canto do modo foco.
- Próximo passo: a Release (do Lucas) e o M38 (cópia de segurança da biblioteca), o último da v1.3.
- Em aberto, a decidir: Séries, Flatpak, tradução da interface, macOS/Windows.
