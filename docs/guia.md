# Guia de uso do Folio

Duas teclas valem em qualquer tela: **`Ctrl+K`** abre a paleta de comandos (digite o que quer fazer) e **`F1`**
mostra os atalhos daquela tela. Todo recurso abaixo pode ser usado só com o teclado.

## Biblioteca

| Para | Faça |
|---|---|
| Importar livros | `Ctrl+O`, ou arraste os arquivos para a janela |
| Abrir um livro | `Enter` no livro (setas, `Home` e `End` andam entre eles) |
| Buscar por título ou autor | `Ctrl+F` |
| Marcar como favorito, para ler ou lido; pôr numa coleção | `Shift+F10` ou a tecla `Menu` no livro, ou o ⋯ do cartão (a estrela do cartão favorita direto) |
| Mandar para a lixeira | `Delete`; o aviso oferece "Desfazer" |

O Folio guarda uma cópia do livro; o arquivo original não é alterado. Um arquivo danificado é recusado, com o motivo.
Um PDF com senha entra na biblioteca e pede a senha ao abrir, sem guardá-la.

## Ler

| Para | Faça |
|---|---|
| Virar a página | `←` `→`, `Page Up` `Page Down` |
| Ir a um capítulo | o Índice, ou a paleta ("Ir para: …") |
| Ir a qualquer ponto do livro | o slider no rodapé: arraste (o balão diz o capítulo) ou, com o foco nele, `←` `→` (um passo), `Page Up` `Page Down` (um décimo), `Home` `End` |
| Ir a uma página (PDF) | digite o número na paleta: `42` |
| Ir a uma porcentagem (EPUB) | digite na paleta: `37%` |
| Buscar no texto do livro (EPUB e PDF) | `Ctrl+F`; `Enter` e `Shift+Enter` andam pelas ocorrências |
| Voltar para onde você estava, depois de um link, do índice, de um destaque ou da busca | `Alt+←` |
| Ler uma nota de rodapé sem sair da página (EPUB) | clique no número da nota: ela abre num balão; `Esc` fecha, "Ir até a nota" leva a ela |
| Zoom (PDF) | `Ctrl++`, `Ctrl+−`, `Ctrl+0` (ajustar à largura) |
| Voltar à biblioteca | o botão ‹ no cabeçalho, ou a paleta |

O ponto de leitura é guardado sozinho. Ao reabrir um livro depois de uma hora ou mais, o cartão "Onde você parou"
mostra as frases logo antes de onde você estava; `Esc` o fecha e o ponto pisca de leve.

## Aparência

O botão **Aparência** abre um painel com três abas (a última usada volta a abrir); a página muda na hora, ao lado:

- **Leitura:** a página (cor: automática, original, creme, sépia, noite, nos dois formatos; a virada de página; no PDF,
  página a página ou rolagem contínua) e, só no EPUB, o texto: fonte, tamanho, entrelinha, espaçamentos, caracteres por
  linha, colunas, alinhamento e hifenização. Aumentar a letra alarga a coluna junto, e a linha continua com o mesmo
  tanto de caracteres.
- **Voz:** a velocidade da leitura em voz alta e a voz natural (ver "Ouvir").
- **Interface:** as cores do app (sistema, claro, escuro, alto contraste), as animações e, no modo foco, mostrar as
  barras só pelo teclado.

Na biblioteca, só as abas Voz e Interface.

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
são lidos mais devagar. "Ouvir", na barra de destaque, lê só aquele trecho (a seleção, a frase ou o destaque) e para; para seguir lendo
o livro, "Ler em voz alta". A velocidade fica na Aparência
(aba Voz) e na paleta ("Voz mais rápida", "Voz mais lenta").

Há duas vozes:

- **A voz natural**, para livros em inglês e em português: uma voz neural que roda no seu computador. Em **Aparência → Voz**, "Baixar
  a voz natural" baixa 152 MB uma vez (dá para cancelar; o resto do app continua funcionando). Depois, escolha a voz
  de cada idioma (no inglês, Heart, Bella e Michael, americanos, e Isabella e George, britânicos; no português, Dora
  e Alex), ouça a amostra e, se quiser, desligue "Usar a voz natural em livros em inglês" ou "… em português". "Remover a voz natural…" apaga o download. A primeira frase pode
  levar um segundo para começar ("Preparando a voz…"). Na paleta: "Baixar a voz natural", "Voz: Heart", "Ouvir amostra
  da voz".
- **As vozes leves** (Piper), só em inglês: Kristin, LJSpeech (femininas), Norman e John (masculinos), americanos.
  Cada uma é um download à parte (~74 MB), soa um pouco menos natural e gera a voz cerca de dez vezes mais rápido:
  boas para computadores mais simples. Ficam em **Aparência → Voz**, em "Vozes leves"; baixada, a voz entra na escolha
  dos livros em inglês (marcada como "leve"). Dá para ter só elas, sem a voz natural.
- **A voz do sistema**, para os outros idiomas (e para o inglês, sem a voz natural). Requer o `speech-dispatcher`; a
  padrão (espeak-ng) soa robótica, e o speech-dispatcher pode usar outras vozes.

O idioma é o do livro: o do EPUB e, no PDF, o que o arquivo declara (sem ele, a voz do sistema). Fora do AppImage, a voz
natural precisa também do pacote `espeak-ng` (para a pronúncia); o AppImage já o traz.

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
| Voz natural (o download) | `~/.local/share/io.github.nunes90.folio/vozes` |
| Registros (logs) | `~/.local/state/folio/logs` |

Nada sai do seu computador. A internet só é usada quando você baixa a voz natural. Para fazer uma cópia de segurança, copie a primeira pasta com o Folio fechado.
