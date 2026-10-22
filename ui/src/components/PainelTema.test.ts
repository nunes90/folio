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

describe("PainelTema", () => {
  it("lista os temas e diz qual o sistema está usando", () => {
    renderizar();
    for (const nome of ["Claro", "Escuro", "Sépia", "Alto contraste"]) {
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
    renderizar({ tema: "sepia", movimento: "reduzido" });
    expect((screen.getByRole("radio", { name: "Sépia" }) as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "Sempre reduzir animações" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("virada de página: esmaecer é o padrão sugerido; as outras são opções", async () => {
    const { onMudar } = renderizar();
    expect((screen.getByRole("radio", { name: "Esmaecer (sugerido)" }) as HTMLInputElement).checked).toBe(
      true,
    );
    await fireEvent.click(screen.getByRole("radio", { name: "Virar a folha" }));
    expect(onMudar).toHaveBeenCalledWith({ virada: "virar" });
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
