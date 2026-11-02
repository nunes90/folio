#!/usr/bin/env python3
"""Pede a um leitor de tela o que o Orca pede: os atributos de texto de todo objeto do Folio.

O WebKitGTK aborta o processo da página nesse pedido em certos elementos (ver e2e/atspi/rodar.sh).
Saída 0: passou por tudo. Saída 1: o processo caiu; a última linha diz em qual objeto.
"""
import os
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

CONTROLE = open(os.environ["PERCORRER_CONTROLE"], "a") if "PERCORRER_CONTROLE" in os.environ else None


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


def percorrer_texto(texto, inteiro):
    """Da posição 0 ao fim. Onde o Orca lê com as setas (`inteiro`), pede em cada posição, como ele.
    Parágrafo sem objetos dentro não aborta no meio: pedir em cada letra de um livro inteiro levaria minutos."""
    total = Atspi.Text.get_character_count(texto)
    inteiro = inteiro and "\ufffc" in Atspi.Text.get_text(texto, 0, total)
    posicao = 0
    while posicao < total:
        fim = Atspi.Text.get_attribute_run(texto, posicao, True)[-1]
        if inteiro:
            posicao += 1
        elif fim <= posicao:
            return
        else:
            posicao = fim


def onde_o_orca_navega(objeto, documentos):
    """A interface é role="application" (o Orca fica no modo foco); lê com as setas só nos documentos
    dentro dela (texto do livro) e nos diálogos."""
    papel = objeto.get_role_name()
    return papel == "dialog" or (papel in ("document web", "document frame") and documentos > 0)


def main():
    Atspi.init()
    pilha = [(achar_o_app(), False, 0)]
    objetos = 0
    aplicacao = False
    qual = "?"
    while pilha:
        objeto, inteiro, documentos = pilha.pop()
        try:
            # Qualquer erro aqui conta: com o processo morto, as respostas guardadas pela libatspi
            # ainda vêm, e só o pedido novo falha.
            qual = descrever(objeto)
            # Com um <dialog> modal aberto, a árvore só mostra o diálogo.
            aplicacao = aplicacao or objeto.get_role_name() in ("embedded", "dialog")
            inteiro = inteiro or onde_o_orca_navega(objeto, documentos)
            if objeto.get_role_name() == "document web":
                documentos += 1
            for i in reversed(range(objeto.get_child_count())):
                filho = objeto.get_child_at_index(i)
                if filho:
                    pilha.append((filho, inteiro, documentos))
            texto = objeto.get_text_iface()
            if texto is not None:
                objetos += 1
                percorrer_texto(texto, inteiro)
                if inteiro and CONTROLE:
                    print(objeto.get_role_name(), file=CONTROLE)
        except Exception as erro:
            print(f"caiu em {qual} ({objetos} objetos com texto até aqui): {erro}")
            sys.exit(1)
    if not aplicacao:
        print('a interface não é role="application": o Orca ficaria com as setas e percorreria os cards')
        sys.exit(1)
    print(f"ok: {objetos} objetos com texto")


main()
