#!/usr/bin/env python3
"""Gera THIRD-PARTY-NOTICES.md: o que vai dentro do Folio e sob qual licença (M26e).

MIT, Apache, BSD e OFL pedem que os avisos de copyright acompanhem o programa. O arquivo sai dos
lockfiles (`cargo tree` e `ui/package-lock.json`), com o texto de licença que cada pacote traz, e
vai no AppImage. Rodar da raiz, depois de `npm ci` em `ui/`: python3 scripts/avisos_de_terceiros.py
A CI o gera de novo a cada AppImage, para nunca sair desatualizado.
"""

import hashlib
import json
import re
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "THIRD-PARTY-NOTICES.md"
NOMES_DE_LICENCA = re.compile(r"^(licen[cs]e|copying|notice|unlicense)", re.IGNORECASE)

# No bundle do frontend, sem aparecer em `dependencies`: o Svelte é compilado junto, com o que usa.
NPM_NO_BUNDLE = ["svelte", "clsx", "esm-env"]

CABECALHO = """# Avisos de terceiros

O Folio é distribuído sob a GPL-3.0-or-later (arquivo `LICENSE`). Ele inclui os componentes abaixo,
cada um sob a própria licença. Este arquivo é gerado por `scripts/avisos_de_terceiros.py`.

## Bibliotecas do sistema no AppImage

O AppImage leva bibliotecas do sistema, ligadas dinamicamente e substituíveis, entre elas o
**WebKitGTK** e o **GTK** (LGPL-2.1-or-later), o **GStreamer** (LGPL-2.1-or-later) e as dependências
delas. O código-fonte está nos sites dos projetos e nos pacotes-fonte do Ubuntu 22.04, a base do
AppImage: <https://webkitgtk.org>, <https://www.gtk.org>, <https://gstreamer.freedesktop.org>.

O Folio conversa com o speech-dispatcher (GPL), quando instalado, por um socket: ele não é incluído
nem ligado ao programa.
"""

# Embutidos em ui/src/vendor/foliate-js/vendor, minificados, sem pasta de pacote.
EMBUTIDOS = {
    "zip.js (embutido no foliate-js)": (
        "BSD-3-Clause",
        "https://github.com/gildas-lormeau/zip.js",
        "Copyright (c) Gildas Lormeau. Texto da licença: https://spdx.org/licenses/BSD-3-Clause.html",
    ),
    "fflate (embutido no foliate-js)": (
        "MIT",
        "https://github.com/101arrowz/fflate",
        "Copyright (c) Arjun Barrett. Texto da licença: https://spdx.org/licenses/MIT.html",
    ),
}


def textos_de_licenca(pasta: Path, licenca: str) -> list[str]:
    """Os textos de licença de um pacote; numa dupla licença com MIT, só o da MIT."""
    arquivos = sorted(
        f for f in pasta.iterdir() if f.is_file() and NOMES_DE_LICENCA.match(f.name)
    ) if pasta.is_dir() else []
    so_mit = [f for f in arquivos if "mit" in f.name.lower()]
    if "MIT" in licenca and so_mit:
        arquivos = so_mit + [f for f in arquivos if f.name.lower().startswith("notice")]
    return [f.read_text(errors="replace").strip() for f in arquivos]


def crates() -> list[tuple[str, str, str, str, list[str]]]:
    """Os crates que vão no binário (sem os só de teste), para Linux."""
    arvore = subprocess.run(
        ["cargo", "tree", "-e", "normal,build", "--target", "x86_64-unknown-linux-gnu",
         "--prefix", "none", "-f", "{p}", "-p", "folio"],
        cwd=RAIZ, check=True, capture_output=True, text=True,
    ).stdout
    usados = {tuple(l.split()[:2]) for l in arvore.splitlines() if l.strip()}
    metadados = json.loads(
        subprocess.run(
            ["cargo", "metadata", "--format-version", "1", "--locked"],
            cwd=RAIZ, check=True, capture_output=True, text=True,
        ).stdout
    )
    saida = []
    for p in metadados["packages"]:
        if (p["name"], f"v{p['version']}") not in usados or p["source"] is None:
            continue
        pasta = Path(p["manifest_path"]).parent
        licenca = p["license"] or "ver o texto"
        saida.append((p["name"], p["version"], licenca, p["repository"] or "", textos_de_licenca(pasta, licenca)))
    return saida


