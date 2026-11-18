import { beforeEach, describe, expect, it, vi } from "vitest";

const avisos = vi.hoisted(() => ({ avisar: vi.fn() }));
vi.mock("./avisos.svelte", () => avisos);

import { horaDeConsultar, procurarVersaoNova, UM_DIA_MS, type Dependencias } from "./versaoNova";

const nova = { versao: "1.4.0", endereco: "https://github.com/nunes90/folio/releases/tag/v1.4.0" };

function deps(parcial: Partial<Dependencias> = {}): Dependencias {
  const guardado = new Map<string, string>();
  return {
    ligado: () => true,
    consultar: vi.fn(async () => nova),
    abrir: vi.fn(async () => {}),
    agora: () => 10 * UM_DIA_MS,
    ler: (chave) => guardado.get(chave) ?? null,
    gravar: (chave, valor) => void guardado.set(chave, valor),
    ...parcial,
  };
}

describe("aviso de versão nova (M43b)", () => {
  beforeEach(() => avisos.avisar.mockReset());

  it("só consulta sozinho com o aviso ligado e um dia depois da última consulta", () => {
    expect(horaDeConsultar(null, null, UM_DIA_MS)).toBe(false);
    expect(horaDeConsultar(false, null, UM_DIA_MS)).toBe(false);
    expect(horaDeConsultar(true, null, UM_DIA_MS)).toBe(true);
    expect(horaDeConsultar(true, 5 * UM_DIA_MS, 5 * UM_DIA_MS + UM_DIA_MS - 1)).toBe(false);
    expect(horaDeConsultar(true, 5 * UM_DIA_MS, 6 * UM_DIA_MS)).toBe(true);
    // O relógio voltou: consulta (senão ficaria sem consultar até alcançar a data gravada).
    expect(horaDeConsultar(true, 9 * UM_DIA_MS, 5 * UM_DIA_MS)).toBe(true);
  });

  it("havendo versão nova, avisa com o botão das novidades; uma vez por dia", async () => {
    const d = deps();
    await procurarVersaoNova(false, d);
    const [texto, tipo, acao] = avisos.avisar.mock.calls[0]!;
    expect(texto).toBe("Saiu o Folio 1.4.0.");
    expect(tipo).toBe("sucesso");
    acao.executar();
    expect(d.abrir).toHaveBeenCalledWith(nova.endereco);
    await procurarVersaoNova(false, d);
    expect(d.consultar).toHaveBeenCalledTimes(1);
  });

  it("depois de ver as novidades, a mesma versão não é avisada de novo", async () => {
    let agora = 10 * UM_DIA_MS;
    const d = deps({ agora: () => agora });
    await procurarVersaoNova(false, d);
    avisos.avisar.mock.calls[0]![2].executar();
    agora += 2 * UM_DIA_MS;
    await procurarVersaoNova(false, d);
    expect(d.consultar).toHaveBeenCalledTimes(2);
    expect(avisos.avisar).toHaveBeenCalledTimes(1);
  });

  it("desligado, não consulta sozinho; pedido na paleta, consulta e diz o resultado", async () => {
    const d = deps({ ligado: () => false, consultar: vi.fn(async () => null) });
    await procurarVersaoNova(false, d);
    expect(d.consultar).not.toHaveBeenCalled();
    await procurarVersaoNova(true, d);
    expect(avisos.avisar).toHaveBeenCalledWith("Você está com a versão mais nova do Folio.");
  });

  it("um erro só aparece quando foi pedido; sozinho, vai para o log", async () => {
    const d = deps({ consultar: vi.fn(async () => Promise.reject("sem conexão")) });
    await procurarVersaoNova(false, d);
    expect(avisos.avisar).not.toHaveBeenCalled();
    await procurarVersaoNova(true, d);
    expect(avisos.avisar).toHaveBeenCalledWith("Não foi possível procurar uma versão nova: sem conexão", "erro");
  });
});
