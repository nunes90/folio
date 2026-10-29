import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import MenuLeitor from "./MenuLeitor.svelte";

function montar() {
  const ideia = vi.fn();
  const sobre = vi.fn();
  const { container } = render(MenuLeitor, {
    itens: [
      { id: "ideia", nome: "Uma ideia por vez", marcado: true, teclas: "Ctrl+Shift+B", atalho: "Control+Shift+B", executar: ideia },
      { id: "sobre", nome: "Sobre o livro", executar: sobre },
    ],
  });
  return { container, ideia, sobre, botao: screen.getByRole("button", { name: "Mais opções" }) };
}

describe("MenuLeitor", () => {
  it("abre com o foco no primeiro item; liga/desliga é menuitemcheckbox, ação simples é menuitem", async () => {
    const { botao } = montar();
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    const ideia = screen.getByRole("menuitemcheckbox", { name: "Uma ideia por vez" });
    expect(document.activeElement).toBe(ideia);
    expect(ideia.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Sobre o livro" })).toBeTruthy();
  });

  it("escolher executa, fecha e devolve o foco ao botão", async () => {
    const { botao, sobre } = montar();
    await fireEvent.click(botao);
    await fireEvent.click(screen.getByRole("menuitem", { name: "Sobre o livro" }));
    expect(sobre).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(botao);
  });

  it("um clique fora fecha", async () => {
    const { botao } = montar();
    await fireEvent.click(botao);
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("aberto, não tem violações de acessibilidade (axe)", async () => {
    const { botao, container } = montar();
    await fireEvent.click(botao);
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
