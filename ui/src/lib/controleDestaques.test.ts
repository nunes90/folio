import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Destaque } from "./biblioteca";

const api = vi.hoisted(() => ({
  listarDestaques: vi.fn(),
  criarDestaque: vi.fn(),
  definirCorDestaque: vi.fn(),
  definirMotivoDestaque: vi.fn(),
  definirNotaDestaque: vi.fn(),
  apagarDestaque: vi.fn(),
  restaurarDestaque: vi.fn(),
  escolherDestinoMarkdown: vi.fn(),
  exportarDestaques: vi.fn(),
}));
vi.mock("./biblioteca", () => api);
const avisos = vi.hoisted(() => ({ avisar: vi.fn() }));
vi.mock("./avisos.svelte", () => avisos);

import { ControleDestaques, type AdaptadorDestaques, type Selecao } from "./controleDestaques.svelte";

function destaque(parcial: Partial<Destaque> = {}): Destaque {
  return {
    id: 1,
    livroId: "livro",
    local: "l1",
    trecho: "escondi-me atrás da porta",
    cor: "amarelo",
    motivo: null,
    nota: null,
    capitulo: null,
    posicao: 0.5,
    criadoEm: 10,
    atualizadoEm: 10,
    ...parcial,
  };
}

const selecao: Selecao = { local: "l9", trecho: "um trecho", capitulo: "III", posicao: 0.2 };
const pos = { x: 10, y: 20, abaixo: false };

function novo() {
  const a: AdaptadorDestaques = {
    livroId: "livro",
    titulo: () => "Dom Casmurro",
    desenhar: vi.fn(),
    apagarDesenho: vi.fn(),
    irPara: vi.fn(async () => {}),
    focarTexto: vi.fn(),
    limparSelecao: vi.fn(),
    anunciar: vi.fn(),
    mostrarLista: vi.fn(async () => {}),
  };
  return { a, c: new ControleDestaques(a) };
}

beforeEach(() => vi.clearAllMocks());

