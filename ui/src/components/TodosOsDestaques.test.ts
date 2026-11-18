import { fireEvent, render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Destaque, Livro } from "../lib/biblioteca";
import TodosOsDestaques from "./TodosOsDestaques.svelte";

function livro(id: string, titulo: string): Livro {
  return {
    id,
    formato: "epub",
    titulo,
    autores: ["Machado de Assis"],
    idioma: null,
    arquivo: "",
    capa: null,
    adicionadoEm: 0,
    abertoEm: null,
    fracao: null,
    situacao: "lendo",
    paraLerEm: null,
    lidoEm: null,
    removidoEm: null,
    favoritoEm: null,
    colecoes: [],
    destaques: 1,
  };
}

function destaque(id: number, livroId: string, trecho: string, parcial: Partial<Destaque> = {}): Destaque {
  return {
    id,
    livroId,
    local: `cfi-${id}`,
    trecho,
    cor: "amarelo",
    motivo: null,
    nota: null,
    capitulo: null,
    posicao: 0.1,
    criadoEm: 0,
    atualizadoEm: 0,
    ...parcial,
  };
}

const livros = [livro("dc", "Dom Casmurro"), livro("al", "O alienista")];
const lista = [
  destaque(1, "dc", "Capitu tinha os olhos de ressaca", { motivo: "citar", capitulo: "XXXII" }),
  destaque(2, "al", "A ciência é o meu emprego único", { motivo: "duvida", nota: "rever" }),
];

const renderizar = (extra = {}) => {
  const onAbrir = vi.fn();
  const onLimparBusca = vi.fn();
  const r = render(TodosOsDestaques, {
    livros,
    termo: "",
    onAbrir,
    onLimparBusca,
    carregar: () => Promise.resolve(lista),
    ...extra,
  });
  return { ...r, onAbrir, onLimparBusca };
};

describe("TodosOsDestaques", () => {
  it("agrupa por livro; escolher um destaque abre o livro nele", async () => {
    const { onAbrir } = renderizar();
    const dom = await screen.findByRole("region", { name: "Dom Casmurro" });
    expect(screen.getByRole("region", { name: "O alienista" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("2 destaques em 2 livros");
    await fireEvent.click(within(dom).getByRole("button", { name: /Capitu tinha/ }));
    expect(onAbrir).toHaveBeenCalledWith(livros[0], lista[0]);
  });

  it("o filtro por motivo e a busca da biblioteca", async () => {
    const { rerender } = renderizar();
    await screen.findByRole("region", { name: "Dom Casmurro" });
    await fireEvent.click(screen.getByRole("radio", { name: "Dúvida" }));
    expect(screen.queryByRole("region", { name: "Dom Casmurro" })).toBeNull();
    expect(screen.getByRole("region", { name: "O alienista" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("radio", { name: "Todos" }));
    await rerender({ termo: "ressaca" });
    expect(screen.getByRole("status").textContent).toBe("1 destaque em 1 livro");
  });

  it("busca sem resultado oferece limpar a busca", async () => {
    const { onLimparBusca } = renderizar({ termo: "nada disso" });
    await fireEvent.click(await screen.findByRole("button", { name: "Limpar busca" }));
    expect(onLimparBusca).toHaveBeenCalled();
  });

  it("sem nenhum destaque, ensina como destacar", async () => {
    renderizar({ carregar: () => Promise.resolve([]) });
    expect((await screen.findByText(/Nenhum destaque ainda/)).textContent).toContain("Ctrl+D");
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("erro ao carregar vira alerta", async () => {
    renderizar({ carregar: () => Promise.reject("erro no banco da biblioteca") });
    expect((await screen.findByRole("alert")).textContent).toContain("erro no banco da biblioteca");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    await screen.findByRole("region", { name: "Dom Casmurro" });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
