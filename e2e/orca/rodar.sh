#!/usr/bin/env bash
# Executa o docs/testes/orca.md com o Orca de verdade, sem áudio, e guarda o que ele teria dito (o log
# dele traz o texto de cada fala). Sessão isolada: nada toca no Orca nem nas configurações de quem usa.
# Sai em orca/falas.tsv: passo, ação e falas. As teclas chegam ao app, não ao Orca: comandos do próprio Orca
# (Orca+A, leitura pelas setas no modo de navegação) não são testados aqui.
# Nesta pasta (e2e/): ./virtual.sh npm run orca
set -u
export ORCA_SAIDA="$PWD/orca/falas.tsv"
: > "$ORCA_SAIDA"
unset WAYLAND_DISPLAY GDK_SCALE GDK_DPI_SCALE
export GDK_BACKEND=x11 GSETTINGS_BACKEND=memory LANG="${ORCA_LANG:-pt_BR.UTF-8}"
CODIGO=0
# ORCA_SPECS: quais roteiros (padrão: epub pdf senha; "voz" é a parte 9, que baixa a voz natural).
for FOLIO_SPEC in ${ORCA_SPECS:-epub pdf senha}; do
  export FOLIO_SPEC
  # Na voz, o som vai a um dispositivo nulo (a sessão isolada não alcança o servidor de som).
  if [ "$FOLIO_SPEC" = voz ]; then export ALSA_CONFIG_PATH="$PWD/orca/asound.conf"; else unset ALSA_CONFIG_PATH; fi
  PASTA=$(mktemp -d); chmod 700 "$PASTA"
  export ORCA_LOG="$PASTA/orca.log" XDG_RUNTIME_DIR="$PASTA" XDG_CONFIG_HOME="$PASTA/config" XDG_DATA_HOME="$PASTA/dados"
  /usr/lib/at-spi-bus-launcher --launch-immediately &
  BARRAMENTO=$!
  sleep 1
  AT_SPI_BUS_ADDRESS=$(gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus \
    --method org.a11y.Bus.GetAddress | sed -E "s/^\('(.*)',\)$/\1/")
  export AT_SPI_BUS_ADDRESS
  /usr/lib/at-spi2-registryd &
  REGISTRO=$!
  sleep 1
  orca --replace --debug-file="$ORCA_LOG" > /dev/null 2>&1 &
  ORCA=$!
  sleep 3
  npx wdio run wdio.conf.js || CODIGO=1
  kill "$ORCA" "$REGISTRO" "$BARRAMENTO" 2>/dev/null
  wait "$ORCA" "$REGISTRO" "$BARRAMENTO" 2>/dev/null
  # ORCA_GUARDAR_LOG=<arquivo>: guarda o log do Orca (o diagnóstico de uma queda); apague-o depois.
  [ -n "${ORCA_GUARDAR_LOG:-}" ] && cp "$ORCA_LOG" "$ORCA_GUARDAR_LOG.$FOLIO_SPEC"
  rm -rf "$PASTA"
done
exit $CODIGO
