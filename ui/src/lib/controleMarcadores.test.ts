import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Marcador, NovoMarcador } from "./biblioteca";

const api = vi.hoisted(() => ({
  listarMarcadores: vi.fn(),
  marcarPagina: vi.fn(),
  apagarMarcador: vi.fn(),
  restaurarMarcador: vi.fn(),
}));
vi.mock("./biblioteca", () => api);
const avisos = vi.hoisted(() => ({ avisar: vi.fn() }));
vi.mock("./avisos.svelte", () => avisos);

import { ControleMarcadores, rotuloDoMarcador, type AdaptadorMarcadores } from "./controleMarcadores.svelte";

function marcador(parcial: Partial<Marcador> = {}): Marcador {
  return { id: 1, livroId: "livro", local: "pagina:3", capitulo: "III", posicao: 0.3, criadoEm: 10, ...parcial };
}

function montar(aqui: NovoMarcador | null = { local: "pagina:3", capitulo: "III", posicao: 0.3 }) {
  const a: AdaptadorMarcadores & { pagina: string } = {
    livroId: "livro",
    pagina: "pagina:3",
    aqui: vi.fn(() => aqui),
    naPagina(m) {
      return m.local === a.pagina;
    },
    irPara: vi.fn(async () => {}),
    anunciar: vi.fn(),
  };
  return { a, c: new ControleMarcadores(a) };
}

describe("ControleMarcadores", () => {
  beforeEach(() => {
    for (const f of Object.values(api)) f.mockReset();
    avisos.avisar.mockReset();
  });

  it("carrega a lista e sabe se a página que se vê está marcada", async () => {
    api.listarMarcadores.mockResolvedValue([marcador({ id: 2, local: "pagina:9", posicao: 0.9 }), marcador()]);
    const { a, c } = montar();
    await c.carregar();
    expect(c.lista.map((m) => m.id)).toEqual([1, 2]);
    expect(c.daPagina?.id).toBe(1);
    a.pagina = "pagina:5";
    c.conferir();
    expect(c.daPagina).toBeNull();
  });

  it("alternar numa página sem marcador marca e anuncia", async () => {
    api.listarMarcadores.mockResolvedValue([]);
    api.marcarPagina.mockResolvedValue(marcador());
    const { a, c } = montar();
    await c.carregar();
    await c.alternar();
    expect(api.marcarPagina).toHaveBeenCalledWith("livro", { local: "pagina:3", capitulo: "III", posicao: 0.3 });
    expect(c.lista).toHaveLength(1);
    expect(c.daPagina?.id).toBe(1);
    expect(a.anunciar).toHaveBeenCalledWith("Página marcada.");
  });

  it("alternar numa página marcada tira o marcador, com Desfazer", async () => {
    api.listarMarcadores.mockResolvedValue([marcador()]);
    api.apagarMarcador.mockResolvedValue(marcador());
    api.restaurarMarcador.mockResolvedValue(marcador());
    const { c } = montar();
    await c.carregar();
    await c.alternar();
    expect(api.apagarMarcador).toHaveBeenCalledWith(1);
    expect(c.lista).toEqual([]);
    expect(c.daPagina).toBeNull();
    const [texto, , acao] = avisos.avisar.mock.calls[0]!;
    expect(texto).toBe("Marcador tirado.");
    expect(acao.rotulo).toBe("Desfazer");
    acao.executar();
    await vi.waitFor(() => expect(c.lista).toHaveLength(1));
    expect(c.daPagina?.id).toBe(1);
  });

  it("sem lugar (o livro ainda abrindo), não marca", async () => {
    api.listarMarcadores.mockResolvedValue([]);
    const { c } = montar(null);
    await c.carregar();
    await c.alternar();
    expect(api.marcarPagina).not.toHaveBeenCalled();
  });

  it("um erro do core vira aviso", async () => {
    api.listarMarcadores.mockResolvedValue([]);
    api.marcarPagina.mockRejectedValue("erro no banco da biblioteca");
    const { c } = montar();
    await c.carregar();
    await c.alternar();
    expect(avisos.avisar).toHaveBeenCalledWith("Não foi possível marcar a página: erro no banco da biblioteca", "erro");
    expect(c.lista).toEqual([]);
  });

  it("os comandos da paleta: marcar ou tirar, conforme a página, e ir a cada marcador", async () => {
    api.listarMarcadores.mockResolvedValue([marcador({ id: 2, local: "pagina:9", capitulo: null, posicao: 0.9 })]);
    const { a, c } = montar();
    await c.carregar();
    const titulos = () => c.comandos("pdf").map((x) => x.titulo);
    expect(titulos()).toEqual(["Marcar esta página", "Ir ao marcador: página 9 (90%)"]);
    a.pagina = "pagina:9";
    c.conferir();
    expect(titulos()[0]).toBe("Tirar o marcador desta página");
    c.comandos("pdf")[1]!.executar();
    expect(a.irPara).toHaveBeenCalled();
  });
});

describe("rotuloDoMarcador", () => {
  it("EPUB: o capítulo e a porcentagem", () => {
    expect(rotuloDoMarcador(marcador({ local: "epubcfi(/6/4!/4/2/1:0)" }), "epub")).toBe("III (30%)");
    expect(rotuloDoMarcador(marcador({ local: "epubcfi(/6/4!/4/2/1:0)", capitulo: null }), "epub")).toBe("30% do livro");
  });

  it("PDF: a página e, se houver, o capítulo", () => {
    expect(rotuloDoMarcador(marcador(), "pdf")).toBe("página 3, III (30%)");
    expect(rotuloDoMarcador(marcador({ capitulo: null }), "pdf")).toBe("página 3 (30%)");
  });
});
