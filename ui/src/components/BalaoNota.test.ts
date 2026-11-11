import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import BalaoNota from "./BalaoNota.svelte";

const nota = { titulo: "Nota de rodapé", paragrafos: ["Primeiro parágrafo.", "Segundo."] };

function montar() {
  const onIr = vi.fn();
  const onFechar = vi.fn();
  render(BalaoNota, { nota, x: 200, y: 300, abaixo: false, onIr, onFechar });
  return { onIr, onFechar };
}

describe("BalaoNota", () => {
  it("mostra o título e os parágrafos, e recebe o foco", async () => {
    montar();
    const balao = screen.getByRole("dialog", { name: "Nota de rodapé" });
    expect(balao.textContent).toContain("Primeiro parágrafo.");
    expect(balao.querySelectorAll("p")).toHaveLength(2);
    await tick();
    await tick();
    expect(document.activeElement).toBe(balao);
  });

  it("Esc fecha sem a tecla seguir adiante", async () => {
    const { onFechar } = montar();
    const depois = vi.fn();
    window.addEventListener("keydown", depois);
    await fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    window.removeEventListener("keydown", depois);
    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(depois).not.toHaveBeenCalled();
  });

  it("os botões: ir até a nota e fechar", async () => {
    const { onIr, onFechar } = montar();
    await fireEvent.click(screen.getByRole("button", { name: "Ir até a nota" }));
    await fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onIr).toHaveBeenCalledTimes(1);
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("sem problemas de acessibilidade (axe)", async () => {
    montar();
    const r = await axe.run(document.body);
    expect(r.violations).toEqual([]);
  });
});
