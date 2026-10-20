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
});
