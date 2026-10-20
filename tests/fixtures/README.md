# Fixtures de teste

| Arquivo | O que é |
|---|---|
| `dom-casmurro.epub` | EPUB 3 real (Machado de Assis), Project Gutenberg #55752, domínio público |
| `minimo.epub` | EPUB 3 mínimo válido: 2 capítulos e índice |
| `minimo.pdf` | PDF de uma página em branco |
| `pdf-com-lixo-antes.pdf` | PDF com 100 bytes nulos antes de `%PDF-` (leitores como o Acrobat aceitam) |
| `quebrados/mimetype-errado.epub` | ZIP cujo `mimetype` diz `application/zip` |
| `quebrados/sem-mimetype.epub` | ZIP sem o arquivo `mimetype` |
| `quebrados/mimetype-comprimido.epub` | `mimetype` comprimido (a especificação OCF exige que esteja sem compressão) |
| `quebrados/truncado.epub` | primeiros 20 bytes de `minimo.epub` |
| `quebrados/vazio.epub` | 0 bytes |
| `quebrados/texto.epub` | texto puro com extensão `.epub` |

Os arquivos pequenos são gerados por `gerar.py` (rodar da raiz: `python3 tests/fixtures/gerar.py`).
