import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import PedirNome from "./PedirNome.svelte";

function renderizar(extra = {}) {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  const r = render(PedirNome, {
    aberto: true,
    titulo: "Nova coleção",
    rotuloConfirmar: "Criar",
    onConfirmar,
    onCancelar,
    ...extra,
  });
  return { ...r, onConfirmar, onCancelar };
}

describe("PedirNome", () => {
  it("abre com o foco no campo, já com o valor inicial selecionado", () => {
    renderizar({ valorInicial: "Ficção" });
    const campo = screen.getByRole("textbox", { name: "Nome" }) as HTMLInputElement;
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe("Ficção");
  });

  it("Enter (enviar o formulário) confirma com o nome digitado", async () => {
    const { onConfirmar } = renderizar();
    const campo = screen.getByRole("textbox", { name: "Nome" });
    await fireEvent.input(campo, { target: { value: "Trabalho" } });
    await fireEvent.submit(campo.closest("form")!);
    expect(onConfirmar).toHaveBeenCalledWith("Trabalho");
  });

  it("o erro aparece ligado ao campo (aria-invalid e aria-describedby)", () => {
    renderizar({ erro: "já existe uma coleção chamada “Ficção”" });
    const campo = screen.getByRole("textbox", { name: "Nome" });
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    const id = campo.getAttribute("aria-describedby")!;
    expect(document.getElementById(id)!.textContent).toContain("já existe");
  });

  it("Cancelar chama onCancelar", async () => {
    const { onCancelar } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalled();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar({ erro: "nome vazio" });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
