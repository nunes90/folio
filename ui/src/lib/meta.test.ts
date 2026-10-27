import { beforeEach, describe, expect, it } from "vitest";
import {
  MetaDaSessao,
  PAUSA_MAXIMA_MS,
  comandosDaMeta,
  duracaoPorExtenso,
  metaPorTermo,
  nomeDaMeta,
  textoDoResumo,
  type Ponto,
} from "./meta.svelte";

let agora = 0;
const relogio = () => agora;

/** Avança o relógio de segundo em segundo, como o intervalo do leitor. */
function passar(meta: MetaDaSessao, segundos: number, visivel = true) {
  for (let i = 0; i < segundos; i++) {
    agora += 1000;
    meta.tique(visivel);
  }
}

const pagina = (n: number): Ponto => ({ rotulo: `página ${n}`, pagina: n });
const capitulo = (indice: number, fracao: number): Ponto => ({
  rotulo: `Capítulo ${indice} (${Math.round(fracao * 100)}%)`,
  capitulo: { indice, fracao },
});

beforeEach(() => {
  agora = 1_000_000;
});

describe("meta em minutos", () => {
  it("conta o tempo de leitura e cumpre no fim, com o resumo", () => {
    const m = new MetaDaSessao(relogio);
    m.mover(pagina(10));
    m.definir({ tipo: "minutos", minutos: 2 });
    passar(m, 60);
    expect(m.texto).toBe("1 de 2 min");
    expect(m.progresso).toBeCloseTo(0.5);
    m.mover(pagina(12));
    passar(m, 60);
    expect(m.resumo).toEqual({
      meta: { tipo: "minutos", minutos: 2 },
      segundos: 120,
      paginas: 2,
      de: "página 10",
      ate: "página 12",
    });
    expect(m.progresso).toBe(1);
  });

  it("parado por mais de 5 minutos, o tempo para de contar; a atividade o retoma", () => {
    const m = new MetaDaSessao(relogio);
    m.mover(pagina(1));
    m.definir({ tipo: "minutos", minutos: 30 });
    passar(m, PAUSA_MAXIMA_MS / 1000 + 600); // 15 min sem tocar em nada
    expect(m.texto).toBe("5 de 30 min");
    m.atividade();
    passar(m, 60);
    expect(m.texto).toBe("6 de 30 min");
  });

  it("com a janela escondida, não conta", () => {
    const m = new MetaDaSessao(relogio);
    m.definir({ tipo: "minutos", minutos: 10 });
    passar(m, 120, false);
    expect(m.texto).toBe("0 de 10 min");
  });

  it("depois de cumprida, para; continuar tira a meta e repetir recomeça daqui", () => {
    const m = new MetaDaSessao(relogio);
    m.mover(pagina(1));
    m.definir({ tipo: "minutos", minutos: 1 });
    passar(m, 90);
    expect(m.resumo?.segundos).toBe(60);
    m.repetir();
    expect(m.resumo).toBeNull();
    expect(m.meta).toEqual({ tipo: "minutos", minutos: 1 });
    expect(m.texto).toBe("0 de 1 min");
    m.continuar();
    expect(m.meta).toBeNull();
  });
});

describe("meta em páginas (PDF)", () => {
  it("conta as páginas avançadas a partir de onde a meta começou; voltar não desconta", () => {
    const m = new MetaDaSessao(relogio);
    m.mover(pagina(128));
    m.definir({ tipo: "paginas", paginas: 3 });
    m.mover(pagina(130));
    expect(m.texto).toBe("2 de 3 páginas");
    m.mover(pagina(129));
    expect(m.texto).toBe("2 de 3 páginas");
    m.mover(pagina(131));
    expect(m.resumo).toMatchObject({ paginas: 3, de: "página 128", ate: "página 131" });
  });
});

