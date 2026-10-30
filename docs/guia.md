# Guia de uso do Folio

Duas teclas valem em qualquer tela: **`Ctrl+K`** abre a paleta de comandos (digite o que quer fazer) e **`F1`**
mostra os atalhos daquela tela. Todo recurso abaixo pode ser usado só com o teclado.

## Biblioteca

| Para | Faça |
|---|---|
| Importar livros | `Ctrl+O`, ou arraste os arquivos para a janela |
| Abrir um livro | `Enter` no livro (setas, `Home` e `End` andam entre eles) |
| Buscar por título ou autor | `Ctrl+F` |
| Marcar como favorito, para ler ou lido; pôr numa coleção | `Shift+F10` ou a tecla `Menu` no livro (ou os ícones do cartão) |
| Mandar para a lixeira | `Delete`; o aviso oferece "Desfazer" |

O Folio guarda uma cópia do livro; o arquivo original não é alterado. Um arquivo danificado é recusado, com o motivo.
Um PDF com senha entra na biblioteca e pede a senha ao abrir, sem guardá-la.

## Ler

| Para | Faça |
|---|---|
| Virar a página | `←` `→`, `Page Up` `Page Down` |
| Ir a um capítulo | o Índice, ou a paleta ("Ir para: …") |
| Ir a uma página (PDF) | digite o número na paleta: `42` |
| Buscar no documento (PDF) | `Ctrl+F` |
| Zoom (PDF) | `Ctrl++`, `Ctrl+−`, `Ctrl+0` (ajustar à largura) |
| Voltar à biblioteca | o botão ‹ no cabeçalho, ou a paleta |

O ponto de leitura é guardado sozinho. Ao reabrir um livro depois de uma hora ou mais, o cartão "Onde você parou"
mostra as frases logo antes de onde você estava; `Esc` o fecha e o ponto pisca de leve.

## Aparência

O botão **Aparência** tem três partes, com prévia ao vivo:

- **Interface:** tema (sistema, claro, escuro, alto contraste) e animações.
- **Página:** a cor da página (automática, original, creme, sépia, noite, nos dois formatos) e a virada de página.
- **Texto** (só EPUB): fonte, tamanho, entrelinha, espaçamentos, caracteres por linha, colunas, alinhamento e hifenização.
  Aumentar a letra alarga a coluna junto, e a linha continua com o mesmo tanto de caracteres.

## Destacar

| Para | Faça |
|---|---|
| Destacar a frase atual | `Ctrl+D`, sem seleção: abre a barra sobre a frase |
| Destacar um trecho com o mouse | selecione: a barra aparece ao soltar |
| Trocar de frase na barra | `Alt+↑` `Alt+↓` |
| Aumentar ou diminuir o trecho | `Alt+Shift+↑` `Alt+Shift+↓` |
| Escolher na barra | `←` `→` andam entre as opções, `Enter` escolhe, `Esc` fecha |

Na barra: a **cor**, o **motivo** (dúvida, citar, revisar), **Nota**, **Copiar**, **Fixar ao lado** e **Ouvir**. A aba
**Destaques**, no Índice, lista todos na ordem de leitura e filtra por motivo; "Exportar em Markdown…" exporta todos
ou só os do motivo filtrado.

## Ouvir

"Ler em voz alta" fica no rodapé e na paleta. A frase lida fica realçada, e a leitura segue pelos parágrafos e
capítulos. No PDF, só o texto principal é lido: margem, legendas e número da página ficam de fora. Listas e código
são lidos mais devagar. "Ouvir", na barra de destaque, lê a partir daquele trecho. A velocidade fica na Aparência (seção Texto no EPUB, Página no PDF) e na paleta ("Voz mais rápida", "Voz mais lenta").

Requer o `speech-dispatcher`. A voz é a do sistema, e a padrão (espeak-ng) soa robótica; o speech-dispatcher pode usar
outras vozes.

## Concentrar

| Para | Faça |
|---|---|
| Modo foco: só o livro na tela | `Ctrl+Shift+F`; `Esc` sai. `Tab` mostra as barras |
| Foco com hora para sair | paleta: "Modo foco por 10 min", "até o fim do capítulo" |
| Uma ideia por vez | `Ctrl+Shift+B`, ou Mais opções (⋯); `↑` `↓` passam de bloco; `Esc` sai |
| Meta da sessão | paleta: "25 min", "12 páginas" (PDF), "até o fim do capítulo" (EPUB) |
| Quanto falta | o rodapé mostra, no seu ritmo neste livro; ou a paleta: "Quanto falta?" |

A estimativa só aparece depois de leitura suficiente: folhear ou saltar pelo índice não conta como ler. Os dados das
sessões ficam só no seu computador.

## Comparar trechos

| Para | Faça |
|---|---|
| Abrir o mesmo ponto ao lado | `Ctrl+Shift+L`, ou Mais opções (⋯); de novo fecha |
| Trocar de lado | `F6` |
| Levar o lado a outro ponto | paleta: "Lado: ir para …"; no PDF, "ao lado 87" |
| Fixar um destaque ao lado do texto | "Fixar ao lado" na barra ou na aba Destaques |

Cada lado anda por conta própria, com as setas quando o foco está nele. O lado novo lê e destaca (`Ctrl+D`, como no
principal); voz, meta e progresso ficam só no principal.

## Onde ficam os dados

| O quê | Onde |
|---|---|
| Biblioteca, livros, destaques, sessões | `~/.local/share/io.github.nunes90.folio` |
| Capas | `~/.cache/io.github.nunes90.folio` |
| Registros (logs) | `~/.local/state/folio/logs` |

Nada sai do seu computador. Para fazer uma cópia de segurança, copie a primeira pasta com o Folio fechado.
