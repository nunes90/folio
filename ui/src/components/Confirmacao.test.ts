import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { createRawSnippet } from "svelte";
import { describe, expect, it, vi } from "vitest";
import Confirmacao from "./Confirmacao.svelte";

const texto = createRawSnippet(() => ({ render: () => "<p>O arquivo original não é afetado.</p>" }));

function renderizar() {
  const onConfirmar = vi.fn();
  const onCancelar = vi.fn();
  const r = render(Confirmacao, {
    aberto: true,
    titulo: "Remover Dom Casmurro?",
    rotuloConfirmar: "Remover",
    onConfirmar,
    onCancelar,
    children: texto,
  });
  return { ...r, onConfirmar, onCancelar };
}

describe("Confirmacao", () => {
  it("mostra título e explicação, com o foco em Cancelar", () => {
    renderizar();
    const dialogo = screen.getByRole("dialog", { name: "Remover Dom Casmurro?" });
    expect(dialogo.getAttribute("aria-describedby")).toBe("texto-confirmacao");
    expect(screen.getByText("O arquivo original não é afetado.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  });

  it("confirmar chama só onConfirmar", async () => {
    const { onConfirmar, onCancelar } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(onConfirmar).toHaveBeenCalledOnce();
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("fechar sem confirmar (Esc ou Cancelar) chama onCancelar", () => {
    const { onConfirmar, onCancelar } = renderizar();
    // O navegador dispara "close" ao fechar; o jsdom não implementa o fechamento em si.
    screen.getByRole("dialog").dispatchEvent(new Event("close"));
    expect(onCancelar).toHaveBeenCalledOnce();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