describe("meta até o fim do capítulo (EPUB)", () => {
  it("progresso dentro do capítulo, a partir de onde começou; cumpre ao chegar no seguinte", () => {
    const m = new MetaDaSessao(relogio);
    m.mover(capitulo(3, 0.5));
    m.definir({ tipo: "capitulo" });
    m.mover(capitulo(3, 0.75));
    expect(m.texto).toBe("50% do capítulo");
    expect(m.resumo).toBeNull();
    m.mover(capitulo(4, 0));
    expect(m.resumo).toMatchObject({ de: "Capítulo 3 (50%)", ate: "Capítulo 4 (0%)" });
  });

  it("voltar a um capítulo anterior não cumpre", () => {
    const m = new MetaDaSessao(relogio);
    m.mover(capitulo(3, 0.1));
    m.definir({ tipo: "capitulo" });
    m.mover(capitulo(2, 0.9));
    expect(m.resumo).toBeNull();
    expect(m.progresso).toBe(0);
  });
});

describe("textos", () => {
  it("nome da meta e duração", () => {
    expect(nomeDaMeta({ tipo: "minutos", minutos: 20 })).toBe("20 min");
    expect(nomeDaMeta({ tipo: "paginas", paginas: 1 })).toBe("1 página");
    expect(nomeDaMeta({ tipo: "capitulo" })).toBe("até o fim do capítulo");
    expect(duracaoPorExtenso(10)).toBe("1 minuto");
    expect(duracaoPorExtenso(20 * 60 + 10)).toBe("20 minutos");
  });

  it("resumo de cada meta", () => {
    const base = { segundos: 1080, paginas: 15, de: "página 128", ate: "página 143" };
    expect(textoDoResumo({ ...base, meta: { tipo: "minutos", minutos: 18 } })).toBe(
      "Você leu 18 minutos: de página 128 até página 143.",
    );
    expect(textoDoResumo({ ...base, meta: { tipo: "paginas", paginas: 15 } })).toBe(
      "Você leu 15 páginas em 18 minutos: de página 128 até página 143.",
    );
    expect(
      textoDoResumo({ ...base, de: "Capítulo 3", ate: "Capítulo 3", meta: { tipo: "capitulo" } }),
    ).toBe("Você leu o capítulo até o fim, em 18 minutos, em Capítulo 3.");
  });
});

describe("paleta", () => {
  it("metas do formato; com meta, “Tirar” primeiro e a atual marcada", () => {
    const m = new MetaDaSessao(relogio);
    const epub = comandosDaMeta(m, "epub").map((c) => c.titulo);
    expect(epub).toContain("Meta da sessão: até o fim do capítulo");
    expect(epub.some((t) => t.includes("páginas"))).toBe(false);
    const pdf = comandosDaMeta(m, "pdf").map((c) => c.titulo);
    expect(pdf).toContain("Meta da sessão: 10 páginas");
    expect(pdf.some((t) => t.includes("capítulo"))).toBe(false);

    comandosDaMeta(m, "pdf").find((c) => c.titulo === "Meta da sessão: 20 min")!.executar();
    const lista = comandosDaMeta(m, "pdf");
    expect(lista[0]!.titulo).toBe("Tirar a meta da sessão");
    expect(lista.find((c) => c.titulo === "Meta da sessão: 20 min")?.dica).toBe("atual");
  });

  it("meta digitada: minutos nos dois formatos, páginas só no PDF", () => {
    const m = new MetaDaSessao(relogio);
    expect(metaPorTermo("25 min", m, "epub")[0]?.titulo).toBe("Meta da sessão: 25 min");
    expect(metaPorTermo("25min", m, "pdf")[0]?.titulo).toBe("Meta da sessão: 25 min");
    expect(metaPorTermo("12 páginas", m, "pdf")[0]?.titulo).toBe("Meta da sessão: 12 páginas");
    expect(metaPorTermo("12 páginas", m, "epub")).toEqual([]);
    expect(metaPorTermo("42", m, "pdf")).toEqual([]);
    expect(metaPorTermo("0 min", m, "pdf")).toEqual([]);
    metaPorTermo("12 pág", m, "pdf")[0]!.executar();
    expect(m.meta).toEqual({ tipo: "paginas", paginas: 12 });
  });
});
