# Roteiro de teste com o Orca (Linux)

Teste manual de teclado e leitor de tela. Rode a cada mudança grande de interface (M4c em diante).
Anote em cada passo **o que o Orca disse** quando for diferente do esperado.

## Preparação
1. Instale e ligue o Orca: `orca` (ou `Super+Alt+S` no GNOME). No Hyprland, rode `orca &` num terminal.
2. Abra o app: `cargo tauri dev` (ou o binário de `cargo tauri build --no-bundle`).
3. Tenha na biblioteca pelo menos 3 livros, incluindo um EPUB (ex.: `tests/fixtures/dom-casmurro.epub`) e um PDF.
4. Não use o mouse durante o teste.

Dica: o Orca alterna entre o **modo de navegação** (setas leem o texto) e o **modo de foco** (as teclas vão
para o app) com `Orca+A`. Em controles como botões e campos ele costuma entrar no modo de foco sozinho.

## 1. Biblioteca
| # | Ação | Esperado |
|---|---|---|
| 1.1 | Abrir o app | Anuncia a janela "Leitor" e o título "Biblioteca" |
| 1.2 | `Tab` até a lista de livros | Anuncia o primeiro livro: título, autor, progresso ("Não iniciado", "37% lido"...) e "botão" |
| 1.3 | `→`, `↓`, `End`, `Home` | Move entre os livros; cada um é anunciado. `Tab` sai da lista (a lista é uma só parada de Tab) |
| 1.4 | `F1` | Abre "Atalhos de teclado, diálogo"; a tabela "Biblioteca" pode ser lida; o foco fica preso no diálogo |
| 1.5 | `Esc` | Fecha o diálogo; o foco volta ao livro em que estava |
| 1.6 | `Tab` até "Aparência" e `Enter` | Anuncia "expandido"; o painel de tema aparece logo depois do botão |
| 1.7 | Escolher "Alto contraste" com as setas | Cada tema é anunciado como "botão de opção", com o nome; a tela muda na hora |
| 1.8 | "Importar livros…" | O diálogo de arquivos do sistema abre; depois de importar, o resultado é anunciado ("1 livro importado.") |

## 2. Leitura de EPUB
| # | Ação | Esperado |
|---|---|---|
| 2.1 | `Enter` num EPUB | Anuncia o título do livro (título 1) |
| 2.2 | `Tab` até o índice e escolher um capítulo | O capítulo atual é anunciado como "atual"; depois do `Enter`, o foco vai para o texto e o Orca começa a lê-lo |
| 2.3 | `→` e `←` com o foco no texto | Vira a página; ao entrar num capítulo novo, anuncia "Capítulo: …" (uma vez por capítulo, não a cada página) |
| 2.4 | Ler o texto no modo de navegação (setas para baixo) | Lê o conteúdo do capítulo em ordem |
| 2.5 | `F1` com o foco no texto | Abre os atalhos de "Leitura de EPUB" |
| 2.6 | "Aparência" → mover "Tamanho do texto" com as setas | Anuncia o valor por extenso ("125%"); o livro muda; as setas **não** viram a página |
| 2.7 | `Esc` com o painel aberto | Fecha o painel; o foco volta ao botão "Aparência" |
| 2.8 | "Voltar à biblioteca" | O foco volta para o livro que estava aberto |

## 3. Leitura de PDF
| # | Ação | Esperado |
|---|---|---|
| 3.1 | `Enter` num PDF | Anuncia o título do documento |
| 3.2 | `Tab` até a área do documento | Anuncia a região com o nome do documento; o texto da página pode ser lido |
| 3.3 | `Ctrl+F`, digitar um termo, `Enter` | O foco vai para a busca; o resultado é anunciado ("1 de 12" ou "Nada encontrado") |
| 3.4 | Campo "Página": digitar um número e `Enter` | Vai para a página; o campo anuncia o número |
| 3.5 | Botões de zoom | O valor do zoom é anunciado ("125%") |

## Resultado
Para cada passo que divergiu, registre: número do passo, o que o Orca disse e o que você esperava.
