import { describe, expect, it } from "vitest";
import {
  blocosEmOrdem,
  frasesDaCamada,
  ideiasEmOrdem,
  ordemDeLeitura,
  soOPrincipal,
  quebrasDeBloco,
  textoDoTrecho,
} from "./frasesPdf";

/** Uma caixa de linha de texto: altura 10, na posição dada. */
const caixa = (left: number, top: number, width = 100, height = 10) => ({ left, top, width, height });

describe("ordemDeLeitura", () => {
  it("na ordem do arquivo quando ela já é a de leitura", () => {
    expect(ordemDeLeitura([caixa(0, 0), caixa(0, 12), caixa(0, 24)])).toEqual([0, 1, 2]);
  });

  it("o arquivo escreve o cabeçalho e a figura depois do texto: vêm antes, pela posição", () => {
    const caixas = [
      caixa(0, 200), // texto
      caixa(0, 212),
      caixa(0, 0, 50), // cabeçalho
      caixa(0, 60, 30), // rótulo da figura
    ];
    expect(ordemDeLeitura(caixas)).toEqual([2, 3, 0, 1]);
  });

  it("duas colunas altas: a da esquerda inteira, depois a da direita", () => {
    const esquerda = [0, 12, 24, 60, 72].map((top) => caixa(0, top));
    const direita = [0, 12, 24, 36, 48, 60, 72].map((top) => caixa(130, top));
    // O arquivo escreve as duas colunas misturadas, linha a linha.
    const caixas = [...esquerda, ...direita].sort((a, b) => a.top - b.top || a.left - b.left);
    const ordem = ordemDeLeitura(caixas).map((i) => caixas[i]!.left);
    expect(ordem).toEqual([...esquerda.map(() => 0), ...direita.map(() => 130)]);
  });

  it("um vão pequeno na linha (espaço entre palavras) não vira coluna", () => {
    expect(ordemDeLeitura([caixa(0, 0, 50), caixa(53, 0, 50), caixa(0, 12)])).toEqual([0, 1, 2]);
  });
});

describe("blocosEmOrdem", () => {
  it("parágrafos na ordem de leitura; cada bloco contínuo no arquivo", () => {
    const caixas = [
      caixa(0, 100), // parágrafo 2
      caixa(0, 112),
      caixa(0, 0), // parágrafo 1
      caixa(0, 12),
    ];
    expect(blocosEmOrdem(caixas)).toEqual([[2, 3], [0, 1]]);
  });
});

describe("ideiasEmOrdem", () => {
  it("rótulos curtos seguidos (uma figura) viram uma ideia; texto longo fica só", () => {
    const caixas = [caixa(0, 0, 20), caixa(60, 0, 20), caixa(0, 30, 20), caixa(0, 80), caixa(0, 92)];
    const textos = ["5 Ω", "2 A", "10 V", "a".repeat(60), "a".repeat(60)];
    expect(ideiasEmOrdem(caixas, textos)).toEqual([
      { indices: [0, 1, 2], curta: true, legenda: false },
      { indices: [3, 4], curta: false, legenda: false },
    ]);
  });

  it("um pedaço curto na altura do bloco anterior (um índice) vai com ele", () => {
    const caixas = [caixa(0, 0), caixa(0, 12), caixa(300, 14, 10, 6)];
    const textos = ["a".repeat(60), "a".repeat(60), "n"];
    expect(ideiasEmOrdem(caixas, textos)).toEqual([
      { indices: [0, 1, 2], curta: false, legenda: false },
    ]);
  });

  it("curtos longe um do outro (o número da página e uma equação) ficam separados", () => {
    const caixas = [caixa(0, 0, 20), caixa(0, 300, 20)];
    expect(ideiasEmOrdem(caixas, ["37", "x = 0 (2.13)"]).map((i) => i.indices)).toEqual([[0], [1]]);
  });

  it("a legenda é uma ideia própria, com o resto dela na mesma linha", () => {
    const caixas = [caixa(0, 0, 20), caixa(0, 20, 60), caixa(70, 20, 150), caixa(0, 60)];
    const textos = ["5 Ω", "Figure 2.14", "For Practice Prob. 2.4.", "a".repeat(60)];
    expect(ideiasEmOrdem(caixas, textos)).toEqual([
      { indices: [0], curta: true, legenda: false },
      { indices: [1, 2], curta: false, legenda: true },
      { indices: [3], curta: false, legenda: false },
    ]);
  });

  it("uma frase que começa com “Fig.” não é legenda", () => {
    const textos = ["Fig. 2.18(a) can be combined as in Fig. 2.18(b). The combined current"];
    expect(ideiasEmOrdem([caixa(0, 0, 300)], textos)[0]!.legenda).toBe(false);
  });
});

