import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trecho, Visita } from "./biblioteca";

const api = vi.hoisted(() => ({ visitarTrecho: vi.fn(), trechosRevisitados: vi.fn() }));
vi.mock("./biblioteca", () => api);
vi.mock("./log", () => ({ log: { warn: vi.fn() } }));

import {
  Revisitas,
  comandosDasRevisitas,
  textoDaVolta,
  trechoDePaginas,
} from "./revisitas.svelte";

const capitulo = (ordem: number): Trecho => ({
  ordem,
  rotulo: `Capítulo ${ordem}`,
  local: `secao:${ordem}`,
});
const visita = (ordem: number, voltas: number, voltou: boolean): Visita => ({
  ...capitulo(ordem),
  voltas,
  voltou,
});

describe("Revisitas", () => {
  const avisar = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    api.trechosRevisitados.mockResolvedValue([]);
  });

  it("só a entrada no trecho vai para o core", async () => {
    api.visitarTrecho.mockResolvedValue(visita(1, 0, false));
    const r = new Revisitas(() => "livro", avisar);
    await r.entrar(capitulo(1));
    await r.entrar(capitulo(1));
    await r.entrar(capitulo(2));
    expect(api.visitarTrecho.mock.calls.map((c) => c[1].ordem)).toEqual([1, 2]);
  });

  it("avisa a partir da 3ª volta e atualiza a lista a cada volta", async () => {
    const r = new Revisitas(() => "livro", avisar);
    api.visitarTrecho.mockResolvedValueOnce(visita(1, 2, true));
    await r.entrar(capitulo(1));
    expect(avisar).not.toHaveBeenCalled();
    expect(api.trechosRevisitados).toHaveBeenCalledWith("livro", 2);
    api.visitarTrecho.mockResolvedValueOnce(visita(2, 0, false));
    await r.entrar(capitulo(2));
    api.visitarTrecho.mockResolvedValueOnce(visita(1, 3, true));
    api.trechosRevisitados.mockResolvedValue([visita(1, 3, false)]);
    await r.entrar(capitulo(1));
    expect(avisar).toHaveBeenCalledWith("Você voltou a “Capítulo 1” 3 vezes.");
    expect(r.lista).toHaveLength(1);
  });

  it("falha no core não quebra a leitura", async () => {
    api.visitarTrecho.mockRejectedValue("banco travado");
    const r = new Revisitas(() => "livro", avisar);
    await expect(r.entrar(capitulo(1))).resolves.toBeUndefined();
  });
});

describe("textos e paleta", () => {
  it("texto da volta e trechos de páginas", () => {
    expect(textoDaVolta(visita(3, 4, true))).toBe("Você voltou a “Capítulo 3” 4 vezes.");
    expect(trechoDePaginas(41, 300)).toEqual({ ordem: 4, rotulo: "páginas 41–50", local: "pagina:41" });
    expect(trechoDePaginas(50, 300).ordem).toBe(4);
    expect(trechoDePaginas(101, 103).rotulo).toBe("páginas 101–103");
    expect(trechoDePaginas(101, 101).rotulo).toBe("página 101");
  });

  it("comandos levam ao trecho", () => {
    const ir = vi.fn();
    const [c] = comandosDasRevisitas([visita(3, 4, false)], ir);
    expect(c!.titulo).toBe("Ir para trecho revisitado: Capítulo 3");
    expect(c!.dica).toBe("4 voltas");
    c!.executar();
    expect(ir).toHaveBeenCalledWith("secao:3");
  });
});
