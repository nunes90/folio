import { describe, expect, it, vi } from "vitest";
import { tratarArraste } from "./arrastar";

const posicao = { x: 0, y: 0 } as never;

function acoes() {
  return { entrar: vi.fn(), sair: vi.fn(), soltar: vi.fn() };
}

describe("tratarArraste", () => {
  it("arquivos entrando ou passando por cima mostram a área de soltar", () => {
    const a = acoes();
    tratarArraste({ type: "enter", paths: ["/l/a.epub"], position: posicao }, a);
    tratarArraste({ type: "over", position: posicao }, a);
    expect(a.entrar).toHaveBeenCalledTimes(2);
    expect(a.soltar).not.toHaveBeenCalled();
  });

  it("soltar importa os caminhos e esconde a área", () => {
    const a = acoes();
    tratarArraste({ type: "drop", paths: ["/l/a.epub", "/l/b.pdf"], position: posicao }, a);
    expect(a.soltar).toHaveBeenCalledWith(["/l/a.epub", "/l/b.pdf"]);
    expect(a.sair).toHaveBeenCalled();
  });

  it("sair da janela ou soltar sem arquivos (ex.: texto) só esconde a área", () => {
    const a = acoes();
    tratarArraste({ type: "leave" }, a);
    tratarArraste({ type: "drop", paths: [], position: posicao }, a);
    expect(a.sair).toHaveBeenCalledTimes(2);
    expect(a.soltar).not.toHaveBeenCalled();
  });
});
