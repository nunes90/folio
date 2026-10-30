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
