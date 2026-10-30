# Fixtures de teste

| Arquivo | O que é |
|---|---|
| `dom-casmurro.epub` | EPUB 3 real (Machado de Assis), Project Gutenberg #55752, domínio público |
| `minimo.epub` | EPUB 3 mínimo válido: 2 capítulos e índice, sem capa |
| `capa-epub3.epub` | capa por `properties="cover-image"` em `imagens/minha%20capa.png`; título com entidades XML |
| `capa-epub2.epub` | capa por `<meta name="cover">` (estilo EPUB 2) |
| `minimo.pdf` | PDF de uma página em branco, sem metadados |
| `metadados-utf16.pdf` | 2 páginas; título e autores em UTF-16BE (`Memórias Póstumas`, dois autores separados por `;`) |
| `metadados-pdfdoc.pdf` | 2 páginas; título em PDFDocEncoding com escapes octais e parênteses; autor só com espaços |
| `texto.pdf` | 3 páginas com texto de verdade (Helvetica), título "Documento de Teste" (testes E2E) |
| `pdf-com-lixo-antes.pdf` | PDF com 100 bytes nulos antes de `%PDF-` (leitores como o Acrobat aceitam) |
| `quebrados/mimetype-errado.epub` | ZIP cujo `mimetype` diz `application/zip` (rejeitado) |
| `quebrados/sem-mimetype.epub` | ZIP sem o arquivo `mimetype`, mas com `META-INF/container.xml` (aceito: irregular, mas legível) |
| `quebrados/mimetype-comprimido.epub` | `mimetype` comprimido, contra a especificação OCF (aceito: irregular, mas legível) |
| `quebrados/truncado.epub` | primeiros 20 bytes de `minimo.epub` |
| `quebrados/vazio.epub` | 0 bytes |
| `quebrados/texto.epub` | texto puro com extensão `.epub` |
| `quebrados/sem-indice.epub` | EPUB válido sem nav nem NCX (aceito: o leitor diz que não há índice) |
| `quebrados/opf-invalido.epub` | `content.opf` cortado no meio de uma tag (recusado: EPUB danificado) |
| `quebrados/pdf-protegido-aes.pdf` | `metadados-utf16.pdf` criptografado só com senha de dono, AES-256 (lido normalmente) |
| `quebrados/pdf-protegido-rc4.pdf` | o mesmo com RC4 de 128 bits (lido normalmente) |
| `quebrados/pdf-com-senha.pdf` | senha de usuário `usuario`, AES-256 (entra sem metadados; o leitor pede a senha) |
| `quebrados/pdf-xref-errada.pdf` | `startxref` apontando 7 bytes adiante (a tabela é reconstruída) |
| `quebrados/pdf-cortado.pdf` | metade de `metadados-utf16.pdf` (recusado: PDF danificado) |

Os arquivos pequenos são gerados por `gerar.py` (rodar da raiz: `python3 tests/fixtures/gerar.py`). Os PDFs
criptografados precisam do `qpdf` e mudam a cada geração (a criptografia usa valores aleatórios).
