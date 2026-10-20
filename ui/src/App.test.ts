import { render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import App from "./App.svelte";

describe("App", () => {
  it("mostra o título do app", () => {
    render(App);
    expect(screen.getByRole("heading", { level: 1, name: "Leitor" })).toBeTruthy();
  });

  it("oferece um botão para abrir livro", () => {
    render(App);
    expect(screen.getByRole("button", { name: "Abrir livro…" })).toBeTruthy();
  });

  it("tem uma região main", () => {
    render(App);
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(App);
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
