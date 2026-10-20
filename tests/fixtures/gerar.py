"""Gera as fixtures pequenas de teste. Rodar da raiz: python3 tests/fixtures/gerar.py

dom-casmurro.epub não é gerado: veio do Project Gutenberg (#55752, domínio público).
"""

import struct
import zipfile
import zlib
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


def png_1x1() -> bytes:
    def chunk(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados))

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"\0\xff\0\0")) + chunk(b"IEND", b"")


# EPUB 3: capa por `properties="cover-image"`, num subdiretório e com espaço no nome (href codificado).
OPF_CAPA_EPUB3 = OPF.replace(
    "<dc:title>Livro Mínimo</dc:title>",
    "<dc:title>Tom &amp; Jerry &#233; um t&#xED;tulo</dc:title>\n    <dc:creator>Autora Um</dc:creator>",
).replace(
    '<item id="nav"',
    '<item id="img" href="imagens/minha%20capa.png" media-type="image/png" properties="cover-image"/>\n    <item id="nav"',
)

# EPUB 2: capa por `<meta name="cover" content="id"/>`, sem `properties`.
OPF_CAPA_EPUB2 = OPF.replace(
    '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
    '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>\n    <meta name="cover" content="capa-img"/>',
).replace(
    '<item id="nav"',
    '<item id="capa-img" href="capa.png" media-type="image/png"/>\n    <item id="nav"',
)


def epub(
    caminho: Path,
    mimetype: bytes | None,
    *,
    comprimir_mimetype: bool = False,
    opf: str = OPF,
    extras: dict[str, bytes] | None = None,
) -> None:
    with zipfile.ZipFile(caminho, "w") as z:
        if mimetype is not None:
            tipo = zipfile.ZIP_DEFLATED if comprimir_mimetype else zipfile.ZIP_STORED
            z.writestr(zipfile.ZipInfo("mimetype", (2026, 1, 1, 0, 0, 0)), mimetype, compress_type=tipo)
        arquivos = {
            "META-INF/container.xml": CONTAINER,
            "OEBPS/content.opf": opf,
            "OEBPS/nav.xhtml": NAV,
            "OEBPS/cap1.xhtml": capitulo(1),
            "OEBPS/cap2.xhtml": capitulo(2),
        }
        for nome, conteudo in arquivos.items():
            info = zipfile.ZipInfo(nome, (2026, 1, 1, 0, 0, 0))
            z.writestr(info, conteudo, compress_type=zipfile.ZIP_DEFLATED)
        for nome, conteudo in (extras or {}).items():
            z.writestr(zipfile.ZipInfo(nome, (2026, 1, 1, 0, 0, 0)), conteudo)


PDF_MINIMO = b"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj
trailer << /Root 1 0 R >>
%%EOF
"""

if __name__ == "__main__":
    epub(AQUI / "minimo.epub", b"application/epub+zip")
    epub(
        AQUI / "capa-epub3.epub",
        b"application/epub+zip",
        opf=OPF_CAPA_EPUB3,
        extras={"OEBPS/imagens/minha capa.png": png_1x1()},
    )
    epub(
        AQUI / "capa-epub2.epub",
        b"application/epub+zip",
        opf=OPF_CAPA_EPUB2,
        extras={"OEBPS/capa.png": png_1x1()},
    )
    epub(AQUI / "quebrados/mimetype-errado.epub", b"application/zip")
    epub(AQUI / "quebrados/sem-mimetype.epub", None)
    epub(AQUI / "quebrados/mimetype-comprimido.epub", b"application/epub+zip", comprimir_mimetype=True)
    (AQUI / "quebrados/truncado.epub").write_bytes((AQUI / "minimo.epub").read_bytes()[:20])
    (AQUI / "quebrados/vazio.epub").write_bytes(b"")
    (AQUI / "quebrados/texto.epub").write_text("isto não é um epub\n")
    (AQUI / "minimo.pdf").write_bytes(PDF_MINIMO)
    (AQUI / "pdf-com-lixo-antes.pdf").write_bytes(b"\x00" * 100 + PDF_MINIMO)
