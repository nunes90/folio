import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

import { PADRAO } from "./preferencias.svelte";
import {
  AvisoDePreparo,
  comandosDaVozNatural,
  descreverVoz,
  megabytes,
  porcentagem,
  vozEscolhida,
  type ModeloDeVoz,
} from "./vozNatural.svelte";

const MODELO: ModeloDeVoz = {
  id: "kokoro",
  nome: "Kokoro",
  licenca: "Apache-2.0",
  tamanho: 152_000_000,
  instalado: true,
  vozes: [
    { id: "af_heart", nome: "Heart", idioma: "en-US", genero: "feminina" },
    { id: "bm_george", nome: "George", idioma: "en-GB", genero: "masculina" },
  ],
};

const acoes = () => ({
  baixar: vi.fn(),
  cancelar: vi.fn(),
  remover: vi.fn(),
  amostra: vi.fn(),
});

describe("vozNatural: partes puras", () => {
  it("descreve a voz, o tamanho e o andamento", () => {
    expect(descreverVoz(MODELO.vozes[1])).toBe("inglês britânico, masculina");
    expect(megabytes(152_415_998)).toBe("152 MB");
    expect(porcentagem({ baixado: 76_000_000, total: 152_000_000 })).toBe(50);
    expect(porcentagem({ baixado: 10, total: 0 })).toBe(0);
    expect(porcentagem({ baixado: 200, total: 100 })).toBe(100);
  });

  it("a voz escolhida, ou a primeira se a escolha não for do modelo", () => {
    expect(vozEscolhida(MODELO, { ...PADRAO, vozNatural: "bm_george" }).nome).toBe("George");
    expect(vozEscolhida(MODELO, { ...PADRAO, vozNatural: "" }).nome).toBe("Heart");
    expect(vozEscolhida(MODELO, { ...PADRAO, vozNatural: "zz" }).nome).toBe("Heart");
  });
});

describe("comandosDaVozNatural", () => {
  const titulos = (c: { titulo: string }[]) => c.map((x) => x.titulo);

  it("sem o modelo baixado: baixar (só com o espeak-ng)", () => {
    const a = acoes();
    const m = { ...MODELO, instalado: false };
    const lista = comandosDaVozNatural({ modelo: m, baixando: null, espeak: true }, PADRAO, vi.fn(), a);
    expect(titulos(lista)).toEqual(["Baixar a voz natural"]);
    expect(lista[0].dica).toBe("Kokoro, 152 MB, inglês");
    lista[0].executar();
    expect(a.baixar).toHaveBeenCalledWith("kokoro");
    expect(
      comandosDaVozNatural({ modelo: m, baixando: null, espeak: false }, PADRAO, vi.fn(), a),
    ).toEqual([]);
  });

  it("baixando: só cancelar, com a porcentagem", () => {
    const a = acoes();
    const lista = comandosDaVozNatural(
      { modelo: MODELO, baixando: { modelo: "kokoro", baixado: 38, total: 152 }, espeak: true },
      PADRAO,
      vi.fn(),
      a,
    );
    expect(titulos(lista)).toEqual(["Cancelar o download da voz natural"]);
    expect(lista[0].dica).toBe("25%");
    lista[0].executar();
    expect(a.cancelar).toHaveBeenCalled();
  });

  it("instalado: as vozes (a atual marcada), amostra, usar em inglês e remover", () => {
    const a = acoes();
    const mudar = vi.fn();
    const p = { ...PADRAO, vozNatural: "bm_george" };
    const lista = comandosDaVozNatural({ modelo: MODELO, baixando: null, espeak: true }, p, mudar, a);
    expect(titulos(lista)).toEqual([
      "Voz: Heart",
      "Voz: George",
      "Ouvir amostra da voz",
      "Não usar a voz natural em livros em inglês",
      "Remover a voz natural",
    ]);
    expect(lista[1].dica).toBe("atual · inglês britânico, masculina");
    expect(lista[0].dica).toBe("inglês americano, feminina");
    lista[0].executar();
    expect(mudar).toHaveBeenCalledWith({ vozNatural: "af_heart" });
    lista[2].executar();
    expect(a.amostra).toHaveBeenCalledWith("bm_george");
    lista[3].executar();
    expect(mudar).toHaveBeenCalledWith({ vozNaturalEmIngles: false });
    lista[4].executar();
    expect(a.remover).toHaveBeenCalledWith("kokoro");
    const desligada = comandosDaVozNatural(
      { modelo: MODELO, baixando: null, espeak: true },
      { ...p, vozNaturalEmIngles: false },
      mudar,
      a,
    );
    expect(titulos(desligada)).toContain("Usar a voz natural em livros em inglês");
  });

  it("sem catálogo: nada", () => {
    expect(
      comandosDaVozNatural({ modelo: undefined, baixando: null, espeak: true }, PADRAO, vi.fn(), acoes()),
    ).toEqual([]);
  });
});

describe("AvisoDePreparo", () => {
  afterEach(() => vi.useRealTimers());

  it("só avisa se demorar, e some no primeiro evento", () => {
    vi.useFakeTimers();
    const avisar = vi.fn(() => 7);
    const dispensar = vi.fn();
    const p = new AvisoDePreparo(avisar, dispensar);
    p.comecar();
    vi.advanceTimersByTime(300);
    p.terminar();
    vi.advanceTimersByTime(1000);
    expect(avisar).not.toHaveBeenCalled();
    expect(dispensar).not.toHaveBeenCalled();

    p.comecar();
    vi.advanceTimersByTime(401);
    expect(avisar).toHaveBeenCalledWith("Preparando a voz…");
    p.terminar();
    expect(dispensar).toHaveBeenCalledWith(7);
    p.terminar();
    expect(dispensar).toHaveBeenCalledTimes(1);
  });
});
