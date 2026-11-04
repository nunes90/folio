#!/usr/bin/env bash
# Confere um AppImage do Folio (M6b): o .desktop e, numa tela virtual, se ele abre um livro como o
# "Abrir com" do sistema. Não usa FUSE nem os dados de ninguém (pastas temporárias).
# Também o espeak-ng embutido (a voz natural).
# Uso, numa sessão D-Bus e numa tela (a CI usa xvfb-run e dbus-run-session):
#   scripts/testar_appimage.sh Folio.AppImage tests/fixtures/dom-casmurro.epub
# Requer sqlite3 e desktop-file-validate.
set -u
APPIMAGE=$(realpath "$1")
LIVRO=$(realpath "$2")
PASTA=$(mktemp -d)
trap 'kill "${APP:-}" 2>/dev/null; rm -rf "$PASTA"' EXIT

cd "$PASTA" || exit 1
"$APPIMAGE" --appimage-extract > /dev/null || { echo "FALHOU: não extraiu o AppImage"; exit 1; }
DESKTOP=(squashfs-root/*.desktop)
desktop-file-validate "${DESKTOP[0]}" || { echo "FALHOU: .desktop inválido"; exit 1; }
for esperado in 'Exec=folio %f' 'Name=Folio' 'Icon=folio' 'application/epub+zip' 'application/pdf'; do
  grep -qF "$esperado" "${DESKTOP[0]}" || { echo "FALHOU: .desktop sem '$esperado'"; exit 1; }
done
for arquivo in LICENSE THIRD-PARTY-NOTICES.md; do
  [ -s "squashfs-root/usr/lib/Folio/$arquivo" ] || { echo "FALHOU: sem $arquivo"; exit 1; }
done
# O espeak-ng da voz natural (M27d-2): a biblioteca, as dependências dela (sem nenhuma a instalar) e os
# dados do inglês.
ESPEAK=squashfs-root/usr/lib/folio/espeak-ng
for arquivo in libespeak-ng.so.1 COPYING espeak-ng-data/en_dict espeak-ng-data/phontab; do
  [ -s "$ESPEAK/$arquivo" ] || { echo "FALHOU: espeak-ng sem $arquivo"; exit 1; }
done
if LD_LIBRARY_PATH=squashfs-root/usr/lib ldd "$ESPEAK/libespeak-ng.so.1" | grep -q "not found"; then
  echo "FALHOU: falta dependência do espeak-ng"; LD_LIBRARY_PATH=squashfs-root/usr/lib ldd "$ESPEAK/libespeak-ng.so.1"; exit 1
fi

export XDG_DATA_HOME="$PASTA/dados" XDG_CACHE_HOME="$PASTA/cache" XDG_STATE_HOME="$PASTA/estado"
export XDG_CONFIG_HOME="$PASTA/config" GDK_BACKEND=x11
unset WAYLAND_DISPLAY
squashfs-root/AppRun "$LIVRO" > "$PASTA/saida.log" 2>&1 &
APP=$!

# O livro aberto de verdade: a sessão de leitura só começa com o primeiro progresso do leitor, depois
# de o frontend carregar, importar e desenhar o livro.
BANCO="$XDG_DATA_HOME/io.github.nunes90.folio/biblioteca.sqlite3"
for _ in $(seq 1 60); do
  sleep 1
  if ! kill -0 "$APP" 2>/dev/null; then
    echo "FALHOU: o app fechou"; tail -30 "$PASTA/saida.log"; exit 1
  fi
  ABERTO=$(sqlite3 -readonly "$BANCO" "SELECT count(*) FROM sessoes" 2>/dev/null || echo 0)
  if [ "${ABERTO:-0}" -ge 1 ]; then
    echo "ok: o AppImage abriu $(basename "$LIVRO")"
    exit 0
  fi
done
echo "FALHOU: o livro não abriu em 60 s"
tail -30 "$PASTA/saida.log"
exit 1
