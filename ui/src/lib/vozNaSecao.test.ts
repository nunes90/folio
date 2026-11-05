// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { blocoInicial, primeiroBlocoDaSecaoSeguinte, primeiroBlocoFalavel, secaoSeguinte } from "./vozNaSecao";
// @ts-expect-error: o foliate-js não tem tipos
import { TTS } from "../vendor/foliate-js/tts.js";
// @ts-expect-error: o foliate-js não tem tipos
import { textWalker } from "../vendor/foliate-js/text-walker.js";
import { blocoParaFala } from "./voz";

const documento = (corpo: string) =>
  new DOMParser().parseFromString(`<html lang="pt"><body>${corpo}</body></html>`, "text/html");

describe("voz na seção seguinte", () => {
  it("secaoSeguinte pula as seções fora da ordem de leitura", () => {
    const secoes = [{}, { linear: "no" }, { linear: "yes" }, {}];
    expect(secaoSeguinte(secoes, 0)).toBe(2);
    expect(secaoSeguinte(secoes, 2)).toBe(3);
    expect(secaoSeguinte(secoes, 3)).toBeNull();
    expect(secaoSeguinte([{}, { linear: "no" }], 0)).toBeNull();
  });

  it("primeiroBlocoFalavel pula os blocos sem texto", () => {
    const bloco = primeiroBlocoFalavel(
      documento('<div><img src="capa.png" alt=""></div><h1>Capítulo II</h1><p>Texto.</p>'),
    );
    expect(blocoParaFala(bloco!.ssml)).not.toBeNull();
    expect(bloco!.ssml).toContain("Capítulo II");
    expect(bloco!.range.toString()).toContain("Capítulo II");
    expect(primeiroBlocoFalavel(documento('<div><img src="x.png" alt=""></div>'))).toBeNull();
  });

  it("carrega a seção seguinte à parte, sem ir até ela", async () => {
    const pedidas: number[] = [];
    const secao = (i: number, corpo: string, linear?: string) => ({
      linear,
      createDocument: async () => {
        pedidas.push(i);
        return documento(corpo);
      },
    });
    const secoes = [
      secao(0, "<p>Um.</p>"),
      secao(1, "<p>Nota.</p>", "no"),
      secao(2, "<p>Dois começa aqui.</p>"),
    ];
    const bloco = await primeiroBlocoDaSecaoSeguinte(secoes, 0);
    expect(bloco!.ssml).toContain("Dois começa aqui.");
    expect(pedidas).toEqual([2]);
    expect(await primeiroBlocoDaSecaoSeguinte(secoes, 2)).toBeNull();
  });

  it("blocoInicial: na página da capa (sem texto), nada aqui em vez de lançar", () => {
    const capa = documento('<div><img src="capa.jpg" alt=""></div>');
    const tts = new TTS(capa, textWalker, () => {}, "sentence");
    const ponto = capa.createRange();
    ponto.selectNodeContents(capa.body);
    expect(() => tts.from(ponto)).toThrow();
    expect(blocoInicial(new TTS(capa, textWalker, () => {}, "sentence"), ponto)).toBeUndefined();
    expect(blocoInicial(new TTS(capa, textWalker, () => {}, "sentence"))).toBeUndefined();
    const texto = documento("<p>Era uma vez.</p>");
    const inicio = texto.createRange();
    inicio.selectNodeContents(texto.body);
    expect(blocoInicial(new TTS(texto, textWalker, () => {}, "sentence"), inicio)).toContain("Era uma vez.");
  });
});
