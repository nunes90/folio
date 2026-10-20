# Roadmap

Cada marco precisa terminar em algo utilizável.

- [ ] **M0 — Esqueleto**: workspace Cargo (`core` + `app`), Tauri abrindo uma janela, logging com tracing, CI (Ubuntu + macOS), cargo deny, pre-commit hook.
- [ ] **M1 — Abrir EPUB**: abrir um arquivo, ler com paginação via foliate-js, navegar pelo índice.
- [ ] **M2 — Biblioteca**: importar livros, listar com capas, salvar o progresso (SQLite).
- [ ] **M3 — PDF**: abrir PDFs com pdf.js, com zoom, busca e texto selecionável.
- [ ] **M4 — Acessibilidade**: fontes (inclusive para dislexia), tamanho, espaçamento de linha e letra, largura de coluna, temas (alto contraste, sépia, escuro), movimento reduzido, TTS, navegação completa por teclado, teste com Orca e VoiceOver.
- [ ] **M5 — Animações e polimento**: virada de página, transições, respeitando `prefers-reduced-motion`.
- [ ] **M6 — Empacotamento**: Flatpak/AppImage e `.dmg`.
- [ ] (futuro) Windows.
