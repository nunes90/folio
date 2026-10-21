import { render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { ATALHOS } from "../lib/atalhos";
import Atalhos from "./Atalhos.svelte";

describe("Atalhos", () => {
  it("lista os atalhos do contexto numa tabela", () => {
    render(Atalhos, { contexto: "pdf", aberto: true, onFechar: () => {} });
    const tabela = screen.getByRole("table", { name: "Leitura de PDF" });
    // Uma linha de cabeçalho + uma por atalho.
    expect(within(tabela).getAllByRole("row")).toHaveLength(ATALHOS.pdf.length + 1);
    expect(within(tabela).getByText("Buscar no documento")).toBeTruthy();
  });

  it("fica fechado quando não está aberto", () => {
    render(Atalhos, { contexto: "biblioteca", aberto: false, onFechar: () => {} });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ao fechar (Esc ou botão Fechar), avisa o componente pai", () => {
    // Quem fecha é o navegador (Esc ou <form method="dialog">), que dispara "close"; o jsdom
    // não implementa esse fechamento, então disparamos o evento diretamente.
    const onFechar = vi.fn();
    render(Atalhos, { contexto: "epub", aberto: true, onFechar });
    const dialogo = screen.getByRole("dialog", { name: "Atalhos de teclado" });
    expect(within(dialogo).getByRole("button", { name: "Fechar" })).toBeTruthy();
    dialogo.dispatchEvent(new Event("close"));
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Atalhos, { contexto: "epub", aberto: true, onFechar: () => {} });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
