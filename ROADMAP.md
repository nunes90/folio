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
  - Decisões: a lixeira nunca se esvazia sozinha; "Para ler" sai ao abrir o livro; a lista se chama "Lidos".
- [ ] **M10 — Coleções**: criar, renomear, apagar; adicionar e remover livros (pelo menu de ações).
- [ ] **M11 — Autores e Séries**: agrupar por autor (metadados que já existem); séries só se valer a pena
  (metadado frágil em PDF e em muitos EPUBs).
- [ ] **Depois**: paleta de comandos, slider de páginas, modo foco, destaques…

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
