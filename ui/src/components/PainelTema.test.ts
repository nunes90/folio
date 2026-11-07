import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { PADRAO } from "../lib/preferencias.svelte";
import PainelTema from "./PainelTema.svelte";

function renderizar(
  mudancas = {},
  temaDoSistema: "claro" | "escuro" = "escuro",
) {
  const onMudar = vi.fn();
  const { container } = render(PainelTema, {
    preferencias: { ...PADRAO, ...mudancas },
    onMudar,
    temaDoSistema,
  });
  return { onMudar, container };
}

describe("PainelTema (aba Interface)", () => {
  it("só as cores do app (sépia é uma página, não um tema), as animações e o modo foco", () => {
    renderizar();
    expect(screen.queryByRole("radio", { name: "Sépia" })).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /barras só pelo teclado/ }),
    ).toBeTruthy();
    // A virada de página fica na seção Página.
    expect(screen.queryByRole("radio", { name: /Esmaecer/ })).toBeNull();
  });

  it("lista os temas e diz qual o sistema está usando", () => {
    renderizar();
    for (const nome of ["Claro", "Escuro", "Alto contraste"]) {
      expect(screen.getByRole("radio", { name: nome })).toBeTruthy();
    }
    expect(
      (screen.getByRole("radio", { name: "Do sistema" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByText("Agora o sistema está no escuro.")).toBeTruthy();
  });

  it("escolher tema e movimento chama onMudar", async () => {
    const { onMudar } = renderizar();
    await fireEvent.click(
      screen.getByRole("radio", { name: "Alto contraste" }),
    );
    await fireEvent.click(
      screen.getByRole("radio", { name: "Sempre reduzidas" }),
    );
    expect(onMudar.mock.calls).toEqual([
      [{ tema: "alto-contraste" }],
      [{ movimento: "reduzido" }],
    ]);
  });

  it("barras do modo foco só pelo teclado", async () => {
    const { onMudar } = renderizar();
    await fireEvent.click(
      screen.getByRole("checkbox", { name: /barras só pelo teclado/ }),
    );
    expect(onMudar).toHaveBeenCalledWith({ barrasSoPeloTeclado: true });
  });

  it("marca as escolhas atuais", () => {
    renderizar({ tema: "escuro", movimento: "reduzido" });
    expect(
      (screen.getByRole("radio", { name: "Escuro" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole("radio", {
          name: "Sempre reduzidas",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
