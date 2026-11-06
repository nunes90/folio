import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import Posicao from "./Posicao.svelte";

function renderizar(valor = 50) {
  const onIr = vi.fn();
  const r = render(Posicao, {
    valor,
    min: 1,
    max: 100,
    passo: 1,
    grande: 10,
    rotulo: "Posição no livro",
    texto: (v: number) => `Página ${v} de 100`,
    onIr,
  });
  const slider = screen.getByRole("slider", {
    name: "Posição no livro",
  }) as HTMLInputElement;
  return { ...r, onIr, slider };
}

afterEach(() => vi.useRealTimers());

describe("Posicao (slider de posição)", () => {
  it("diz a página ao leitor de tela", () => {
    const { slider } = renderizar(42);
    expect(slider.value).toBe("42");
    expect(slider.getAttribute("aria-valuetext")).toBe("Página 42 de 100");
  });

  it("teclado: os passos se somam e só navega quando as teclas param", async () => {
    vi.useFakeTimers();
    const { slider, onIr } = renderizar(50);
    await fireEvent.keyDown(slider, { key: "ArrowRight" });
    await fireEvent.keyDown(slider, { key: "PageUp" });
    expect(slider.getAttribute("aria-valuetext")).toBe("Página 61 de 100");
    expect(onIr).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onIr).toHaveBeenCalledExactlyOnceWith(61);
    await fireEvent.keyDown(slider, { key: "Home" });
    vi.advanceTimersByTime(400);
    expect(onIr).toHaveBeenLastCalledWith(1);
  });

  it("a seta não chega ao leitor (não vira a página)", async () => {
    const { slider } = renderizar();
    const naJanela = vi.fn();
    window.addEventListener("keydown", naJanela);
    await fireEvent.keyDown(slider, { key: "ArrowLeft" });
    window.removeEventListener("keydown", naJanela);
    expect(naJanela).not.toHaveBeenCalled();
  });

  it("arrastar: balão com o destino e navega ao soltar; depois mostra a posição real", async () => {
    const { slider, onIr, container, rerender } = renderizar(10);
    await fireEvent.pointerDown(slider);
    await fireEvent.input(slider, { target: { value: "80" } });
    expect(container.querySelector(".balao")?.textContent).toBe(
      "Página 80 de 100",
    );
    expect(onIr).not.toHaveBeenCalled();
    await fireEvent.change(slider, { target: { value: "80" } });
    expect(onIr).toHaveBeenCalledExactlyOnceWith(80);
    expect(container.querySelector(".balao")).toBeNull();
    // O livro chegou um pouco antes (a página não bate exatamente): vale a do livro.
    await rerender({ valor: 79 });
    expect(slider.value).toBe("79");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
