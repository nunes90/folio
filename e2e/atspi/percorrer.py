#!/usr/bin/env python3
"""Pede a um leitor de tela o que o Orca pede: os atributos de texto de todo objeto do Folio.

O WebKitGTK aborta o processo da página nesse pedido em certos elementos (ver e2e/atspi/rodar.sh).
Saída 0: passou por tudo. Saída 1: o processo caiu; a última linha diz em qual objeto.
"""
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

def achar_o_app():
    desktop = Atspi.get_desktop(0)
    for _ in range(50):
        for i in range(desktop.get_child_count()):
            app = desktop.get_child_at_index(i)
            if app and app.get_name() == "folio":
                return app
        time.sleep(0.2)
    print("o Folio não apareceu no barramento de acessibilidade")
    sys.exit(2)


def descrever(objeto):
    atributos = objeto.get_attributes() or {}
    pai = objeto.get_parent()
    texto = objeto.get_text_iface()
    trecho = repr(Atspi.Text.get_text(texto, 0, 50)) if texto is not None else ""
    return (
        f"{objeto.get_role_name()} <{atributos.get('tag', '')}> '{(objeto.get_name() or '')[:40]}' {trecho}"
        f", dentro de {pai.get_role_name() if pai else '?'} '{(pai.get_name() or '')[:30] if pai else ''}'"
    )


def percorrer_texto(texto):
    """Da posição 0 ao fim, de sequência em sequência, como o Orca ao ler um objeto."""
    total = Atspi.Text.get_character_count(texto)
    posicao = 0
    while True:
        fim = Atspi.Text.get_attribute_run(texto, posicao, True)[-1]
        if fim <= posicao or fim >= total:
            return
        posicao = fim


def main():
    Atspi.init()
    pilha = [achar_o_app()]
    objetos = 0
    qual = "?"
    while pilha:
        objeto = pilha.pop()
        try:
            # Qualquer erro aqui conta: com o processo morto, as respostas guardadas pela libatspi
            # ainda vêm, e só o pedido novo falha.
            qual = descrever(objeto)
            for i in reversed(range(objeto.get_child_count())):
                filho = objeto.get_child_at_index(i)
                if filho:
                    pilha.append(filho)
            texto = objeto.get_text_iface()
            if texto is not None:
                objetos += 1
                percorrer_texto(texto)
        except Exception as erro:
            print(f"caiu em {qual} ({objetos} objetos com texto até aqui): {erro}")
            sys.exit(1)
    print(f"ok: {objetos} objetos com texto")


main()
