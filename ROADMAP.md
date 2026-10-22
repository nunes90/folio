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
- [ ] **M5 — Animações e polimento**: virada de página, transições, respeitando `prefers-reduced-motion`.
  Tudo igual para EPUB e PDF (moldura e tokens de animação comuns).
  - [x] M5a — base de animação, moldura comum dos leitores, painéis, diálogos e microinterações
  - [x] M5b — transições entre telas (biblioteca ↔ leitor)
  - [x] M5c — virada de página
  - [ ] M5d — janelas estreitas (painéis por cima do livro), estados de carregamento
- [ ] **M6 — Empacotamento**: Flatpak/AppImage.

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
