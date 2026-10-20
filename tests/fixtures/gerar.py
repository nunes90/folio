"""Gera as fixtures pequenas de teste. Rodar da raiz: python3 tests/fixtures/gerar.py

dom-casmurro.epub não é gerado: veio do Project Gutenberg (#55752, domínio público).
"""

import zipfile
from pathlib import Path

AQUI = Path(__file__).parent

CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="pt-BR">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:00000000-0000-4000-8000-000000000001</dc:identifier>
    <dc:title>Livro Mínimo</dc:title>
    <dc:creator>Leitor</dc:creator>
    <dc:language>pt-BR</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cap1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cap2" href="cap2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="cap1"/>
    <itemref idref="cap2"/>
  </spine>
</package>
"""

NAV = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR">
<head><title>Índice</title></head>
<body>
  <nav epub:type="toc">
    <ol>
      <li><a href="cap1.xhtml">Capítulo 1</a></li>
      <li><a href="cap2.xhtml">Capítulo 2</a></li>
    </ol>
  </nav>
</body>
</html>
"""


def capitulo(n: int) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head><title>Capítulo {n}</title></head>
<body><h1>Capítulo {n}</h1><p>Texto do capítulo {n}.</p></body>
</html>
"""


def epub(caminho: Path, mimetype: bytes | None, *, comprimir_mimetype: bool = False) -> None:
    with zipfile.ZipFile(caminho, "w") as z:
        if mimetype is not None:
            tipo = zipfile.ZIP_DEFLATED if comprimir_mimetype else zipfile.ZIP_STORED
            z.writestr(zipfile.ZipInfo("mimetype", (2026, 1, 1, 0, 0, 0)), mimetype, compress_type=tipo)
        arquivos = {
            "META-INF/container.xml": CONTAINER,
            "OEBPS/content.opf": OPF,
            "OEBPS/nav.xhtml": NAV,
            "OEBPS/cap1.xhtml": capitulo(1),
            "OEBPS/cap2.xhtml": capitulo(2),
        }
        for nome, conteudo in arquivos.items():
            info = zipfile.ZipInfo(nome, (2026, 1, 1, 0, 0, 0))
            z.writestr(info, conteudo, compress_type=zipfile.ZIP_DEFLATED)


PDF_MINIMO = b"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj
trailer << /Root 1 0 R >>
%%EOF
"""

if __name__ == "__main__":
    epub(AQUI / "minimo.epub", b"application/epub+zip")
    epub(AQUI / "quebrados/mimetype-errado.epub", b"application/zip")
    epub(AQUI / "quebrados/sem-mimetype.epub", None)
    epub(AQUI / "quebrados/mimetype-comprimido.epub", b"application/epub+zip", comprimir_mimetype=True)
    (AQUI / "quebrados/truncado.epub").write_bytes((AQUI / "minimo.epub").read_bytes()[:20])
    (AQUI / "quebrados/vazio.epub").write_bytes(b"")
    (AQUI / "quebrados/texto.epub").write_text("isto não é um epub\n")
    (AQUI / "minimo.pdf").write_bytes(PDF_MINIMO)
    (AQUI / "pdf-com-lixo-antes.pdf").write_bytes(b"\x00" * 100 + PDF_MINIMO)
