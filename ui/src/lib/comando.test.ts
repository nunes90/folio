import { beforeEach, describe, expect, it, vi } from "vitest";

const invocar = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invocar }));

import { ErroDoComando, comoErro, erroDoNome, invoke, tipoDoErro } from "./comando";

describe("erros dos comandos", () => {
  // Com chaves: o que o `beforeEach` devolve é chamado no fim do teste, e o `mockReset` devolve o mock.
  beforeEach(() => {
    invocar.mockReset();
  });

  it("o erro do core vira um ErroDoComando com o tipo", async () => {
    // Como o Tauri rejeita: com o objeto que o Rust serializou (não um Error).
    invocar.mockImplementation(() =>
      Promise.reject({ tipo: "nome-em-uso", mensagem: "já existe uma coleção chamada “Ficção”" }),
    );
    const erro = await invoke("criar_colecao", { nome: "Ficção" }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDoComando);
    expect(tipoDoErro(erro)).toBe("nome-em-uso");
  });

  it("num texto, o erro é só a mensagem", () => {
    const erro = comoErro({ tipo: "banco", mensagem: "erro no banco da biblioteca" });
    expect(String(erro)).toBe("erro no banco da biblioteca");
    expect(`Não deu: ${erro}`).toBe("Não deu: erro no banco da biblioteca");
  });

  it("o que não tem a forma do erro do core passa como veio", () => {
    expect(comoErro("comando desconhecido")).toBe("comando desconhecido");
    const outro = new TypeError("x");
    expect(comoErro(outro)).toBe(outro);
    expect(comoErro(null)).toBeNull();
    expect(comoErro({ tipo: 1, mensagem: "x" })).toEqual({ tipo: 1, mensagem: "x" });
    expect(tipoDoErro("texto")).toBeNull();
    expect(tipoDoErro(outro)).toBeNull();
  });

  it("só o nome repetido e o nome vazio são erros do campo", () => {
    expect(erroDoNome(new ErroDoComando("nome-em-uso", "x"))).toBe(true);
    expect(erroDoNome(new ErroDoComando("nome-vazio", "x"))).toBe(true);
    expect(erroDoNome(new ErroDoComando("banco", "x"))).toBe(false);
    expect(erroDoNome("já existe uma coleção")).toBe(false);
  });

  it("o resultado e os argumentos passam direto", async () => {
    invocar.mockResolvedValue(3);
    await expect(invoke("total", { a: 1 })).resolves.toBe(3);
    expect(invocar).toHaveBeenCalledWith("total", { a: 1 });
  });
});
