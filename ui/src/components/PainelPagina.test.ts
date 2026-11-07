import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { PADRAO, type Preferencias } from "../lib/preferencias.svelte";
import type { TemaEfetivo } from "../lib/temas";
import PainelPagina from "./PainelPagina.svelte";

function renderizar(
  formato: "epub" | "pdf",
  mudancas: Partial<Preferencias> = {},
  interface_: TemaEfetivo = "escuro",
) {
  const onMudar = vi.fn();
  const r = render(PainelPagina, {
    preferencias: { ...PADRAO, ...mudancas },
    onMudar,
    formato,
    interface: interface_,
  });
  return { ...r, onMudar };
}

describe("PainelPagina (aba Leitura, a página)", () => {
  it("mesmas opções nos dois formatos; automática é o padrão e diz o que está valendo", () => {
    for (const formato of ["epub", "pdf"] as const) {
      const { unmount } = renderizar(formato);
      expect(screen.getByRole("heading", { name: "Página" })).toBeTruthy();
      const automatica = screen.getByRole("radio", {
        name: /Automática/,
      }) as HTMLInputElement;
      expect(automatica.checked).toBe(true);
      expect(
        screen.getByText("Automática: segue a interface (agora, noite)."),
      ).toBeTruthy();
      for (const nome of [/Original/, /Creme/, /Sépia/, /Noite/]) {
        expect(screen.getByRole("radio", { name: nome })).toBeTruthy();
      }
      unmount();
    }
  });

  it("escolher uma página chama onMudar com `pagina`; a ajuda diz o que a escolhida faz", async () => {
    const { onMudar } = renderizar("epub", { pagina: "creme" });
    expect(screen.getByText("Creme: papel claro e quente.")).toBeTruthy();
    await fireEvent.click(screen.getByRole("radio", { name: /Sépia/ }));
    expect(onMudar).toHaveBeenCalledWith({ pagina: "sepia" });
  });

  it("explica a diferença entre os formatos numa frase", () => {
    renderizar("pdf");
    expect(screen.getByText(/No PDF, a página é um desenho/)).toBeTruthy();
  });

  it("virada de página fica aqui, nos dois formatos", async () => {
    const { onMudar } = renderizar("epub");
    expect(
      (screen.getByRole("radio", { name: "Nenhuma" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await fireEvent.click(screen.getByRole("radio", { name: "Virar a folha" }));
    expect(onMudar).toHaveBeenCalledWith({ virada: "virar" });
  });

  it("só no PDF: página a página (padrão) ou rolagem contínua", async () => {
    const { onMudar, unmount } = renderizar("pdf");
    expect(
      (
        screen.getByRole("radio", {
          name: /Página a página/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await fireEvent.click(
      screen.getByRole("radio", { name: /Rolagem contínua/ }),
    );
    expect(onMudar).toHaveBeenCalledWith({ modoPdf: "rolagem" });
    unmount();
    renderizar("epub");
    expect(
      screen.queryByRole("radio", { name: /Rolagem contínua/ }),
    ).toBeNull();
  });

  it("com a interface em alto contraste, avisa que a página do EPUB também fica em alto contraste", () => {
    const { unmount } = renderizar("epub", {}, "alto-contraste");
    expect(
      screen.getByText(/a página também fica em alto contraste/),
    ).toBeTruthy();
    unmount();
    renderizar("pdf", {}, "alto-contraste");
    expect(
      screen.queryByText(/a página também fica em alto contraste/),
    ).toBeNull();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar("pdf");
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("a velocidade da voz saiu para a seção Voz", () => {
    for (const formato of ["epub", "pdf"] as const) {
      const { unmount } = renderizar(formato);
      expect(
        screen.queryByLabelText("Velocidade da leitura em voz alta"),
      ).toBeNull();
      unmount();
    }
  });
});
