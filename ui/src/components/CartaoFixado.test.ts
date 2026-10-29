import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Destaque } from "../lib/biblioteca";
import CartaoFixado from "./CartaoFixado.svelte";

const destaque: Destaque = {
  id: 1,
  livroId: "livro",
  local: "l1",
  trecho: "Escondi-me atrás da porta.",
  cor: "verde",
  motivo: "citar",
  nota: "Comparar com o capítulo 9.",
  capitulo: "III",
  posicao: 0.3,
  criadoEm: 10,
  atualizadoEm: 10,
};

function montar(d: Destaque = destaque) {
  const props = { destaque: d, onIr: vi.fn(), onNota: vi.fn(), onDesafixar: vi.fn() };
  return { props, ...render(CartaoFixado, props) };
}

describe("CartaoFixado", () => {
  it("mostra o trecho inteiro, a cor e o motivo em palavras, o capítulo e a nota", () => {
    montar();
    expect(screen.getByRole("complementary", { name: "Fixado" })).toBeTruthy();
    expect(screen.getByText("Escondi-me atrás da porta.")).toBeTruthy();
    expect(screen.getByText("Verde · Citar · III")).toBeTruthy();
    expect(screen.getByText("Comparar com o capítulo 9.")).toBeTruthy();
  });

  it("os botões: ir até lá, nota (adicionar ou editar) e desafixar", async () => {
    const { props } = montar({ ...destaque, nota: null });
    await fireEvent.click(screen.getByRole("button", { name: "Ir até lá" }));
    await fireEvent.click(screen.getByRole("button", { name: "Nota" }));
    await fireEvent.click(screen.getByRole("button", { name: "Desafixar" }));
    expect(props.onIr).toHaveBeenCalledOnce();
    expect(props.onNota).toHaveBeenCalledOnce();
    expect(props.onDesafixar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = montar();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