describe("soOPrincipal", () => {
  const ideia = (indices: number[], curta = false, legenda = false) => ({ indices, curta, legenda });

  it("tira legendas, rótulos de figura, a margem e o número da página; fica a equação", () => {
    const caixas = [
      caixa(300, 0, 20), // 0: número da página, no alto
      caixa(100, 30, 30), // 1: rótulo da figura
      caixa(100, 60, 200), // 2: legenda
      caixa(100, 100, 300), // 3: parágrafo
      caixa(100, 112, 300),
      caixa(200, 130, 80), // 5: equação
      caixa(100, 150, 300), // 6: parágrafo
      caixa(0, 150, 60), // 7: nota na margem
    ];
    const textos = ["37", "5 Ω", "Figure 2.12 For Example 2.4.", "a".repeat(60), "a".repeat(60), "x = 0 (2.13)", "b".repeat(60), "c".repeat(40)];
    const ideias = [
      ideia([0], true),
      ideia([1], true),
      ideia([2], false, true),
      ideia([3, 4]),
      ideia([5], true),
      ideia([6]),
      ideia([7]),
    ];
    expect(soOPrincipal(ideias, caixas, textos).map((i) => i.indices)).toEqual([[3, 4], [5], [6]]);
  });

  it("página sem texto corrido: fica tudo, menos as legendas", () => {
    const caixas = [caixa(0, 0, 50), caixa(0, 40, 200)];
    const ideias = [ideia([0], true), ideia([1], false, true)];
    expect(soOPrincipal(ideias, caixas, ["Capítulo 3", "Fig. 1 Um esquema"]).map((i) => i.indices)).toEqual([[0]]);
  });
});

describe("quebrasDeBloco", () => {
  it("espaço maior que meia linha começa um bloco", () => {
    const linhas = [
      { top: 100, height: 12 },
      { top: 115, height: 12 }, // espaço de 3: mesmo parágrafo
      { top: 140, height: 12 }, // espaço de 13: parágrafo novo
      { top: 155, height: 12 },
    ];
    expect(quebrasDeBloco(linhas)).toEqual([0, 2]);
  });

  it("mudança de tamanho da letra (título ↔ texto) começa um bloco", () => {
    const linhas = [
      { top: 100, height: 24 }, // título
      { top: 126, height: 12 }, // texto logo abaixo
      { top: 140, height: 12 },
    ];
    expect(quebrasDeBloco(linhas)).toEqual([0, 1]);
  });

  it("sem linhas, sem blocos", () => {
    expect(quebrasDeBloco([])).toEqual([]);
  });
});

describe("frasesDaCamada", () => {
  it("divide em frases o texto dos pedaços (sem caixas, como no jsdom: um bloco só)", () => {
    const camada = document.createElement("div");
    camada.innerHTML =
      "<span>Uma noite destas, vindo da cidade. </span><span>Encontrei no trem</span><br><span>um rapaz.</span>";
    document.body.append(camada);
    const frases = frasesDaCamada(camada, "pt").map((r) => r.toString());
    expect(frases).toEqual(["Uma noite destas, vindo da cidade.", "Encontrei no tremum rapaz."]);
    camada.remove();
  });
});

describe("textoDoTrecho", () => {
  it("o fim de linha (<br> do pdf.js) vira espaço, sem espaços repetidos", () => {
    const camada = document.createElement("div");
    camada.innerHTML = "<span>Encontrei no trem</span><br><span>um rapaz. </span><br><span>Fim</span>";
    const r = document.createRange();
    r.selectNodeContents(camada);
    expect(textoDoTrecho(r)).toBe("Encontrei no trem um rapaz. Fim");
  });
});
