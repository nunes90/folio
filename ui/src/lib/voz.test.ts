import { describe, expect, it } from "vitest";
import { blocoDasFrases, blocoParaFala, comandosDaVoz } from "./voz";

const NS = 'xmlns="http://www.w3.org/2001/10/synthesis"';

describe("blocoParaFala", () => {
  it("põe cada frase num <s> com a sua marca (o espeak-ng só emite todas as marcas assim)", () => {
    const foliate =
      `<speak ${NS} xml:lang="pt-BR"><mark name="0"/>Primeira &amp; frase. ` +
      `<mark name="1"/>Segunda <emphasis>frase</emphasis>.</speak>`;
    expect(blocoParaFala(foliate)).toEqual({
      ssml:
        '<speak><s><mark name="0"/>Primeira &amp; frase.</s>' +
        '<s><mark name="1"/>Segunda frase.</s></speak>',
      marcas: ["0", "1"],
      idioma: "pt-BR",
    });
  });

  it("texto antes da primeira marca vira uma frase sem marca", () => {
    const r = blocoParaFala(`<speak ${NS}>Antes. <mark name="0"/>Depois.</speak>`);
    expect(r?.ssml).toBe('<speak><s>Antes.</s><s><mark name="0"/>Depois.</s></speak>');
    expect(r?.idioma).toBeNull();
  });

  it("escapa < e > do texto e junta espaços", () => {
    const r = blocoParaFala(`<speak ${NS}><mark name="0"/>a &lt; b
      e   c &gt; d</speak>`);
    expect(r?.ssml).toBe('<speak><s><mark name="0"/>a &lt; b e c &gt; d</s></speak>');
  });

  it("bloco sem texto (ex.: só uma imagem) não tem o que falar", () => {
    expect(blocoParaFala(`<speak ${NS}><mark name="0"/>  <break/> </speak>`)).toBeNull();
  });

  it("XML inválido não tem o que falar", () => {
    expect(blocoParaFala("<speak><mark name='0'>")).toBeNull();
  });
});

describe("blocoDasFrases", () => {
  it("uma marca por frase, com o índice a partir da primeira; escapa o texto", () => {
    const bloco = blocoDasFrases(["Uma frase.", "  ", "A < B &\n C."], 4);
    expect(bloco).toEqual({
      ssml: '<speak><s><mark name="4"/>Uma frase.</s><s><mark name="6"/>A &lt; B &amp; C.</s></speak>',
      marcas: ["4", "6"],
      idioma: null,
    });
  });

  it("sem texto, nada a falar", () => {
    expect(blocoDasFrases([])).toBeNull();
    expect(blocoDasFrases([" ", ""])).toBeNull();
  });
});

describe("comandosDaVoz", () => {
  it("conforme o estado", () => {
    const f = () => {};
    expect(comandosDaVoz("parado", f, f, f).map((c) => c.titulo)).toEqual(["Ler em voz alta"]);
    expect(comandosDaVoz("falando", f, f, f).map((c) => c.titulo)).toEqual([
      "Pausar a leitura em voz alta",
      "Parar a leitura em voz alta",
    ]);
    expect(comandosDaVoz("pausado", f, f, f)[0]!.titulo).toBe("Continuar a leitura em voz alta");
  });
});
