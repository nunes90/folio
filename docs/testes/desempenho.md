# Roteiro de desempenho (manual)

Cenários pesados do Folio, para medir antes de uma versão e comparar com a anterior. Não há como
rodá-los na CI: dependem do WebKitGTK, da placa de vídeo e do compositor. Anote os números na
tabela do fim, com a data e a versão.

## Preparação
- Rode o build de produção (`cargo tauri build --no-bundle` e `target/release/folio`), não o
  `cargo tauri dev`: o modo de desenvolvimento é mais lento e mede outra coisa.
- Livros: um PDF grande (80 MB ou mais, de preferência com muitas imagens), um PDF de texto com
  sumário e um EPUB longo (centenas de páginas).
- Memória: `scripts/memoria.sh` num terminal ao lado (só lê `/proc`; mede o app e o WebKit).
- Quadros por segundo da virada: com `RUST_LOG=folio=debug`, ou pondo temporariamente o registro
  `[diag]` da virada (ver o M25b no histórico) e lendo o log em `~/.local/state/folio/logs`.

## Medição automática do PDF
Para comparar antes e depois sem abrir janelas: `FOLIO_MEDIR=<pdf> ./virtual.sh npm test`, em `e2e/` (o app compilado,
como nos testes E2E). Abrir, virar 20 páginas no original e na noite, lado a lado e memória: linhas `[medida]` na saída.
É uma tela virtual, sem placa de vídeo: vale para comparar duas versões, não como número absoluto.

## De onde vem a memória de um PDF (M39)
`FOLIO_MEDIR_MEMORIA=<pdf> ./virtual.sh npm test`, em `e2e/`: a sessão começa com um EPUB (o processo da página ainda sem
o pdf.js), importa o PDF, abre-o na página `FOLIO_MEDIR_PAGINA` e mede a **memória anônima** do processo da página.
`FOLIO_MEDIR_SEM="sem-sumario sem-idioma"` desliga partes da abertura; `area=16` e `trecho=64` experimentam opções do
pdf.js. Sem `FOLIO_MEDIR_CURTO=1`, segue virando 30 páginas e soltando uma coisa de cada vez.

Medido na v1.3.0 com um PDF de 86 MB, 742 páginas e 508 entradas no sumário (tela virtual). **Entre duas rodadas iguais
a diferença chega a 40 MB** (o coletor de lixo e o alocador do WebKit rodam quando querem): só vale o que se repete.

| O quê | Memória a mais | Como se sabe |
|---|---|---|
| O pdf.js em si (PDF de 3 páginas) | ~30 MB | abrir o `texto.pdf` |
| Um documento grande, numa página de texto, sem sumário nem idioma | ~90 MB | página 300, `sem-sumario sem-idioma` |
| O sumário (a página de cada uma das 508 entradas) | ~65 MB | com e sem `sem-sumario` |
| A detecção de idioma pelo texto (até 6 páginas) | ~10 MB | com e sem `sem-idioma` |
| A página da capa (uma imagem de 4 a 8 megapixels) | até ~80 MB, que somem no total | ver abaixo |
| **Total, abrindo na capa** | **+180 a +265 MB** | 6 rodadas |
| **Total, abrindo numa página de texto** | **+155 a +170 MB** | 3 rodadas |
| Virar 30 páginas | +14 MB | |
| Depois de fechar o livro | ~95 MB não voltam | o alocador não devolve ao sistema |

O que **não** é: as páginas guardadas pelo visor nem os canvas (na exibição página a página há um canvas de 1 MB na
tela); nem o arquivo (só 10 MB dele são lidos; o tamanho dos trechos não muda nada). Soltar as fontes e imagens do
documento (`cleanup`) devolve 5 MB.

**O limite de tamanho das imagens (`canvasMaxAreaInBytes`) foi testado e descartado.** Com o sumário desligado, limitar
a 16 MB (4 megapixels) tira 80 MB da abertura na capa, de forma repetível. Com tudo ligado, o ganho some no ruído
(+242 a +255 com o limite; +181 a +266 sem): a memória que a decodificação da capa libera é a que o sumário ocupa em
seguida. Em troca, PDFs escaneados ficariam menos nítidos com zoom.

**O que reduziria de verdade**: resolver só as entradas do sumário que são necessárias (busca binária pela página
atual), ~65 MB em PDFs de sumário enorme. Adiado: mexe em tudo o que usa a seção atual e depende de o sumário estar em
ordem de página.

## Cenários
| # | Cenário | O que medir | Aceitável |
|---|---|---|---|
| 1 | Abrir o app com a biblioteca cheia | tempo até a grade aparecer | < 1 s |
| 2 | Importar o PDF grande | tempo até o aviso "importado" | < 2 s |
| 3 | Abrir o PDF grande e virar 20 páginas (esmaecer) | qps da virada; memória depois | ~60 qps; memória estável ao virar mais |
| 4 | O mesmo na página noite | qps; tempo até a página aparecer | ~60 qps; sem clarão branco |
| 5 | Lado a lado no PDF grande (Ctrl+Shift+L), virar nos dois lados | memória (comparar com o 3); qps | + poucos MB; ≥ 45 qps |
| 6 | Lado a lado + noite | idem | idem |
| 7 | EPUB longo: abrir, ir ao meio pelo índice, virar 20 páginas | qps; tempo da troca de capítulo | ~60 qps; < 300 ms |
| 8 | Uma ideia por vez no EPUB e no PDF, 20 blocos com ↓ | a rolagem acompanha sem engasgar | sem saltos |
| 9 | Ler em voz alta 5 min (PDF e EPUB) | memória no começo e no fim; o realce acompanha | memória estável |
| 10 | Sessão de 30 min com meta e voz | memória a cada 10 min | sem crescer sem parar |

## Arquivos problemáticos (M26b)
Em `tests/fixtures/quebrados/` (ver o README das fixtures). Importar e abrir cada um:

| Arquivo | Esperado |
|---|---|
| `pdf-protegido-aes.pdf`, `pdf-protegido-rc4.pdf` | entram com título e autores; abrem sem pedir senha |
| `pdf-com-senha.pdf` | entra com o nome do arquivo; ao abrir, pede a senha (`usuario`); errada, avisa e pede de novo; Cancelar volta à biblioteca, sem mensagem de erro |
| `pdf-xref-errada.pdf` | entra e abre (o pdf.js reconstrói a tabela) |
| `pdf-cortado.pdf` | recusado: "o PDF está danificado ou incompleto" |
| `sem-indice.epub` | entra e abre; o índice diz que o livro não tem índice |
| `opf-invalido.epub` | recusado: "o EPUB está danificado: não foi possível ler o conteúdo" |

## Resultados
| Data | Versão | Máquina | Cenário | Resultado |
|---|---|---|---|---|
| 29/10/2026 | 0.9.0 (dev) | Hyprland, NVIDIA, 4K a 1,6 | 5 (EPUB) | memória +1–2 MB; esmaecer 47–65 qps |
