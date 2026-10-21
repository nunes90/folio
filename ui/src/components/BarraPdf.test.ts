import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import BarraPdf from "./BarraPdf.svelte";

function props(parcial: Partial<Parameters<typeof render>[1]> = {}) {
  return {
    pagina: 3,
    total: 10,
    zoom: 1.25,
    onIrPara: vi.fn(),
    onZoomMenos: vi.fn(),
    onZoomMais: vi.fn(),
    onAjustarLargura: vi.fn(),
    ...parcial,
  };
}

describe("BarraPdf", () => {
  it("mostra página atual, total e zoom", () => {
    render(BarraPdf, props());
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("3");
    expect(screen.getByText(/de 10/)).toBeTruthy();
    expect(screen.getByText("125%")).toBeTruthy();
  });

  it("navega para a página anterior e a próxima", async () => {
    const p = props();
    render(BarraPdf, p);
    await fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    await fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(p.onIrPara.mock.calls).toEqual([[2], [4]]);
  });

  it("desabilita os limites", () => {
    render(BarraPdf, props({ pagina: 1, total: 1 }));
    expect(screen.getByRole("button", { name: "Página anterior" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Próxima página" }).hasAttribute("disabled")).toBe(true);
  });

  it("vai para a página digitada e ignora valores inválidos", async () => {
    const p = props();
    render(BarraPdf, p);
    const campo = screen.getByRole("spinbutton") as HTMLInputElement;
    await fireEvent.change(campo, { target: { value: "7" } });
    await fireEvent.change(campo, { target: { value: "99" } });
    expect(p.onIrPara.mock.calls).toEqual([[7]]);
    expect(campo.value).toBe("3");
  });

  it("controla o zoom", async () => {
    const p = props();
    render(BarraPdf, p);
    await fireEvent.click(screen.getByRole("button", { name: "Aumentar zoom" }));
    await fireEvent.click(screen.getByRole("button", { name: "Diminuir zoom" }));
    await fireEvent.click(screen.getByRole("button", { name: "Ajustar à largura" }));
    expect(p.onZoomMais).toHaveBeenCalledOnce();
    expect(p.onZoomMenos).toHaveBeenCalledOnce();
    expect(p.onAjustarLargura).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(BarraPdf, props());
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
