# Roteiro de teste com o Orca (Linux)

Teste manual de teclado e leitor de tela: **a leitura inteira deve funcionar sem o mouse**. Rode antes de uma
versão e a cada mudança grande de interface. Anote em cada passo **o que o Orca disse** quando for diferente
do esperado. Os fluxos básicos também têm testes automáticos (`e2e/`), mas eles não ouvem o que o Orca diz.

## Preparação
1. Ligue o Orca: `orca` (ou `Super+Alt+S` no GNOME). No Hyprland, rode `orca &` num terminal.
2. Abra o app: `cargo tauri dev` (ou o binário de `cargo tauri build --no-bundle`).
3. Tenha na biblioteca pelo menos 3 livros, incluindo um EPUB (ex.: `tests/fixtures/dom-casmurro.epub`) e um PDF
   com texto (ex.: `tests/fixtures/texto.pdf`). Para a parte 12, `tests/fixtures/quebrados/pdf-com-senha.pdf`.
4. Não use o mouse durante o teste.

Dica: o Orca alterna entre o **modo de navegação** (setas leem o texto) e o **modo de foco** (as teclas vão
para o app) com `Orca+A`. Em controles como botões e campos ele costuma entrar no modo de foco sozinho. Para
os atalhos de leitura (setas que viram a página), fique no modo de foco.

## 1. Biblioteca
| # | Ação | Esperado |
|---|---|---|
| 1.1 | Abrir o app | Anuncia a janela "Folio" e o título "Biblioteca" |
| 1.2 | `Tab` até a lista de livros | Anuncia o primeiro livro: título, autor, progresso ("Não iniciado", "37% lido"...) e "botão" |
| 1.3 | `→`, `↓`, `End`, `Home` | Move entre os livros; cada um é anunciado. `Tab` sai da lista (a lista é uma só parada de Tab) |
| 1.4 | `F1` | Abre "Atalhos de teclado, diálogo"; o contexto "Biblioteca" e as tabelas por grupo podem ser lidos; o foco fica preso no diálogo |
| 1.5 | `Esc` | Fecha o diálogo; o foco volta ao livro em que estava |
| 1.6 | `Ctrl+F`, digitar parte de um título | O foco vai à busca; anuncia "N livros encontrados" |
| 1.7 | `Tab` até "Estantes"; `↑`/`↓` | Cada estante é anunciada com a contagem; a atual como "página atual" |
| 1.8 | `Shift+F10` (ou `Menu`) num livro | Abre "Ações para <livro>, menu"; `↑`/`↓` leem os itens; `Esc` devolve o foco ao livro |
| 1.9 | No menu, "Adicionar à coleção…" | Abre o diálogo; as caixas são anunciadas com o estado; `Esc` fecha e devolve o foco |
| 1.10 | `Delete` num livro | Vai para a lixeira; anuncia o aviso com "Desfazer"; `Tab` chega ao "Desfazer" |
| 1.11 | "Aparência" e `Enter` | Anuncia "expandido"; "Alto contraste" com as setas: cada tema é um "botão de opção" e a tela muda na hora |
| 1.12 | `Ctrl+O` | O diálogo de arquivos abre; depois de importar, o resultado é anunciado ("1 livro importado.") |

## 2. Paleta de comandos
| # | Ação | Esperado |
|---|---|---|
| 2.1 | `Ctrl+K` (em qualquer tela) | Abre a paleta; anuncia o campo de busca e a contagem de comandos |
| 2.2 | Digitar "interface" e `↓` | A contagem muda; cada comando é anunciado ao passar por ele |
| 2.3 | `Enter` | Roda o comando; o foco volta para onde estava antes |
| 2.4 | `Ctrl+K`, `Esc` | Fecha sem rodar nada; o foco volta |

