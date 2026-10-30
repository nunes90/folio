import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import PedirSenha from "./PedirSenha.svelte";

function renderizar(extra = {}) {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  const r = render(PedirSenha, { aberto: true, onConfirmar, onCancelar, ...extra });
  return { ...r, onConfirmar, onCancelar };
}

const campo = () => screen.getByLabelText("Senha") as HTMLInputElement;

describe("PedirSenha", () => {
  it("abre com o foco no campo de senha (escondida) e explica que não fica guardada", () => {
    renderizar();
    expect(document.activeElement).toBe(campo());
    expect(campo().type).toBe("password");
    expect(screen.getByRole("dialog", { name: "PDF protegido por senha" })).toBeTruthy();
    expect(screen.getByText(/não fica guardada/)).toBeTruthy();
  });

  it("Abrir confirma com a senha digitada, sem contar como cancelar", async () => {
    const { onConfirmar, onCancelar } = renderizar();
    await fireEvent.input(campo(), { target: { value: "segredo" } });
    await fireEvent.submit(campo().form!);
    expect(onConfirmar).toHaveBeenCalledWith("segredo");
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("senha incorreta: alerta ligado ao campo", () => {
    renderizar({ erradas: 1 });
    expect(screen.getByRole("alert").textContent).toBe("Senha incorreta. Tente de novo.");
    expect(campo().getAttribute("aria-invalid")).toBe("true");
    expect(campo().getAttribute("aria-describedby")).toBe("erro-senha");
  });

  it("depois de uma senha errada, Cancelar ainda avisa o pai", async () => {
    const { onConfirmar, onCancelar } = renderizar();
    await fireEvent.submit(campo().form!);
    expect(onConfirmar).toHaveBeenCalledWith("");
    await fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledOnce();
  });

  it("Cancelar avisa o pai", async () => {
    const { onCancelar } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar({ erradas: 1 });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
