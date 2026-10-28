import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import CartaoContinuacao from "./CartaoContinuacao.svelte";

const continuacao = {
  onde: "em “Capítulo 3”",
  quando: "há 2 dias",
  trecho: ["Ouvi o meu nome.", "Escondi-me atrás da porta."],
};

describe("CartaoContinuacao", () => {
  it("diz onde e quando, com as frases antes do ponto", () => {
    render(CartaoContinuacao, { continuacao, onFechar: vi.fn() });
    expect(screen.getByRole("region", { name: "Onde você parou" })).toBeTruthy();
    expect(screen.getByText(/Da última vez \(há 2 dias\), você estava\s+em “Capítulo 3”\./)).toBeTruthy();
    expect(screen.getByText(/Ouvi o meu nome\. Escondi-me atrás da porta\./)).toBeTruthy();
  });

  it("sem frases, sem citação; Continuar lendo fecha", async () => {
    const onFechar = vi.fn();
    const { container } = render(CartaoContinuacao, {
      continuacao: { onde: "na página 42", trecho: [] },
      onFechar,
    });
    expect(container.querySelector("blockquote")).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Continuar lendo" }));
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(CartaoContinuacao, { continuacao, onFechar: vi.fn() });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