## 3. Leitura de EPUB
| # | Ação | Esperado |
|---|---|---|
| 3.1 | `Enter` num EPUB | Anuncia o título do livro (título 1) |
| 3.2 | `Tab` até o índice e escolher um capítulo | O capítulo atual é anunciado como "atual"; depois do `Enter`, o foco vai ao texto e o Orca começa a lê-lo |
| 3.3 | `→` e `←` com o foco no texto | Vira a página; ao entrar numa seção nova, anuncia "Seção: …" (uma vez por seção, não a cada página) |
| 3.4 | Ler o texto no modo de navegação | Lê o conteúdo do capítulo em ordem; o código é lido como texto normal |
| 3.5 | `F1` com o foco no texto | Abre os atalhos de "Leitura de EPUB", com os grupos Navegação, Leitura, Marcar, Comparar e Geral |
| 3.6 | "Aparência" → "Tamanho do texto" com as setas | Anuncia o valor ("125%"); o livro muda; as setas **não** viram a página |
| 3.7 | "Caracteres por linha" com as setas | Anuncia "~90"; a coluna muda |
| 3.8 | `Esc` com o painel aberto | Fecha o painel; o foco volta ao botão "Aparência" |
| 3.9 | "Voltar à biblioteca" | O foco volta para o livro que estava aberto |

## 4. Leitura de PDF
| # | Ação | Esperado |
|---|---|---|
| 4.1 | `Enter` num PDF | Anuncia o título; o cabeçalho tem os mesmos botões do EPUB |
| 4.2 | "Índice" (se houver sumário) e escolher uma seção | Vai para a seção; o foco vai ao documento; ao virar páginas, anuncia "Seção: …" |
| 4.3 | `Tab` até a área do documento | Anuncia a região com o nome do documento; o texto da página pode ser lido |
| 4.4 | `Ctrl+F`, um termo, `Enter` | O foco vai à busca; anuncia o resultado ("1 de 12" ou "Nada encontrado") |
| 4.5 | Campo "Página": um número e `Enter` | Vai para a página; o campo anuncia o número |
| 4.6 | Botões de zoom | Anuncia o valor ("125%") |
| 4.7 | `Ctrl+K`, "42" e `Enter` | "Ir para a página 42"; vai para a página |

## 5. Mais opções e barras
| # | Ação | Esperado |
|---|---|---|
| 5.1 | `Tab` até "Mais opções" | Anuncia "Mais opções, botão, menu"; o nome é dito mesmo com a barra só com ícones (janela estreita) |
| 5.2 | `Enter` | Abre o menu; o foco vai ao primeiro item; anuncia "Uma ideia por vez, caixa de seleção de menu, não marcada" e o atalho |
| 5.3 | `↓`, `Home`, `End` | Lê os itens |
| 5.4 | `Esc` | Fecha só o menu; o foco volta ao botão; nenhum modo muda |

## 6. Modo foco
| # | Ação | Esperado |
|---|---|---|
| 6.1 | `Ctrl+Shift+F` | Anuncia a entrada no modo foco; as barras somem |
| 6.2 | `Tab` | Chega às barras, que aparecem; cada botão é anunciado |
| 6.3 | `Esc` | Sai do modo foco; anuncia a saída |
| 6.4 | `Ctrl+K`, "modo foco por 5" | Entra com saída planejada; ao cumprir, anuncia que encerrou, sem diálogo |

## 7. Uma ideia por vez
| # | Ação | Esperado |
|---|---|---|
| 7.1 | `Ctrl+Shift+B` | Anuncia que ligou; o leitor de tela continua lendo tudo (o esmaecido é só visual) |
| 7.2 | `↓`, `↑` | Passa de bloco; nas pontas, o capítulo ou a página vizinha |
| 7.3 | `Esc` | Desliga por último (depois do modo foco e dos painéis) |

