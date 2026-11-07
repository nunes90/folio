import { fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";
import AbasAparencia from "./AbasAparencia.svelte";
import { abaAparencia } from "../lib/aparencia.svelte";

const trecho = (texto: string) =>
  createRawSnippet(() => ({ render: () => `<p>${texto}</p>` }));

describe("AbasAparencia", () => {
  it("três abas no leitor; setas trocam; a escolha é lembrada; na biblioteca, sem Leitura", async () => {
    abaAparencia.atual = "leitura";
    const { unmount } = render(AbasAparencia, {
      prefixo: "t",
      leitura: trecho("conteúdo da leitura"),
      voz: trecho("conteúdo da voz"),
      aparenciaDoApp: trecho("conteúdo da interface"),
    });
    const leitura = screen.getByRole("tab", { name: "Leitura" });
    expect(leitura.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("conteúdo da leitura")).toBeTruthy();
    expect(screen.queryByText("conteúdo da voz")).toBeNull();
    leitura.focus();
    await fireEvent.keyDown(leitura, { key: "ArrowRight" });
    expect(
      screen.getByRole("tab", { name: "Voz" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Voz" }),
    );
    expect(screen.getByRole("tabpanel").textContent).toContain(
      "conteúdo da voz",
    );
    expect(abaAparencia.atual).toBe("voz");
    unmount();

    render(AbasAparencia, {
      prefixo: "b",
      voz: trecho("conteúdo da voz"),
      aparenciaDoApp: trecho("conteúdo da interface"),
    });
    expect(screen.queryByRole("tab", { name: "Leitura" })).toBeNull();
    // A última escolhida (Voz) existe aqui também.
    expect(
      screen.getByRole("tab", { name: "Voz" }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});
