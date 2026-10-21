import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { PADRAO } from "../lib/preferencias.svelte";
import PainelLeitura from "./PainelLeitura.svelte";

function renderizar(mudancas = {}) {
  const onMudar = vi.fn();
  const onRestaurar = vi.fn();
  const { container } = render(PainelLeitura, {
    preferencias: { ...PADRAO, ...mudancas },
    onMudar,
    onRestaurar,
  });
  return { onMudar, onRestaurar, container };
}

describe("PainelLeitura", () => {
  it("marca as opções atuais", () => {
    renderizar({ fonte: "lexend", alinhamento: "justificado", colunas: 1, hifenizacao: true });
    expect((screen.getByRole("radio", { name: /Lexend/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Justificado" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole("radio", { name: "Uma" }) as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "Hifenizar palavras longas" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("controles deslizantes anunciam o valor por extenso", () => {
    renderizar({ tamanho: 1.25 });
    const tamanho = screen.getByRole("slider", { name: "Tamanho do texto" });
    expect(tamanho.getAttribute("aria-valuetext")).toBe("125%");
  });

  it("mudar a fonte e o tamanho chama onMudar com números", async () => {
    const { onMudar } = renderizar();
    await fireEvent.click(screen.getByRole("radio", { name: /OpenDyslexic/ }));
    await fireEvent.input(screen.getByRole("slider", { name: "Altura da linha" }), {
      target: { value: "2" },
    });
    expect(onMudar.mock.calls).toEqual([[{ fonte: "opendyslexic" }], [{ entrelinha: 2 }]]);
  });

  it("restaura o padrão", async () => {
    const { onRestaurar } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Restaurar o padrão" }));
    expect(onRestaurar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    // Só o componente: no app ele fica dentro de um <aside> (landmark) do leitor.
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
