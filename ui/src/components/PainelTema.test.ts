import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { PADRAO } from "../lib/preferencias.svelte";
import PainelTema from "./PainelTema.svelte";

function renderizar(mudancas = {}, temaDoSistema: "claro" | "escuro" = "escuro") {
  const onMudar = vi.fn();
  const { container } = render(PainelTema, {
    preferencias: { ...PADRAO, ...mudancas },
    onMudar,
    temaDoSistema,
  });
  return { onMudar, container };
}

describe("PainelTema (seção Interface)", () => {
  it("é a seção Interface: só as cores do app (sépia é uma página, não um tema)", () => {
    renderizar();
    expect(screen.getByRole("heading", { name: "Interface" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Sépia" })).toBeNull();
    // A virada de página fica na seção Página.
    expect(screen.queryByRole("radio", { name: /Esmaecer/ })).toBeNull();
  });

  it("lista os temas e diz qual o sistema está usando", () => {
    renderizar();
    for (const nome of ["Claro", "Escuro", "Alto contraste"]) {
      expect(screen.getByRole("radio", { name: nome })).toBeTruthy();
    }
    expect(
      (screen.getByRole("radio", { name: /Do sistema \(agora: escuro\)/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("escolher tema e movimento chama onMudar", async () => {
    const { onMudar } = renderizar();
    await fireEvent.click(screen.getByRole("radio", { name: "Alto contraste" }));
    await fireEvent.click(screen.getByRole("radio", { name: "Sempre reduzir animações" }));
    expect(onMudar.mock.calls).toEqual([[{ tema: "alto-contraste" }], [{ movimento: "reduzido" }]]);
  });

  it("marca as escolhas atuais", () => {
    renderizar({ tema: "escuro", movimento: "reduzido" });
    expect((screen.getByRole("radio", { name: "Escuro" }) as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "Sempre reduzir animações" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
