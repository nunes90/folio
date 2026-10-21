import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import App from "./App.svelte";

// Fora do Tauri não há biblioteca: o App mostra a biblioteca vazia.
describe("App", () => {
  it("abre na biblioteca", () => {
    render(App);
    expect(screen.getByRole("heading", { level: 1, name: "Biblioteca" })).toBeTruthy();
  });

  it("oferece um botão para importar livros", () => {
    render(App);
    expect(screen.getByRole("button", { name: "Importar livros…" })).toBeTruthy();
  });

  it("tem uma região main", () => {
    render(App);
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("F1 abre os atalhos da biblioteca", async () => {
    render(App);
    expect(screen.queryByRole("dialog")).toBeNull();
    await fireEvent.keyDown(window, { key: "F1" });
    expect(screen.getByRole("dialog", { name: "Atalhos de teclado" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Biblioteca" })).toBeTruthy();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(App);
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
