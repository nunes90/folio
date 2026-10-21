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
  - [ ] M4d — leitura em voz alta (TTS). Atenção à qualidade da voz: o padrão do sistema (espeak-ng via
    speech-dispatcher) é muito robótico; avaliar vozes neurais locais (ex.: Piper, com vozes pt-BR)
- [ ] **M5 — Animações e polimento**: virada de página, transições, respeitando `prefers-reduced-motion`.
- [ ] **M6 — Empacotamento**: Flatpak/AppImage.

## Futuro
- **macOS** (adiado, ADR 0006): voltar com o job na CI, `.dmg` no empacotamento e testes com o VoiceOver.
  O código já trata o macOS em alguns pontos (diretório de logs, escala de texto) e deve continuar compilando.
- **Windows**.