def pacotes_npm() -> list[tuple[str, str, str, str, list[str]]]:
    """Os pacotes npm que entram no bundle: `dependencies` e o que elas usam, mais o Svelte."""
    ui = RAIZ / "ui"
    lock = json.loads((ui / "package-lock.json").read_text())["packages"]
    pendentes = list(lock[""]["dependencies"]) + NPM_NO_BUNDLE
    vistos: set[str] = set()
    saida = []
    while pendentes:
        nome = pendentes.pop()
        if nome in vistos or f"node_modules/{nome}" not in lock:
            continue
        vistos.add(nome)
        dados = lock[f"node_modules/{nome}"]
        pendentes += list(dados.get("dependencies", {}))
        pasta = ui / "node_modules" / nome
        repositorio = ""
        manifesto = pasta / "package.json"
        if manifesto.exists():
            r = json.loads(manifesto.read_text()).get("repository", "")
            repositorio = r.get("url", "") if isinstance(r, dict) else r
        licenca = dados.get("license", "ver o texto")
        saida.append((nome, dados["version"], licenca, repositorio, textos_de_licenca(pasta, licenca)))
    return saida


def foliate() -> list[tuple[str, str, str, str, list[str]]]:
    pasta = RAIZ / "ui/src/vendor/foliate-js"
    lista = [("foliate-js", "78914ae", "MIT", "https://github.com/johnfactotum/foliate-js",
              textos_de_licenca(pasta, "MIT"))]
    for nome, (licenca, repo, texto) in EMBUTIDOS.items():
        lista.append((nome, "", licenca, repo, [texto]))
    return lista


def secao(titulo: str, pacotes: list) -> list[str]:
    """Uma lista de pacotes; os textos iguais aparecem uma vez, no fim da seção."""
    linhas = [f"\n## {titulo}\n"]
    textos: dict[str, tuple[int, str]] = {}
    for nome, versao, licenca, repo, lista in sorted(pacotes, key=lambda p: (p[0].lower(), p[1])):
        marcas = []
        for t in lista:
            chave = hashlib.sha256(t.encode()).hexdigest()
            if chave not in textos:
                textos[chave] = (len(textos) + 1, t)
            marcas.append(f"[texto {textos[chave][0]}]")
        repo_limpo = re.sub(r"^git\+|\.git$", "", repo)
        partes = [f"**{nome}** {versao}".rstrip(), licenca]
        if repo_limpo:
            partes.append(repo_limpo)
        partes += marcas
        linhas.append("- " + " · ".join(partes))
    linhas.append(f"\n### Textos das licenças ({titulo})\n")
    for numero, texto in textos.values():
        linhas.append(f"#### Texto {numero}\n\n```text\n{texto}\n```\n")
    return linhas


def main() -> None:
    lista_crates, lista_npm, lista_foliate = crates(), pacotes_npm(), foliate()
    linhas = [CABECALHO]
    linhas += secao("Crates Rust", lista_crates)
    linhas += secao("Pacotes npm (frontend e fontes)", lista_npm)
    linhas += secao("foliate-js", lista_foliate)
    SAIDA.write_text("\n".join(linhas).rstrip() + "\n")
    print(f"{SAIDA.name}: {len(lista_crates)} crates, {len(lista_npm)} pacotes npm, "
          f"{SAIDA.stat().st_size // 1024} KB")
    sem_texto = [p[0] for p in lista_crates + lista_npm + lista_foliate if not p[4]]
    if sem_texto:
        print(f"sem arquivo de licença ({len(sem_texto)}), só a licença declarada: {', '.join(sem_texto)}")


if __name__ == "__main__":
    main()
