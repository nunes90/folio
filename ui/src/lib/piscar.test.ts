import { afterEach, describe, expect, it, vi } from "vitest";
import { DURACAO_PISCAR, piscar } from "./piscar";

describe("piscar", () => {
  afterEach(() => vi.useRealTimers());

  it("desenha uma marca por caixa, decorativa, e remove depois", async () => {
    vi.useFakeTimers();
    const alvo = document.createElement("div");
    piscar(alvo, [{ left: 10, top: 20, width: 100, height: 12 }, { left: 10, top: 34, width: 60, height: 12 }], {
      opacidade: 0.4,
      mistura: "multiply",
    });
    const camada = alvo.lastElementChild as HTMLElement;
    expect(camada.getAttribute("aria-hidden")).toBe("true");
    expect(camada.children).toHaveLength(2);
    expect((camada.children[0] as HTMLElement).style.top).toBe("20px");
    await vi.advanceTimersByTimeAsync(DURACAO_PISCAR);
    expect(alvo.children).toHaveLength(0);
  });

  it("sem caixas, nada", () => {
    const alvo = document.createElement("div");
    piscar(alvo, [], { opacidade: 0.4, mistura: "multiply" });
    expect(alvo.children).toHaveLength(0);
  });
});
