# Folio

Leitor de livros **EPUB e PDF** para Linux, feito para ser lido de qualquer jeito: com o teclado, com
leitor de tela, em voz alta. Tudo fica no seu computador: sem conta, sem nuvem, sem telemetria.

> **Estado:** em desenvolvimento, a caminho da 1.0. As versões atuais são pre-releases.

## O que ele faz

- **Leitura sem mouse.** Todo recurso tem atalho ou comando na paleta (`Ctrl+K`); `F1` lista os atalhos.
  Funciona com o Orca, e as animações respeitam a opção de reduzir movimento.
- **Aparência sua.** Temas de interface, cores de página (creme, sépia, noite, inclusive no PDF), fontes
  como Atkinson Hyperlegible, Lexend e OpenDyslexic, tamanho, entrelinha e caracteres por linha.
- **Em voz alta**, nos dois formatos, com a frase lida realçada. Listas e código são lidos mais devagar.
- **Destaques que servem para reler**, com cor, nota e motivo (dúvida, citar, revisar), exportados em
  Markdown. Sem seleção, `Ctrl+D` destaca a frase atual.
- **Comparar trechos.** Dois pontos do mesmo livro lado a lado, e destaques fixados ao lado do texto.
- **O seu ritmo.** Modo foco, uma ideia por vez, metas de sessão, quanto falta no seu ritmo e "onde você
  parou" ao reabrir. Sem sequência de dias nem ranking.
- **Biblioteca.** Estantes, coleções, autores, busca e lixeira.

O [guia de uso](docs/guia.md) mostra como usar cada um.

## Instalar

Baixe o AppImage na [página de versões](https://github.com/nunes90/folio/releases), e:

```sh
chmod +x Folio_*_amd64.AppImage
./Folio_*_amd64.AppImage
```

Para a leitura em voz alta, instale o `speech-dispatcher` pelo gerenciador de pacotes. Sem ele, o resto
funciona normalmente.

## Compilar

Requer Rust (estável), Node.js e as bibliotecas de desenvolvimento do WebKitGTK 4.1 (no Ubuntu:
`libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev`).

```sh
cargo install tauri-cli --version "^2" --locked
(cd ui && npm ci)

cargo tauri dev                 # para desenvolver
cargo tauri build --no-bundle   # binário em target/release/folio
cargo tauri build --bundles appimage
```

## Testes

```sh
cargo test                  # o núcleo em Rust
(cd ui && npm test)         # o frontend (Vitest, Testing Library, axe-core)
```

Os testes de ponta a ponta ficam em [`e2e/`](e2e/wdio.conf.js) e rodam o app compilado numa tela virtual.
Os roteiros manuais estão em [`docs/testes/`](docs/testes/): leitor de tela e desempenho.

## Como é feito

Tauri 2, com o núcleo em Rust (`crates/core`, sem dependência do Tauri) e a interface em Svelte 5 (`ui/`).
O EPUB é desenhado pelo [foliate-js](https://github.com/johnfactotum/foliate-js) e o PDF pelo
[pdf.js](https://github.com/mozilla/pdf.js). As decisões de arquitetura estão em
[`docs/decisions/`](docs/decisions/). Só Linux por enquanto.

## Licença

[GPL-3.0-or-later](LICENSE). Os componentes de terceiros e as licenças deles estão em
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
