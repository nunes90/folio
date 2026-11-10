import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { sistema } from "../lib/ambiente.svelte";
import Busca from "./Busca.svelte";

describe("Busca", () => {
  it("busca para frente ao enviar e para trás com Shift+Enter", async () => {
    const onBuscar = vi.fn();
    render(Busca, { onBuscar });
    const campo = screen.getByRole("searchbox", {
      name: "Buscar no documento",
    });
    await fireEvent.input(campo, { target: { value: "Capitu" } });
    await fireEvent.submit(campo.closest("form")!);
    await fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
    expect(onBuscar.mock.calls).toEqual([
      ["Capitu", false],
      ["Capitu", true],
    ]);
  });

  it("avisa quando o campo fica vazio", async () => {
    const onLimpar = vi.fn();
    render(Busca, { onBuscar: vi.fn(), onLimpar });
    const campo = screen.getByRole("searchbox");
    await fireEvent.input(campo, { target: { value: "Capitu" } });
    expect(onLimpar).not.toHaveBeenCalled();
    await fireEvent.input(campo, { target: { value: "" } });
    expect(onLimpar).toHaveBeenCalledTimes(1);
  });

  it("ignora termo vazio", async () => {
    const onBuscar = vi.fn();
    render(Busca, { onBuscar });
    await fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onBuscar).not.toHaveBeenCalled();
  });

  it("anuncia o resultado", () => {
    render(Busca, { onBuscar: () => {}, resultado: "3 de 12" });
    expect(screen.getByRole("status").textContent).toBe("3 de 12");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Busca, {
      onBuscar: () => {},
      resultado: "1 de 2",
    });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  describe("janela estreita (M28c)", () => {
    afterEach(() => {
      sistema.estreita = false;
    });

    it("vira uma lupa que abre a busca por cima do cabeçalho; Esc fecha e devolve o foco à lupa", async () => {
      sistema.estreita = true;
      const onBuscar = vi.fn();
      render(Busca, { onBuscar });
      expect(screen.queryByRole("searchbox")).toBeNull();
      const lupa = screen.getByRole("button", { name: "Buscar no documento" });
      expect(lupa.getAttribute("aria-expanded")).toBe("false");
      await fireEvent.click(lupa);
      await tick();
      const campo = screen.getByRole("searchbox", {
        name: "Buscar no documento",
      });
      expect(document.activeElement).toBe(campo);
      expect(lupa.getAttribute("aria-expanded")).toBe("true");
      const naJanela = vi.fn();
      window.addEventListener("keydown", naJanela);
      await fireEvent.keyDown(campo, { key: "Escape" });
      window.removeEventListener("keydown", naJanela);
      // O Esc fica com a busca (não fecha um painel nem sai do modo foco).
      expect(naJanela).not.toHaveBeenCalled();
      await tick();
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(document.activeElement).toBe(lupa);
    });
  });
});
