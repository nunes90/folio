import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import EscolherColecoes from "./EscolherColecoes.svelte";

const colecoes = [
  { id: 1, nome: "Clássicos", quantidade: 3 },
  { id: 2, nome: "Ficção", quantidade: 5 },
];

function renderizar(extra = {}) {
  const onAlternar = vi.fn();
  const onCriar = vi.fn(async () => null as string | null);
  const onFechar = vi.fn();
  const r = render(EscolherColecoes, {
    aberto: true,
    titulo: "Dom Casmurro",
    colecoes,
    marcadas: [2],
    onAlternar,
    onCriar,
    onFechar,
    ...extra,
  });
  return { ...r, onAlternar, onCriar, onFechar };
}

describe("EscolherColecoes", () => {
  it("uma caixa por coleção, marcada se o livro está nela", () => {
    renderizar();
    expect((screen.getByRole("checkbox", { name: "Clássicos" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Ficção" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("dialog", { name: "Coleções de Dom Casmurro" })).toBeTruthy();
  });

  it("marcar ou desmarcar aplica na hora", async () => {
    const { onAlternar } = renderizar();
    await fireEvent.click(screen.getByRole("checkbox", { name: "Clássicos" }));
    expect(onAlternar).toHaveBeenCalledWith(1, true);
    await fireEvent.click(screen.getByRole("checkbox", { name: "Ficção" }));
    expect(onAlternar).toHaveBeenCalledWith(2, false);
  });

  it("cria uma coleção nova ali mesmo; o erro aparece ligado ao campo", async () => {
    const onCriar = vi.fn(async () => "já existe uma coleção chamada “Ficção”");
    renderizar({ onCriar });
    const campo = screen.getByRole("textbox", { name: "Nova coleção" });
    await fireEvent.input(campo, { target: { value: "ficção" } });
    await fireEvent.click(screen.getByRole("button", { name: "Criar e adicionar" }));
    expect(onCriar).toHaveBeenCalledWith("ficção");
    await screen.findByText(/já existe/);
    expect(campo.getAttribute("aria-invalid")).toBe("true");
  });

  it("sem coleções, explica e oferece criar a primeira", () => {
    renderizar({ colecoes: [], marcadas: [] });
    expect(screen.getByText(/Ainda não há coleções/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Nova coleção" })).toBeTruthy();
  });

  it("Concluir fecha", async () => {
    const { onFechar } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(onFechar).toHaveBeenCalled();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
