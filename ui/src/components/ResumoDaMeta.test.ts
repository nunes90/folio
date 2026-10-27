import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import ResumoDaMeta from "./ResumoDaMeta.svelte";
import type { Resumo } from "../lib/meta.svelte";

const resumo: Resumo = {
  meta: { tipo: "minutos", minutos: 20 },
  segundos: 1200,
  paginas: 13,
  de: "página 128",
  ate: "página 141",
};

function renderizar() {
  const props = { resumo, onContinuar: vi.fn(), onRepetir: vi.fn(), onVoltar: vi.fn() };
  return { ...render(ResumoDaMeta, props), ...props };
}

describe("ResumoDaMeta", () => {
  it("diz o que foi lido, com o foco em Continuar lendo", () => {
    renderizar();
    expect(screen.getByRole("dialog", { name: "Meta cumprida" })).toBeTruthy();
    expect(screen.getByText("Você leu 20 minutos: de página 128 até página 141.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continuar lendo" }));
  });

  it("cada botão faz uma coisa só", async () => {
    const { onContinuar, onRepetir, onVoltar } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Mais 20 min" }));
    expect(onRepetir).toHaveBeenCalledOnce();
    expect(onContinuar).not.toHaveBeenCalled();
    expect(onVoltar).not.toHaveBeenCalled();
  });

  it("fechar sem escolher (Esc) é continuar", async () => {
    const { onContinuar } = renderizar();
    const dialogo = screen.getByRole("dialog");
    dialogo.dispatchEvent(new Event("close"));
    expect(onContinuar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
