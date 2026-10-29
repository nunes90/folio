import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import ControlesLado from "./ControlesLado.svelte";

function montar(secao = "Capítulo 3") {
  const props = { secao, posicao: "45%", onAnterior: vi.fn(), onProxima: vi.fn(), onFechar: vi.fn() };
  return { props, ...render(ControlesLado, props) };
}

describe("ControlesLado", () => {
  it("mostra a seção e a posição; os botões viram as páginas do lado e o fecham", async () => {
    const { props } = montar();
    expect(screen.getByText("Capítulo 3")).toBeTruthy();
    expect(screen.getByText("45%")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Página anterior deste lado" }));
    await fireEvent.click(screen.getByRole("button", { name: "Próxima página deste lado" }));
    await fireEvent.click(screen.getByRole("button", { name: "Fechar o lado" }));
    expect(props.onAnterior).toHaveBeenCalledOnce();
    expect(props.onProxima).toHaveBeenCalledOnce();
    expect(props.onFechar).toHaveBeenCalledOnce();
  });

  it("sem seção ainda, diz “Ao lado”", () => {
    montar("");
    expect(screen.getByText("Ao lado")).toBeTruthy();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = montar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
