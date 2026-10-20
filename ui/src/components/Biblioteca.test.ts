import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Livro } from "../lib/biblioteca";
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

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Biblioteca, { livros, aviso: "ok", ...semAcao });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
