# Roadmap

Cada marco precisa terminar em algo utilizável.

- [x] **M0 — Esqueleto**: workspace Cargo (`core` + `app`), Tauri abrindo uma janela, logging com tracing, CI (Ubuntu), cargo deny, pre-commit hook.
- [x] **M1 — Abrir EPUB**: abrir um arquivo, ler com paginação via foliate-js, navegar pelo índice.
- [x] **M2 — Biblioteca**: importar livros, listar com capas, salvar o progresso (SQLite).
- [x] **M3 — PDF**: abrir PDFs com pdf.js, com zoom, busca e texto selecionável.
- [ ] **M4 — Acessibilidade**: fontes (inclusive para dislexia), tamanho, espaçamento de linha e letra, largura de coluna, temas (alto contraste, sépia, escuro), movimento reduzido, TTS, navegação completa por teclado, teste com Orca.
  - [x] M4a — preferências de leitura (fontes, tamanho, espaçamentos, largura, alinhamento)
  - [x] M4b — temas e movimento reduzido
  - [x] M4c — teclado completo, foco e testes com Orca (roteiro em `docs/testes/orca.md`)
  - [x] M4d — leitura em voz alta (TTS) de EPUB via speech-dispatcher (ADR 0007). Atenção à qualidade da voz: o padrão do sistema (espeak-ng via
    speech-dispatcher) é muito robótico; avaliar vozes neurais locais (ex.: Piper, com vozes pt-BR)
- [x] **M5 — Animações e polimento**: virada de página, transições, respeitando `prefers-reduced-motion`.
  Tudo igual para EPUB e PDF (moldura e tokens de animação comuns).
  - [x] M5a — base de animação, moldura comum dos leitores, painéis, diálogos e microinterações
  - [x] M5b — transições entre telas (biblioteca ↔ leitor)
  - [x] M5c — virada de página
  - [x] M5d — janelas estreitas (painéis por cima do livro), estados de carregamento
- [ ] **M6 — Empacotamento**: Flatpak/AppImage. Fica em aberto até a distribuição; incluir a CI que anexa o
  AppImage às Releases a cada tag `v*`.

**v0.1.0** (out/2026): M0–M5. Tag `v0.1.0`, Release como pre-release no GitHub.

## v0.2

**v0.2.0** (out/2026): M7 (refinamento visual) e M8 (biblioteca que escala). Tag `v0.2.0`, Release como pre-release.
- [x] **M7 — Refinamento visual**: a parte adaptada do design system proposto (análise em
  `docs/design/redesign.md`). Igual para EPUB e PDF; contraste testado nos 4 temas; medidas em `rem`.
  - [x] M7a — tokens: superfícies (app, painel, card, hover), texto secundário/suave, divisória, sombra, raio e
    destaque no `Cores` de `lib/temas.ts`, com testes de contraste
  - [x] M7b — barras e painéis do leitor: botões de ícone, título centralizado, paginação compacta, barra de
    progresso, índice com item ativo destacado, cabeçalho dos painéis
  - [x] M7c — biblioteca: cards com progresso na capa, selo EPUB/PDF e "% lido", estado vazio, teclas (kbd) no F1
- [x] **M8 — Biblioteca que escala**: cada parte traz seus componentes da análise do redesign.
  - [x] M8a — avisos (toasts): sucesso em `role="status"`, erro em `role="alert"`, pausa sob o ponteiro ou o foco;
    importar avisa quando o livro já estava na biblioteca (`Importado::JaExistia` no core)
  - [x] M8b — situação do livro no core (não iniciado / lendo / concluído)
  - [x] M8c — busca (título e autor) e filtros Todos · Lendo · Concluídos
  - [x] M8d — arrastar arquivos para importar (o botão "Importar livros…" continua)

## v0.3 — navegação da biblioteca

**v0.3.0** (out/2026): M9 (estantes, lixeira, favoritos, ícones no card), M10 (coleções) e M11 (autores). Tag
`v0.3.0`, Release como pre-release.
Barra lateral com listas e destinos, não abas (8 destinos não cabem em abas, nem no teclado nem em janela estreita).
"Vistas" (Todos, Lendo, Para ler, Lidos) são listas inteligentes; "navegação" (Coleções, Autores, Séries) agrupa;
a Lixeira é outro estado do livro. A busca continua no topo e filtra a vista atual.

- [x] **M9 — Vistas e lixeira**
  - [x] M9a — core: migração 3 com `para_ler`, `lido_em` (lido manual, vence o progresso) e `removido_em`
    (lixeira); marcar para ler / lido, mover para a lixeira, restaurar, apagar de vez, esvaziar. `Situacao`
    considera o lido manual. Abrir um livro tira "Para ler". Importar um livro que está na lixeira o restaura.
  - [x] M9b — barra lateral: Todos · Lendo · Para ler · Lidos, com contagem, setas e `aria-current`
    (substitui os filtros do M8c); painel em janela estreita. A Lixeira entra na barra no M9c, junto com as ações dela
  - [x] M9c — Lixeira na barra lateral e ações do livro: menu "Mais ações" sempre visível (e tecla Menu / Shift+F10) com Para ler, Marcar
    como lido e Mover para a lixeira; vista da lixeira com Restaurar, Apagar de vez e Esvaziar (só esses pedem
    confirmação); aviso com "Desfazer"
  - [x] M9d — ícones no card: ☆ Favorito, 🔖 Para ler e ✓ Lido como botões liga/desliga (aviso a cada ação), ⋯ no
    fim da linha; estante "Favoritos" (migração 4, `favorito_em`); "Favoritar" também no menu (teclado)
  - Decisões: a lixeira nunca se esvazia sozinha; "Para ler" sai ao abrir o livro; a lista se chama "Lidos".
