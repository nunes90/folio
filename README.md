# Folio

Leitor de livros **EPUB e PDF** para Linux, feito para ser lido do seu jeito: só com o teclado, em voz alta,
com a letra e as cores que você escolher. Tudo fica no seu computador: sem conta, sem nuvem, sem telemetria.

> **Estado:** estável (1.3). O que mudou em cada versão está no [CHANGELOG](CHANGELOG.md).

## O que ele faz

- **Leitura sem mouse.** Todo recurso tem atalho ou comando na paleta (`Ctrl+K`); `F1` lista os atalhos.
- **Aparência sua.** Temas de interface, cores de página (creme, sépia, noite, inclusive no PDF), fontes
  como Atkinson Hyperlegible, Lexend e OpenDyslexic, tamanho, entrelinha e caracteres por linha.
- **Em voz alta**, nos dois formatos, com a frase lida realçada. Listas e código são lidos mais devagar.
  Para livros em inglês e em português, uma voz natural (neural) que roda no seu computador, baixada só se você quiser.
- **Destaques que servem para reler**, com cor, nota e motivo (dúvida, citar, revisar), exportados em
  Markdown. Sem seleção, `Ctrl+D` destaca a frase atual.
- **Comparar trechos.** Dois pontos do mesmo livro lado a lado, e destaques fixados ao lado do texto.
- **O seu ritmo.** Modo foco, uma ideia por vez, metas de sessão, quanto falta no seu ritmo e "onde você
  parou" ao reabrir. Sem sequência de dias nem ranking.
- **Biblioteca.** Estantes, coleções, autores, busca e lixeira.

O [guia de uso](docs/guia.md) mostra como usar cada um.

## Acessibilidade: o que funciona hoje

- **Funciona:** uso completo pelo teclado, foco sempre visível, contraste conferido (WCAG) em todos os temas,
  tema de alto contraste, respeito à escala de texto e à opção de reduzir movimento do sistema, fontes para
  baixa visão e dislexia, leitura em voz alta com a frase realçada.
- **Ainda não:** o leitor de tela **Orca**. A interface tem nomes e papéis acessíveis, mas o WebKitGTK cai em
  algumas telas quando um leitor de tela as percorre, e o suporte específico foi adiado até a interface
  estabilizar. O que se sabe está em [`docs/leitor-de-tela.md`](docs/leitor-de-tela.md).

## Instalar

Baixe o AppImage na [página de versões](https://github.com/nunes90/folio/releases), e:

```sh
chmod +x Folio_*_amd64.AppImage
./Folio_*_amd64.AppImage
```

Se ele não abrir por falta do FUSE, instale o `fuse2` (Arch), `libfuse2` (Debian, Ubuntu 22.04),
`libfuse2t64` (Ubuntu 24.04) ou `fuse-libs` (Fedora), ou rode com `--appimage-extract-and-run`.

O AppImage traz o WebKitGTK e o GStreamer, mas usa as bibliotecas gráficas do sistema. Se o app fechar com
`Couldn't open libGLESv2.so.2`, instale o OpenGL ES: `libgles2` (Debian, Ubuntu) ou `libglvnd-gles` (Fedora).

Para a leitura em voz alta com a voz do sistema, instale o `speech-dispatcher` pelo gerenciador de pacotes. A voz
natural (inglês e português) é baixada pelo próprio app, em Aparência → Voz, e o AppImage já traz o que ela precisa. Sem nenhuma
das duas, o resto funciona normalmente.

## Compilar

Requer Rust (estável), Node.js e as bibliotecas de desenvolvimento do WebKitGTK 4.1 (no Ubuntu:
`libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev libasound2-dev`). A voz natural usa o
`espeak-ng` do sistema quando o app não vem num AppImage.

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
O roteiro de desempenho está em [`docs/testes/`](docs/testes/). Para contribuir, veja o
[CONTRIBUTING](CONTRIBUTING.md).

## Como é feito

Tauri 2, com o núcleo em Rust (`crates/core`, sem dependência do Tauri) e a interface em Svelte 5 (`ui/`).
O EPUB é desenhado pelo [foliate-js](https://github.com/johnfactotum/foliate-js) e o PDF pelo
[pdf.js](https://github.com/mozilla/pdf.js). As decisões de arquitetura estão em
[`docs/decisions/`](docs/decisions/). Só Linux por enquanto.

## Licença

[GPL-3.0-or-later](LICENSE). Os componentes de terceiros e as licenças deles estão em
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
