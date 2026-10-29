import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { createRawSnippet } from "svelte";
import { describe, expect, it, vi } from "vitest";
import ControlesLado from "./ControlesLado.svelte";

const paginas = createRawSnippet(() => ({
  render: () => '<div role="group" aria-label="Páginas"><button type="button">Próxima</button></div>',
}));

function montar() {
  const onFechar = vi.fn();
  return { onFechar, ...render(ControlesLado, { onFechar, children: paginas }) };
}

describe("ControlesLado", () => {
  it("os controles do principal (passados como filhos) e, no fim, Fechar o lado", async () => {
    const { onFechar } = montar();
    expect(screen.getByRole("group", { name: "Páginas" })).toBeTruthy();
    const fechar = screen.getByRole("button", { name: "Fechar o lado" });
    expect(fechar.getAttribute("aria-keyshortcuts")).toBe("Control+Shift+L");
    await fireEvent.click(fechar);
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = montar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
