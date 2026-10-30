#!/usr/bin/env bash
# O WebKitGTK aborta o processo da página quando um leitor de tela pede os atributos de texto de certos
# objetos (provavelmente o bug 284246 do WebKit, aberto, duplicata do 270354). Não dá para prever pela
# marcação: a sequência de atributos iguais passa do objeto e estoura um vetor, conforme o texto vizinho.
# Na interface, os contêineres só de botões ficam sem caixa própria (`li` com `display: contents`,
# `.grupo-sem-caixa`); nos livros, ver lib/contornosWebkit.ts.
#
# Isto sobe um barramento de acessibilidade só para o teste (sem ele, o WebKitGTK nem expõe a árvore) e
# roda specs/leitor-de-tela*.e2e.js, sem Orca e sem áudio: `percorrer.py` faz os pedidos que derrubavam.
# Rodar nesta pasta (e2e/): ./virtual.sh npm run test:leitor-de-tela
set -u
achar() {
  for p in "/usr/lib/$1" "/usr/libexec/$1" "/usr/lib/at-spi2-core/$1"; do
    [ -x "$p" ] && { echo "$p"; return; }
  done
  echo "$1 não encontrado (pacote at-spi2-core)" >&2
  exit 2
}
LANCADOR=$(achar at-spi-bus-launcher) || exit 2
REGISTRO=$(achar at-spi2-registryd) || exit 2
CODIGO=0
# Um barramento por sessão do app: o registro não sobrevive ao fim de uma.
for FOLIO_SPEC in epub pdf; do
  export FOLIO_SPEC
  XDG_RUNTIME_DIR=$(mktemp -d)
  export XDG_RUNTIME_DIR
  chmod 700 "$XDG_RUNTIME_DIR"
  "$LANCADOR" --launch-immediately &
  BARRAMENTO=$!
  sleep 1
  AT_SPI_BUS_ADDRESS=$(gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus \
    --method org.a11y.Bus.GetAddress | sed -E "s/^\('(.*)',\)$/\1/")
  export AT_SPI_BUS_ADDRESS
  "$REGISTRO" &
  REGISTRYD=$!
  sleep 1
  npx wdio run wdio.conf.js || CODIGO=1
  kill "$REGISTRYD" "$BARRAMENTO" 2>/dev/null
  wait "$REGISTRYD" "$BARRAMENTO" 2>/dev/null
  rm -rf "$XDG_RUNTIME_DIR"
done
exit $CODIGO
