import { describe, expect, it } from "vitest";
import { idiomaDoTexto } from "./idioma";

const INGLES =
  "In this chapter, you will learn how to write your first C program. We start with the basic structure " +
  "of a program and the tools that you need to compile it. It is easier than it looks, and the compiler " +
  "is there to help you with the errors that you make along the way.";
const PORTUGUES =
  "Neste capítulo, você vai aprender a escrever o seu primeiro programa. Começamos com a estrutura de um " +
  "programa e as ferramentas que são necessárias para compilá-lo. Não é tão difícil quanto parece, e o " +
  "compilador também ajuda com os erros que aparecem no caminho.";
const ESPANHOL =
  "En este capítulo, vas a aprender a escribir tu primer programa. Empezamos con la estructura de un " +
  "programa y las herramientas que son necesarias para compilarlo. No es tan difícil como parece, y el " +
  "compilador también ayuda con los errores que aparecen por el camino.";

describe("idiomaDoTexto", () => {
  it("reconhece inglês, português e espanhol", () => {
    expect(idiomaDoTexto(INGLES)).toBe("en");
    expect(idiomaDoTexto(PORTUGUES)).toBe("pt");
    expect(idiomaDoTexto(ESPANHOL)).toBe("es");
  });

  it("francês e alemão", () => {
    expect(
      idiomaDoTexto(
        "Dans ce chapitre, nous allons voir comment écrire le premier programme. Il est plus simple qu'il " +
          "ne paraît, et le compilateur est là pour aider avec les erreurs qui sont dans le code, mais pas toujours.",
      ),
    ).toBe("fr");
    expect(
      idiomaDoTexto(
        "In diesem Kapitel lernen wir, wie man das erste Programm schreibt. Es ist nicht so schwer, wie es " +
          "aussieht, und der Compiler hilft auch mit den Fehlern, die sich in dem Code finden, und wir lernen viel.",
      ),
    ).toBe("de");
  });

  it("pouco texto ou código: não diz", () => {
    expect(idiomaDoTexto("Chapter 1: Getting Started")).toBeNull();
    expect(idiomaDoTexto("")).toBeNull();
    const codigo = "int main void printf return include stdio h argc argv char ".repeat(4);
    expect(idiomaDoTexto(codigo)).toBeNull();
  });

  it("inglês técnico com código no meio continua inglês", () => {
    const texto =
      INGLES + " int main(void) { printf(\"hello\"); return 0; } " + INGLES.split(". ")[1];
    expect(idiomaDoTexto(texto)).toBe("en");
  });
});
