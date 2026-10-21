import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import BuscaPdf from "./BuscaPdf.svelte";

describe("BuscaPdf", () => {
  it("busca para frente ao enviar e para trás com Shift+Enter", async () => {
    const onBuscar = vi.fn();
    render(BuscaPdf, { onBuscar });
    const campo = screen.getByRole("searchbox", { name: "Buscar no documento" });
    await fireEvent.input(campo, { target: { value: "Capitu" } });
    await fireEvent.submit(campo.closest("form")!);
    await fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
    expect(onBuscar.mock.calls).toEqual([
      ["Capitu", false],
      ["Capitu", true],
    ]);
  });

  it("ignora termo vazio", async () => {
    const onBuscar = vi.fn();
    render(BuscaPdf, { onBuscar });
    await fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onBuscar).not.toHaveBeenCalled();
  });

  it("anuncia o resultado", () => {
    render(BuscaPdf, { onBuscar: () => {}, resultado: "3 de 12" });
    expect(screen.getByRole("status").textContent).toBe("3 de 12");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(BuscaPdf, { onBuscar: () => {}, resultado: "1 de 2" });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