## 8. Destaques
| # | Ação | Esperado |
|---|---|---|
| 8.1 | `Ctrl+D` sem seleção, no lado principal | Abre a barra "na frase atual", com o foco na primeira cor; anuncia a frase e o nome da cor |
| 8.2 | `Alt+↓`, `Alt+↑` | Muda de frase (anuncia a nova); `Alt+Shift+↓` estende o trecho |
| 8.3 | `→`/`←` na barra | Passa por cores, motivos, Nota, Copiar, Fixar ao lado, Ouvir; os nomes são anunciados |
| 8.4 | `Enter` numa cor | Anuncia "Destaque amarelo criado."; o foco volta ao texto |
| 8.5 | `Ctrl+K`, "mostrar os destaques" | Abre a aba Destaques, com o foco nela; cada destaque é lido com a cor em palavras, o motivo, o capítulo e a nota |
| 8.6 | No item, o seletor de motivo e os botões | Nomes com o trecho ("Fixar ao lado: …", "Apagar destaque: …") |
| 8.7 | "Apagar destaque" | Anuncia o aviso com "Desfazer" |
| 8.8 | Barra → "Nota" | Abre o diálogo; `Ctrl+Enter` salva; anuncia "Nota salva." |
| 8.9 | Fixar um destaque e `Tab` até o cartão | Anuncia "Fixado", o trecho e os botões Ir até lá, Abrir ao lado, Nota, Desafixar; ao desafixar, o foco volta ao texto |

## 9. Leitura em voz alta
Com o Orca ligado as duas vozes se sobrepõem: pause o Orca (`Orca+S`) ou só confira os anúncios e os controles.

| # | Ação | Esperado |
|---|---|---|
| 9.1 | "Ler em voz alta" | Lê a partir da página; a frase lida fica realçada; os botões viram "Pausar leitura" e "Parar leitura" |
| 9.2 | Pausar e continuar | Retoma da frase em que parou |
| 9.3 | `Ctrl+D` lendo | A voz pausa; a barra abre sobre a frase lida; fechar a barra retoma |
| 9.4 | Barra → "Ouvir" | Lê a partir do trecho |

## 10. Sessão: meta, ritmo e continuação
| # | Ação | Esperado |
|---|---|---|
| 10.1 | `Ctrl+K`, "25 min" | Define a meta; o rodapé diz "Meta: 0 de 25 min", com o botão "Tirar a meta da sessão" |
| 10.2 | `Ctrl+K`, "1 página" (PDF) e virar | Abre "Meta cumprida", com o foco em "Continuar lendo"; o resumo é lido; `Esc` continua |
| 10.3 | `Ctrl+K`, "quanto falta" | Anuncia a estimativa (ou que ainda não há leitura bastante) |
| 10.4 | Reabrir um livro depois de 1 h ou mais | O cartão "Onde você parou" é anunciado, sem prender o foco; `Esc` o fecha |

## 11. Lado a lado
| # | Ação | Esperado |
|---|---|---|
| 11.1 | `Ctrl+Shift+L` | Anuncia que o lado abriu e que `F6` alterna; o foco vai ao lado |
| 11.2 | `F6` | Anuncia o lado: "Livro principal, 12%" ou "Ao lado: <seção>, 45%"; no PDF, com a página |
| 11.3 | `→` com o foco no lado | Vira só o lado; ao mudar de seção (EPUB), anuncia "Lado: <seção>" |
| 11.4 | `Tab` até o rodapé | O grupo "Ao lado" é anunciado, com os controles de página e "Fechar o lado" |
| 11.5 | No PDF, `Ctrl+K`, "ao lado 3" | Leva o lado à página 3 |
| 11.6 | `Ctrl+D` com o foco no lado, sem seleção | Abre a barra na frase atual do lado; `Alt+↓`/`Alt+↑` mudam de frase; a barra não oferece "Ouvir" (a voz é só do principal); o destaque aparece nos dois lados |
| 11.7 | `Ctrl+Shift+L` | Anuncia "Lado fechado."; o foco volta ao principal |

## 12. Arquivos problemáticos
| # | Ação | Esperado |
|---|---|---|
| 12.1 | Abrir um PDF com senha | Abre "PDF protegido por senha, diálogo", com o foco no campo "Senha"; a explicação é lida |
| 12.2 | Senha errada e `Enter` | Anuncia "Senha incorreta. Tente de novo."; o campo fica vazio e com o foco |
| 12.3 | `Esc` | Volta à biblioteca, sem mensagem de erro |
| 12.4 | Importar um arquivo danificado (`Ctrl+O`) | O aviso de erro é anunciado na hora, com o nome do arquivo e o motivo |

## Resultado
Para cada passo que divergiu, registre: número do passo, o que o Orca disse e o que você esperava.
