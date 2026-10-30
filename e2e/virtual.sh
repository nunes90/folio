#!/usr/bin/env bash
# Roda um comando dos testes numa tela virtual e numa sessão D-Bus próprias: nada aparece na tela de
# quem está usando o computador. Uso: ./virtual.sh npm test
# Sem portais: dentro da sessão nova, o do compositor (ex.: xdg-desktop-portal-hyprland) seria ativado
# sem ter a que se conectar, e cairia a cada execução, com notificação de crash no desktop.
XDG_DESKTOP_PORTAL_DIR=$(mktemp -d)
export XDG_DESKTOP_PORTAL_DIR
xvfb-run --auto-servernum dbus-run-session -- "$@"
CODIGO=$?
rm -rf "$XDG_DESKTOP_PORTAL_DIR"
exit $CODIGO
