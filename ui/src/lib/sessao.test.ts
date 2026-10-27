import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Progresso, Sessao } from "./biblioteca";

const api = vi.hoisted(() => ({
  iniciarSessao: vi.fn(),
  registrarSessao: vi.fn(),
  encerrarSessao: vi.fn(),
}));
vi.mock("./biblioteca", () => api);
vi.mock("./log", () => ({ log: { warn: vi.fn() } }));

import { INTERVALO_ATIVIDADE_MS, SessaoDeLeitura } from "./sessao.svelte";

const em = (localizacao: string, fracao = 0): Progresso => ({ localizacao, fracao });
const sessao = (parcial: Partial<Sessao> = {}): Sessao => ({
  id: 7,
  livroId: "livro",
  inicio: 0,
  fim: 0,
  ativo: 0,
  avanco: 0,
  de: em("a"),
  ate: em("a"),
  ...parcial,
});

describe("SessaoDeLeitura", () => {
  let agora = 0;
  const relogio = () => agora;

  beforeEach(() => {
    agora = 1_000_000;
    vi.resetAllMocks();
    api.iniciarSessao.mockResolvedValue(sessao());
    api.registrarSessao.mockImplementation(async (id: number, onde?: Progresso) =>
      sessao({ id, ate: onde ?? em("a") }),
    );
    api.encerrarSessao.mockImplementation(async (id: number) => sessao({ id, ativo: 90 }));
  });

  it("começa no primeiro lugar que o leitor publica; os seguintes mudam o ponto, na ordem", async () => {
    const s = new SessaoDeLeitura("livro", relogio);
    s.mover(em("a", 0.1));
    s.mover(em("b", 0.2));
    await s.encerrar();
    expect(api.iniciarSessao).toHaveBeenCalledWith("livro", em("a", 0.1));
    expect(api.registrarSessao).toHaveBeenCalledWith(7, em("b", 0.2));
    expect(api.encerrarSessao).toHaveBeenCalledWith(7);
    // O início vem antes do aviso, mesmo com as chamadas feitas de uma vez.
    expect(api.iniciarSessao.mock.invocationCallOrder[0]).toBeLessThan(
      api.registrarSessao.mock.invocationCallOrder[0]!,
    );
  });

  it("atividade avisa no máximo uma vez por minuto, e só depois de começar", async () => {
    const s = new SessaoDeLeitura("livro", relogio);
    s.atividade();
    s.mover(em("a"));
    s.atividade();
    agora += INTERVALO_ATIVIDADE_MS;
    s.atividade();
    s.atividade();
    await s.encerrar();
    expect(api.registrarSessao).toHaveBeenCalledTimes(1);
    expect(api.registrarSessao).toHaveBeenCalledWith(7);
  });

  it("encerrar devolve a sessão; sem ter começado, não chama o core", async () => {
    const s = new SessaoDeLeitura("livro", relogio);
    expect(await s.encerrar()).toBeNull();
    expect(api.encerrarSessao).not.toHaveBeenCalled();

    const t = new SessaoDeLeitura("livro", relogio);
    t.mover(em("a"));
    expect((await t.encerrar())?.ativo).toBe(90);
    t.mover(em("b"));
    expect(api.registrarSessao).not.toHaveBeenCalled();
  });

  it("se o início falhar, os avisos seguintes não vão (e nada quebra)", async () => {
    api.iniciarSessao.mockRejectedValue("banco travado");
    const s = new SessaoDeLeitura("livro", relogio);
    s.mover(em("a"));
    s.mover(em("b"));
    expect(await s.encerrar()).toBeNull();
    expect(api.registrarSessao).not.toHaveBeenCalled();
    expect(api.encerrarSessao).not.toHaveBeenCalled();
  });
});
