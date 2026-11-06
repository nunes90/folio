import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ControlesVoz from "./ControlesVoz.svelte";

function renderizar(estado: "parado" | "falando" | "pausado") {
  const props = {
    estado,
    onLer: vi.fn(),
    onPausarOuRetomar: vi.fn(),
    onParar: vi.fn(),
  };
  render(ControlesVoz, props);
  return props;
}

describe("ControlesVoz", () => {
  it("parado: só ler", async () => {
    const { onLer } = renderizar("parado");
    await fireEvent.click(
      screen.getByRole("button", { name: "Ler em voz alta" }),
    );
    expect(onLer).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Parar leitura" })).toBeNull();
  });

  it("falando: pausar e parar; pausado: continuar", async () => {
    const { onPausarOuRetomar, onParar } = renderizar("falando");
    await fireEvent.click(
      screen.getByRole("button", { name: "Pausar leitura" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "Parar leitura" }),
    );
    expect(onPausarOuRetomar).toHaveBeenCalledOnce();
    expect(onParar).toHaveBeenCalledOnce();
  });

  it("pausado: o botão diz continuar", () => {
    renderizar("pausado");
    expect(
      screen.getByRole("button", { name: "Continuar leitura" }),
    ).toBeTruthy();
  });
});

describe("ControlesVoz: o foco não se perde", () => {
  it("ler → pausar é o mesmo botão; parar devolve o foco a ele", async () => {
    const props = {
      estado: "parado" as const,
      onLer: vi.fn(),
      onPausarOuRetomar: vi.fn(),
      onParar: vi.fn(),
    };
    const { rerender } = render(ControlesVoz, props);
    const ler = screen.getByRole("button", { name: "Ler em voz alta" });
    ler.focus();
    await rerender({ ...props, estado: "falando" });
    expect(screen.getByRole("button", { name: "Pausar leitura" })).toBe(ler);
    expect(document.activeElement).toBe(ler);
    const parar = screen.getByRole("button", { name: "Parar leitura" });
    parar.focus();
    await fireEvent.click(parar);
    expect(document.activeElement).toBe(ler);
  });
});