- [x] **M10 — Coleções**
  - [x] M10a — core: migração 5 (`colecoes`, `livros_colecoes`); criar, renomear, apagar (os livros ficam), listar
    com quantidade (fora da lixeira); adicionar e tirar livros; `LivroNaBiblioteca.colecoes`; nomes vazios ou
    repetidos (sem diferenciar maiúsculas, inclusive com acento) recusados. Comandos finos no app.
  - [x] M10b — interface: seção "Coleções" na barra lateral (contagem, "Nova coleção"); na vista da coleção,
    Renomear e Apagar; no menu do livro, "Adicionar à coleção…" (diálogo com caixas de seleção e criar ali mesmo) e
    "Tirar desta coleção"; ícone de pasta "Coleções" na linha de ícones do card
- [x] **M11 — Autores**: item "Autores" na barra lateral abre a lista de autores (com quantos livros cada um tem e a
  busca filtrando); escolher um autor mostra os livros dele. Tudo no frontend (`lib/autores.ts`): grafias que só
  diferem em acentos ou maiúsculas contam como o mesmo autor; livros sem autor em "Autor desconhecido".
- [ ] **Séries** (adiado, decisão de out/2026): ler `calibre:series` (EPUB 2) e `belongs-to-collection` (EPUB 3) no
  core, migração e releitura dos livros já importados. Só se fizer falta: PDFs e muitos EPUBs não trazem série.
- [x] **M12 — Página do PDF**: presets Original (padrão), Creme, Sépia e Noite no painel Aparência do PDF, com
  amostra. Creme e sépia: camada `multiply` (o preto continua preto). Noite: `invert(0.9) hue-rotate(180deg)` aplicado
  nos pixels de cada página desenhada (filtro CSS derrubava a virada para ~30 qps no WebKitGTK; o `ctx.filter` não
  funciona nele). A área ao redor das páginas segue o tema (M7).

**v0.3.1** (out/2026): M12 (cor da página do PDF) e correções (camada de creme/sépia, avisos acima do rodapé, noite sem
clarão). Tag `v0.3.1`, Release como pre-release.

- [x] **M13 — Aparência: Interface · Página · Texto**: "tema" deixou de significar três coisas. **Interface**
  (claro, escuro, alto contraste, do sistema) só pinta o app; **Página** (automática, original, creme, sépia, noite)
  é o papel do livro, com os mesmos nomes e amostras no EPUB e no PDF; **Texto** é a tipografia (só EPUB). Página
  automática segue a interface (escura → noite); interface em alto contraste força a página do EPUB. Preferências
  antigas migradas no core (tema sépia → interface clara + página sépia; `paginaPdf` → `pagina`).
- [x] **Correções**: capas que sumiram do cache são refeitas ao abrir a biblioteca; o progresso é gravado a cada
  mudança de página (a espera de 1 s perdia a última página ao fechar a janela).
- [x] **Painéis flutuantes**: painéis do leitor e barra de estantes viram cartões com margem, cantos arredondados e
  sombra leve.

**v0.4.0** (out/2026): M13 (Interface · Página · Texto), capas e progresso, painéis flutuantes. Tag `v0.4.0`,
Release como pre-release.

- [ ] **M14 — Paleta de comandos** (Ctrl+K): buscar uma ação ou um livro pelo nome.
  - [x] **M14a**: registro de comandos (`lib/comandos.ts`), `Paleta.svelte` (combobox + listbox), comandos da
    biblioteca (importar, buscar, estantes, coleções, lixeira), aparência da interface, atalhos e abrir livro.
  - [ ] **M14b**: comandos do leitor (capítulos do índice, cor da página, texto, voz, página do PDF).
- [ ] **Depois**: slider de páginas, modo foco, destaques…

## Futuro
- **macOS** (adiado, ADR 0006): voltar com o job na CI, `.dmg` no empacotamento e testes com o VoiceOver.
  O código já trata o macOS em alguns pontos (diretório de logs, escala de texto) e deve continuar compilando.
- **Windows**.
- **Voz neural local** (ideia): ler EPUB e PDF com modelos de voz que rodam no próprio computador, sem
  internet (ex.: Piper ou Kokoro, ambos com vozes pt-BR), via ONNX Runtime no Rust (crate `ort`). O texto
  vem do `tts.js` do foliate-js (EPUB) ou da camada de texto do pdf.js (PDF), com destaque do trecho lido.
  Antes: analisar licenças (o código do Piper e o espeak-ng, usado para fonemas, são GPL-3; cada voz tem a
  sua), baixar vozes sob demanda em vez de embuti-las, e comparar a qualidade em pt-BR. Para facilitar, o
  M4d deve ter um "motor de voz" trocável (speech-dispatcher primeiro).
