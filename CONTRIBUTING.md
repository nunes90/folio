# Contribuir com o Folio

O Folio é um projeto pessoal, aberto sob a GPL-3.0-or-later. Correções e sugestões são bem-vindas; para algo
maior, abra uma issue antes, para combinar o caminho.

## Preparar

Requer Rust (estável), Node.js e as bibliotecas de desenvolvimento do WebKitGTK 4.1. No Ubuntu:

```sh
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev libasound2-dev
cargo install tauri-cli --version "^2" --locked
(cd ui && npm ci)
git config core.hooksPath .githooks   # roda fmt, clippy e os testes antes de cada commit
```

## Rodar

```sh
cargo tauri dev                 # para desenvolver
cargo tauri build --no-bundle   # binário em target/release/folio
```

Para não mexer na sua biblioteca de verdade, aponte `XDG_DATA_HOME`, `XDG_CACHE_HOME` e `XDG_STATE_HOME` para
uma pasta de teste. No modo de desenvolvimento a política de segurança de conteúdo (CSP) não vale: não abra
livros de origem duvidosa com o `cargo tauri dev`.

## Testar

```sh
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test
(cd ui && npm run check && npm test)
```

Os testes de ponta a ponta rodam o app compilado numa tela virtual (requer `xvfb`, `tauri-driver` e o
`WebKitWebDriver`):

```sh
(cd crates/app && cargo tauri build --debug --no-bundle)
(cd e2e && npm ci && ./virtual.sh npm test)
```

## Como o código se organiza

- `crates/core`: toda a lógica, sem dependência do Tauri, com testes. `crates/app`: comandos finos que só
  chamam o core. `ui`: Svelte 5; a lógica pura fica em `ui/src/lib`, com teste.
- Todo recurso vale igual para EPUB e PDF, tem atalho ou comando na paleta, e entra no F1.
- As decisões estão em [`docs/decisions/`](docs/decisions/); as armadilhas do WebKitGTK, do Tauri e das
  bibliotecas, em [`CLAUDE.md`](CLAUDE.md) ("Armadilhas conhecidas"); o histórico, em
  [`docs/historico.md`](docs/historico.md).
- Dependências AGPL não entram (o `cargo deny` verifica).

## Commits e PRs

- Uma branch por mudança, PR pequeno com base na `main`.
- [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português: `feat:`, `fix:`, `test:`,
  `refactor:`, `perf:`, `docs:`, `chore:`.
- Teste primeiro, depois o código. Um PR que muda comportamento traz o teste que o cobre.
