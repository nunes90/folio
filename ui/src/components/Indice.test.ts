import { fireEvent, render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import Indice from "./Indice.svelte";

const itens = [
  { label: "Capítulo 1", href: "cap1.xhtml" },
  {
    label: "Capítulo 2",
    href: "cap2.xhtml",
    subitems: [{ label: "Seção 2.1", href: "cap2.xhtml#s1" }],
  },
];

describe("Indice", () => {
  it("renderiza itens aninhados como listas", () => {
    render(Indice, { itens, onNavegar: () => {} });
    const [raiz] = screen.getAllByRole("list");
    expect(within(raiz).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Seção 2.1" })).toBeTruthy();
  });

  it("marca o capítulo atual com aria-current", () => {
    render(Indice, { itens, atual: "cap2.xhtml", onNavegar: () => {} });
    expect(screen.getByRole("button", { name: "Capítulo 2" }).getAttribute("aria-current")).toBe(
      "location",
    );
    expect(screen.getByRole("button", { name: "Capítulo 1" }).hasAttribute("aria-current")).toBe(
      false,
    );
  });

  it("chama onNavegar com o href ao clicar", async () => {
    const onNavegar = vi.fn();
    render(Indice, { itens, onNavegar });
    await fireEvent.click(screen.getByRole("button", { name: "Seção 2.1" }));
    expect(onNavegar).toHaveBeenCalledWith("cap2.xhtml#s1");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Indice, { itens, atual: "cap1.xhtml", onNavegar: () => {} });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("setas percorrem os capítulos, inclusive os subitens, sem virar a página", async () => {
    const janela = vi.fn();
    window.addEventListener("keydown", janela);
    render(Indice, {
      itens: [
        { label: "Um", href: "1", subitems: [{ label: "Um ponto um", href: "1.1" }] },
        { label: "Dois", href: "2" },
      ],
      onNavegar: () => {},
    });
    const [um, sub, dois] = screen.getAllByRole("button");
    um.focus();
    await fireEvent.keyDown(um, { key: "ArrowDown" });
    expect(document.activeElement).toBe(sub);
    await fireEvent.keyDown(sub, { key: "End" });
    expect(document.activeElement).toBe(dois);
    await fireEvent.keyDown(dois, { key: "ArrowDown" });
    expect(document.activeElement).toBe(dois);
    await fireEvent.keyDown(dois, { key: "Home" });
    expect(document.activeElement).toBe(um);
    expect(janela).not.toHaveBeenCalled();
    window.removeEventListener("keydown", janela);
  });
});
