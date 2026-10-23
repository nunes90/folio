import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avisar, avisos, DURACAO_AVISO_MS } from "../lib/avisos.svelte";
import Avisos from "./Avisos.svelte";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  avisos.splice(0);
  vi.useRealTimers();
});

describe("Avisos", () => {
  it("sucesso vai para a região de status; erro, para a de alerta", async () => {
    render(Avisos);
    avisar("3 livros importados.");
    avisar("Não foi possível importar x.epub: não é um EPUB", "erro");
    await tick();
    expect(screen.getByRole("status").textContent).toContain("3 livros importados.");
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível importar x.epub");
  });

  it("as regiões existem antes do primeiro aviso (senão o leitor de tela não anuncia)", () => {
    render(Avisos);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("o botão de fechar remove o aviso", async () => {
    render(Avisos);
    avisar("Dom Casmurro foi importado.");
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(avisos).toHaveLength(0);
  });

  it("sucesso some sozinho depois de um tempo; erro fica até ser fechado", async () => {
    render(Avisos);
    avisar("Dom Casmurro foi importado.");
    avisar("Não foi possível abrir x.epub.", "erro");
    await tick();
    vi.advanceTimersByTime(DURACAO_AVISO_MS);
    expect(avisos.map((a) => a.tipo)).toEqual(["erro"]);
  });

  it("com o ponteiro ou o foco em cima, o aviso não some (WCAG 2.2.1)", async () => {
    render(Avisos);
    avisar("Dom Casmurro foi importado.");
    await tick();
    const item = screen.getByText("Dom Casmurro foi importado.").closest("li")!;
    await fireEvent.mouseEnter(item);
    vi.advanceTimersByTime(DURACAO_AVISO_MS * 3);
    expect(avisos).toHaveLength(1);
    await fireEvent.mouseLeave(item);
    vi.advanceTimersByTime(DURACAO_AVISO_MS);
    expect(avisos).toHaveLength(0);
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    vi.useRealTimers();
    const { container } = render(Avisos);
    avisar("Dom Casmurro foi importado.");
    avisar("Não foi possível abrir x.epub.", "erro");
    await tick();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