describe("ControleDestaques", () => {
  it("carrega a lista do livro", async () => {
    const { c } = novo();
    api.listarDestaques.mockResolvedValue([destaque()]);
    await c.carregar();
    expect(api.listarDestaques).toHaveBeenCalledWith("livro");
    expect(c.lista).toHaveLength(1);
  });

  it("cor numa seleção cria o destaque, desenha, limpa a seleção e anuncia", async () => {
    const { a, c } = novo();
    const criado = destaque({ id: 9, local: "l9", posicao: 0.2, cor: "verde" });
    api.criarDestaque.mockResolvedValue(criado);
    c.lista = [destaque()];
    c.mostrarSelecao(selecao, pos, false);
    expect(c.barra).toMatchObject({ x: 10, destaque: null });
    await c.escolherCor("verde");
    expect(api.criarDestaque).toHaveBeenCalledWith("livro", { ...selecao, cor: "verde", motivo: null });
    expect(c.barra).toBeNull();
    // Na ordem de leitura: 0.2 antes de 0.5.
    expect(c.lista.map((d) => d.id)).toEqual([9, 1]);
    expect(a.desenhar).toHaveBeenCalledWith(criado);
    expect(a.limparSelecao).toHaveBeenCalled();
    expect(a.anunciar).toHaveBeenCalledWith("Destaque verde criado.");
  });

  it("cor num destaque existente muda a cor e redesenha", async () => {
    const { a, c } = novo();
    const d = destaque();
    c.lista = [d];
    api.definirCorDestaque.mockResolvedValue({ ...d, cor: "rosa" });
    c.mostrarDestaque(d, pos);
    await c.escolherCor("rosa");
    expect(api.definirCorDestaque).toHaveBeenCalledWith(1, "rosa");
    expect(c.lista[0]!.cor).toBe("rosa");
    expect(a.desenhar).toHaveBeenCalledWith(expect.objectContaining({ cor: "rosa" }));
  });

  it("Nota numa seleção cria em amarelo e abre a nota; salvar grava e devolve o foco", async () => {
    const { a, c } = novo();
    const criado = destaque({ id: 9 });
    api.criarDestaque.mockResolvedValue(criado);
    api.definirNotaDestaque.mockResolvedValue({ ...criado, nota: "pensar" });
    c.mostrarSelecao(selecao, pos, true);
    await c.pedirNota();
    expect(api.criarDestaque).toHaveBeenCalledWith("livro", { ...selecao, cor: "amarelo", motivo: null });
    expect(c.notaDe).toEqual(criado);
    await c.salvarNota("pensar");
    expect(c.notaDe).toBeNull();
    expect(c.lista[0]!.nota).toBe("pensar");
    expect(a.anunciar).toHaveBeenLastCalledWith("Nota salva.");
    expect(a.focarTexto).toHaveBeenCalled();
  });

  it("apagar tira da lista e do desenho e avisa com Desfazer, que restaura", async () => {
    const { a, c } = novo();
    const d = destaque();
    c.lista = [d];
    api.apagarDestaque.mockResolvedValue(d);
    api.restaurarDestaque.mockResolvedValue(d);
    await c.apagar(d);
    expect(c.lista).toEqual([]);
    expect(a.apagarDesenho).toHaveBeenCalledWith(d);
    const [texto, tipo, acao] = avisos.avisar.mock.calls[0]!;
    expect([texto, tipo, acao.rotulo]).toEqual(["Destaque apagado.", "sucesso", "Desfazer"]);
    acao.executar();
    await vi.waitFor(() => expect(c.lista).toEqual([d]));
    expect(a.desenhar).toHaveBeenCalledWith(d);
  });

  it("erro do core vira aviso de erro, sem mexer na lista", async () => {
    const { c } = novo();
    api.criarDestaque.mockRejectedValue("o destaque precisa de um trecho");
    c.mostrarSelecao(selecao, pos, false);
    await c.escolherCor("azul");
    expect(c.lista).toEqual([]);
    expect(avisos.avisar).toHaveBeenCalledWith(
      "Não foi possível criar o destaque: o destaque precisa de um trecho",
      "erro",
    );
  });

  it("exportar sugere o nome do livro; cancelar não exporta", async () => {
    const { c } = novo();
    api.escolherDestinoMarkdown.mockResolvedValue(null);
    await c.exportar();
    expect(api.escolherDestinoMarkdown).toHaveBeenCalledWith("Dom Casmurro — destaques.md");
    expect(api.exportarDestaques).not.toHaveBeenCalled();
    api.escolherDestinoMarkdown.mockResolvedValue("/tmp/x.md");
    api.exportarDestaques.mockResolvedValue(2);
    await c.exportar();
    expect(api.exportarDestaques).toHaveBeenCalledWith("livro", "/tmp/x.md", null);
    expect(avisos.avisar).toHaveBeenCalledWith("2 destaques exportados.");
  });

  it("motivo numa seleção cria o destaque com ele; num destaque, liga e desliga", async () => {
    const { a, c } = novo();
    api.criarDestaque.mockResolvedValue(destaque({ id: 9, motivo: "duvida" }));
    c.mostrarSelecao(selecao, pos, false);
    await c.escolherMotivo("duvida");
    expect(api.criarDestaque).toHaveBeenCalledWith("livro", {
      ...selecao,
      cor: "amarelo",
      motivo: "duvida",
    });
    expect(a.anunciar).toHaveBeenLastCalledWith("Destaque amarelo (dúvida) criado.");
    const d = c.lista[0]!;
    api.definirMotivoDestaque.mockResolvedValue({ ...d, motivo: null });
    c.mostrarDestaque(d, pos);
    await c.escolherMotivo("duvida"); // o mesmo de novo: tira
    expect(api.definirMotivoDestaque).toHaveBeenCalledWith(9, null);
    expect(c.lista[0]!.motivo).toBeNull();
    api.definirMotivoDestaque.mockResolvedValue({ ...d, motivo: "citar" });
    await c.definirMotivo(c.lista[0]!, "citar");
    expect(c.lista[0]!.motivo).toBe("citar");
    expect(a.anunciar).toHaveBeenLastCalledWith("Motivo: citar.");
  });

  it("exportar só um motivo sugere o nome com ele e só oferece motivos que existem", async () => {
    const { c } = novo();
    api.escolherDestinoMarkdown.mockResolvedValue("/tmp/c.md");
    api.exportarDestaques.mockResolvedValue(1);
    await c.exportar("citar");
    expect(api.escolherDestinoMarkdown).toHaveBeenCalledWith("Dom Casmurro — destaques (citar).md");
    expect(api.exportarDestaques).toHaveBeenCalledWith("livro", "/tmp/c.md", "citar");
    c.lista = [destaque({ motivo: "citar" })];
    const titulos = c.comandos(() => {}).map((x) => x.titulo);
    expect(titulos).toContain("Exportar só “para citar”…");
    expect(titulos).not.toContain("Exportar só as dúvidas…");
  });

  it("comandos: destacar, mostrar, exportar (só com destaques) e um por destaque", async () => {
    const { a, c } = novo();
    const destacar = vi.fn();
    expect(c.comandos(destacar).map((x) => x.id)).toEqual(["destacar", "mostrar-destaques"]);
    c.lista = [destaque({ nota: "uma nota" })];
    const lista = c.comandos(destacar);
    expect(lista.map((x) => x.titulo)).toEqual([
      "Destacar a seleção ou a frase atual",
      "Mostrar os destaques",
      "Exportar os destaques…",
      "Ir para destaque: escondi-me atrás da porta",
    ]);
    lista[3]!.executar();
    expect(a.irPara).toHaveBeenCalledWith(c.lista[0]);
    lista[0]!.executar();
    expect(destacar).toHaveBeenCalled();
  });
});
