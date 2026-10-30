import { render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import pacote from "../../package.json";
import Sobre from "./Sobre.svelte";

describe("Sobre", () => {
  it("diz a versão, a licença, que não há garantia e onde está o código", () => {
    render(Sobre, { aberto: true, onFechar: () => {} });
    expect(screen.getByRole("dialog", { name: "Folio" })).toBeTruthy();
    expect(screen.getByText(`Versão ${pacote.version}`)).toBeTruthy();
    expect(screen.getByText(/GNU General\s+Public License, versão 3/)).toBeTruthy();
    expect(screen.getByText(/sem nenhuma garantia/)).toBeTruthy();
    expect(screen.getByText("https://github.com/nunes90/folio")).toBeTruthy();
  });

  it("o pacote declara a licença que o diálogo diz", () => {
    expect(pacote.license).toBe("GPL-3.0-or-later");
  });

  it("fica fechado sem pedir; fechar avisa o pai", () => {
    const onFechar = vi.fn();
    render(Sobre, { aberto: false, onFechar });
    expect(screen.queryByRole("dialog")).toBeNull();
    document.querySelector("dialog")!.dispatchEvent(new Event("close"));
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Sobre, { aberto: true, onFechar: () => {} });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
