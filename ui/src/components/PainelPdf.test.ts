import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { PADRAO } from "../lib/preferencias.svelte";
import PainelPdf from "./PainelPdf.svelte";

describe("PainelPdf", () => {
  it("página a página é o padrão (sugerido) e a rolagem é a opção", async () => {
    const onMudar = vi.fn();
    render(PainelPdf, { preferencias: PADRAO, onMudar });
    expect((screen.getByRole("radio", { name: /Página a página/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    await fireEvent.click(screen.getByRole("radio", { name: /Rolagem contínua/ }));
    expect(onMudar).toHaveBeenCalledWith({ modoPdf: "rolagem" });
  });

  it("página: original é o padrão; creme, sépia e noite são opções com amostra", async () => {
    const onMudar = vi.fn();
    render(PainelPdf, { preferencias: PADRAO, onMudar });
    expect((screen.getByRole("radio", { name: /Original/ }) as HTMLInputElement).checked).toBe(true);
    await fireEvent.click(screen.getByRole("radio", { name: /Noite/ }));
    expect(onMudar).toHaveBeenCalledWith({ paginaPdf: "noite" });
    expect(screen.getByRole("radio", { name: /Creme/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Sépia/ })).toBeTruthy();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(PainelPdf, { preferencias: PADRAO, onMudar: () => {} });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
