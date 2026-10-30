#!/usr/bin/env bash
# Memória (PSS, em MB) do Folio aberto: o app e os processos do WebKit. Só lê /proc: não abre
# janela nem mexe no app. Usado no roteiro de desempenho (docs/testes/desempenho.md).
total=0
for p in $(pgrep -x folio) $(pgrep -x WebKitWebProces) $(pgrep -x WebKitNetworkP) $(pgrep -x WebKitGPUProces); do
  [ -r "/proc/$p/smaps_rollup" ] || continue
  pss=$(awk '/^Pss:/ {print $2}' "/proc/$p/smaps_rollup")
  printf "%-18s pid %-8s %6d MB\n" "$(cat "/proc/$p/comm")" "$p" $((pss / 1024))
  total=$((total + pss))
done
echo "total: $((total / 1024)) MB"
