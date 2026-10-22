import { fireEvent, render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Livro } from "../lib/biblioteca";
import { PADRAO } from "../lib/preferencias.svelte";
import Biblioteca from "./Biblioteca.svelte";

function livro(parcial: Partial<Livro>): Livro {
  return {
    id: "a",
    formato: "epub",
    titulo: "Dom Casmurro",
    autores: ["Machado de Assis"],
    idioma: "pt",
    arquivo: "/x/a.epub",
    capa: null,
    adicionadoEm: 0,
    abertoEm: null,
    fracao: null,
    ...parcial,
  };
}

const livros = [
  livro({ id: "a", fracao: 0.37 }),
  livro({ id: "b", titulo: "Memórias Póstumas", fracao: null }),
];

const semAcao = { onAbrir: () => {}, onImportar: () => {} };

describe("Biblioteca", () => {
  it("lista os livros com título, autor e progresso no nome do botão", () => {
    render(Biblioteca, { livros, ...semAcao });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Dom Casmurro.*Machado de Assis.*37% lido/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Memórias Póstumas.*Não iniciado/ })).toBeTruthy();
  });

  it("livro recém-aberto não aparece como 0%", () => {
    render(Biblioteca, { livros: [livro({ fracao: 0.0013 })], ...semAcao });
    expect(screen.getByText("menos de 1% lido")).toBeTruthy();
  });

  it("abre o livro clicado", async () => {
    const onAbrir = vi.fn();
    render(Biblioteca, { livros, onAbrir, onImportar: () => {} });
    await fireEvent.click(screen.getByRole("button", { name: /Memórias Póstumas/ }));
    expect(onAbrir).toHaveBeenCalledWith(livros[1]);
  });

  it("mostra estado vazio e o botão de importar", async () => {
    const onImportar = vi.fn();
    render(Biblioteca, { livros: [], onAbrir: () => {}, onImportar });
    expect(screen.getByText(/biblioteca está vazia/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Importar livros…" }));
    expect(onImportar).toHaveBeenCalled();
  });

  it("desabilita o botão enquanto importa e anuncia o aviso", () => {
    render(Biblioteca, { livros, importando: true, aviso: "2 livros importados", ...semAcao });
    expect(screen.getByRole("button", { name: "Importando…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("2 livros importados");
  });

  it("com preferências, oferece o painel de tema", async () => {
    render(Biblioteca, {
      livros,
      ...semAcao,
      preferencias: PADRAO,
      onMudarPreferencias: () => {},
      temaDoSistema: "claro",
    });
    const botao = screen.getByRole("button", { name: "Aparência" });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("radio", { name: "Sépia" })).toBeTruthy();
  });

  describe("teclado (roving tabindex)", () => {
    const tres = [livro({ id: "a" }), livro({ id: "b", titulo: "B" }), livro({ id: "c", titulo: "C" })];
    const botoes = () =>
      screen.getAllByRole("listitem").map((li) => within(li).getByRole("button"));

    it("só um livro fica na ordem do Tab", () => {
      render(Biblioteca, { livros: tres, ...semAcao });
      expect(botoes().map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    });

    it("setas, Home e End movem o foco entre os livros", async () => {
      render(Biblioteca, { livros: tres, ...semAcao });
      const [a, b, c] = botoes();
      a!.focus();
      await fireEvent.keyDown(a!, { key: "ArrowRight" });
      expect(document.activeElement).toBe(b);
      await fireEvent.keyDown(b!, { key: "End" });
      expect(document.activeElement).toBe(c);
      await fireEvent.keyDown(c!, { key: "ArrowRight" });
      expect(document.activeElement).toBe(c);
      await fireEvent.keyDown(c!, { key: "Home" });
      expect(document.activeElement).toBe(a);
      expect(botoes().map((x) => x.tabIndex)).toEqual([0, -1, -1]);
    });

    it("devolve o foco ao livro que estava aberto", () => {
      render(Biblioteca, { livros: tres, ...semAcao, focarLivro: "b" });
      expect(document.activeElement).toBe(botoes()[1]);
      expect(botoes()[1]!.tabIndex).toBe(0);
    });
  });

  describe("remover", () => {
    it("Delete no livro focado pede a remoção dele", async () => {
      const onRemover = vi.fn();
      render(Biblioteca, { livros, ...semAcao, onRemover });
      const segundo = screen.getByRole("button", { name: /^Memórias Póstumas/ });
      expect(segundo.getAttribute("aria-keyshortcuts")).toBe("Delete");
      segundo.focus();
      await fireEvent.keyDown(segundo, { key: "Delete" });
      expect(onRemover).toHaveBeenCalledWith(livros[1]);
    });

    it("o botão × de cada capa pede a remoção, fora da ordem do Tab", async () => {
      const onRemover = vi.fn();
      render(Biblioteca, { livros, ...semAcao, onRemover });
      const remover = screen.getByRole("button", { name: "Remover Dom Casmurro" });
      expect(remover.tabIndex).toBe(-1);
      await fireEvent.click(remover);
      expect(onRemover).toHaveBeenCalledWith(livros[0]);
    });

    it("sem onRemover, não há botão × nem atalho", () => {
      render(Biblioteca, { livros, ...semAcao });
      expect(screen.queryByRole("button", { name: /^Remover/ })).toBeNull();
    });

    it("não tem violações de acessibilidade (axe)", async () => {
      const { container } = render(Biblioteca, { livros, ...semAcao, onRemover: () => {} });
      const { violations } = await axe.run(container);
      expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Biblioteca, { livros, aviso: "ok", ...semAcao });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
