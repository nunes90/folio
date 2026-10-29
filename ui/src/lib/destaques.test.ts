import { describe, expect, it } from "vitest";
import type { Destaque } from "./biblioteca";
import {
  cartoesEmbaixo,
  CORES_DESTAQUE,
  descreverDestaque,
  estiloDoMarcaTexto,
  fracaoNoDocumento,
  misturar,
  paginaEscura,
  posicaoNoLivro,
  resumo,
} from "./destaques";
import { PAGINAS, type PaginaEfetiva } from "./pagina";
import { contraste } from "./temas";

describe("cores do marca-texto", () => {
  // O texto continua legível sobre cada cor, em cada página (WCAG AA, 4,5:1).
  for (const pagina of Object.keys(PAGINAS) as PaginaEfetiva[]) {
    for (const cor of CORES_DESTAQUE) {
      it(`${cor.nome} sobre a página ${pagina}`, () => {
        const { papel, tinta } = PAGINAS[pagina];
        const estilo = estiloDoMarcaTexto(paginaEscura(pagina));
        const fundo = misturar(papel, cor.hex, estilo);
        const texto = misturar(tinta, cor.hex, estilo);
        expect(contraste(texto, fundo)).toBeGreaterThanOrEqual(4.5);
        // E o destaque se vê: o fundo muda de verdade.
        expect(contraste(fundo, papel)).toBeGreaterThan(1.1);
      });
    }
  }

  it("alto contraste (branco sobre preto) também é legível", () => {
    const estilo = estiloDoMarcaTexto(true);
    for (const cor of CORES_DESTAQUE) {
      const fundo = misturar("#000000", cor.hex, estilo);
      const texto = misturar("#ffffff", cor.hex, estilo);
      expect(contraste(texto, fundo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("misturar: multiply escurece, screen clareia, opacidade 0 não muda", () => {
    expect(misturar("#ffffff", "#ff0000", { opacidade: 1, mistura: "multiply" })).toBe("#ff0000");
    expect(misturar("#000000", "#ff0000", { opacidade: 1, mistura: "screen" })).toBe("#ff0000");
    expect(misturar("#808080", "#ff0000", { opacidade: 0, mistura: "multiply" })).toBe("#808080");
  });
});

describe("posicaoNoLivro", () => {
  const fracoes = [0, 0.2, 0.5];
  it("soma o início da seção à parte percorrida dela", () => {
    expect(posicaoNoLivro(fracoes, 0, 0.5)).toBeCloseTo(0.1);
    expect(posicaoNoLivro(fracoes, 1, 0.5)).toBeCloseTo(0.35);
    // A última seção vai até 1.
    expect(posicaoNoLivro(fracoes, 2, 0.5)).toBeCloseTo(0.75);
  });
  it("fica entre 0 e 1, mesmo com dados ruins", () => {
    expect(posicaoNoLivro(fracoes, 1, 7)).toBeCloseTo(0.5);
    expect(posicaoNoLivro(fracoes, 1, Number.NaN)).toBeCloseTo(0.2);
    expect(posicaoNoLivro([], 3, 0.5)).toBeCloseTo(0.5);
  });
});

describe("fracaoNoDocumento", () => {
  it("quanto do texto vem antes do trecho", () => {
    document.body.innerHTML = "<p>abcde</p><p>fghij</p>";
    const range = document.createRange();
    const segundo = document.body.lastChild!.firstChild!;
    range.setStart(segundo, 0);
    range.setEnd(segundo, 3);
    expect(fracaoNoDocumento(range)).toBeCloseTo(0.5);
  });
});

describe("textos", () => {
  it("resumo junta espaços e corta com reticências", () => {
    expect(resumo("  um\n\n dois  ")).toBe("um dois");
    expect(resumo("abcdefghij", 6)).toBe("abcde…");
  });

  it("descreverDestaque diz a cor em palavras, o trecho e a nota", () => {
    const d: Destaque = {
      id: 1,
      livroId: "x",
      local: "l",
      trecho: "escondi-me atrás da porta",
      cor: "verde",
      motivo: null,
      nota: "o narrador escuta",
      capitulo: null,
      posicao: 0,
      criadoEm: 0,
      atualizadoEm: 0,
    };
    expect(descreverDestaque(d)).toBe(
      "Destaque verde: escondi-me atrás da porta. Nota: o narrador escuta",
    );
    expect(descreverDestaque({ ...d, nota: null })).toBe("Destaque verde: escondi-me atrás da porta");
    expect(descreverDestaque({ ...d, nota: null, motivo: "citar" })).toBe(
      "Destaque verde (citar): escondi-me atrás da porta",
    );
  });
});

describe("cartoesEmbaixo", () => {
  // rem de 16 px × escala 1,36 ≈ 21,8 px; meia tela de 2400 px lógicos ≈ 1190 px.
  const rem = 21.8;
  it("a coluna fica quando sobra largura para o livro", () => {
    expect(cartoesEmbaixo(2400, rem, 18)).toBe(false);
  });

  it("descem quando o livro ficaria estreito (meia tela, com o índice aberto ou não)", () => {
    expect(cartoesEmbaixo(1190, rem, 18)).toBe(true);
    expect(cartoesEmbaixo(1190, rem, 0)).toBe(true);
  });

  it("sem escala, meia tela de 1920 px ainda tem coluna sem painéis", () => {
    expect(cartoesEmbaixo(960, 16, 0)).toBe(false);
    expect(cartoesEmbaixo(960, 16, 18)).toBe(true);
  });

  it("com dois lados, a largura do livro é dividida entre eles", () => {
    // Tela cheia: cada lado fica com ~45rem; com o índice aberto, ~36rem.
    expect(cartoesEmbaixo(2400, rem, 0, 2)).toBe(false);
    expect(cartoesEmbaixo(2400, rem, 18, 2)).toBe(true);
    expect(cartoesEmbaixo(1190, rem, 0, 2)).toBe(true);
  });

  it("sem medida (0), não decide nada", () => {
    expect(cartoesEmbaixo(0, 16, 0)).toBe(false);
  });
});
