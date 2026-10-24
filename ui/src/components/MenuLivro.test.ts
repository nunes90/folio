import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { Livro } from "../lib/biblioteca";
import MenuLivro from "./MenuLivro.svelte";

function livro(parcial: Partial<Livro> = {}): Livro {
  return {
    id: "a",
    formato: "epub",
    titulo: "Dom Casmurro",
    autores: [],
    idioma: null,
    arquivo: "",
    capa: null,
    adicionadoEm: 0,
    abertoEm: null,
    fracao: null,
    situacao: "nao-iniciado",
    paraLerEm: null,
    lidoEm: null,
    removidoEm: null,
    favoritoEm: null,
    colecoes: [],
    destaques: 0,
    ...parcial,
  };
}

function renderizar(parcial: Partial<Livro> = {}, aberto = true) {
  const onAcao = vi.fn();
  const onFechar = vi.fn();
  const r = render(MenuLivro, { livro: livro(parcial), aberto, onAcao, onFechar, onAlternar: () => {} });
  return { ...r, onAcao, onFechar };
}
const itens = () => screen.getAllByRole("menuitem").map((i) => i.textContent?.trim());

describe("MenuLivro", () => {
  it("botão ⋯ diz de qual livro são as ações e se o menu está aberto", () => {
    renderizar({}, false);
    const botao = screen.getByRole("button", { name: "Mais ações para Dom Casmurro" });
    expect(botao.getAttribute("aria-haspopup")).toBe("menu");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("na estante: para ler, marcar como lido e mover para a lixeira", () => {
    renderizar();
    expect(itens()).toEqual([
      "Favoritar",
      "Adicionar a Para ler",
      "Marcar como lido",
      "Adicionar à coleção…",
      "Mover para a lixeira",
    ]);
  });

  it("os textos acompanham o estado do livro", () => {
    renderizar({ paraLerEm: 1, lidoEm: 2, situacao: "concluido", favoritoEm: 3 });
    expect(itens()).toEqual([
      "Tirar dos favoritos",
      "Tirar de Para ler",
      "Desmarcar como lido",
      "Adicionar à coleção…",
      "Mover para a lixeira",
    ]);
  });

  it("lido pelo progresso (sem marca manual): não oferece marcar nem desmarcar", () => {
    renderizar({ fracao: 1, situacao: "concluido" });
    expect(itens()).toEqual([
      "Favoritar",
      "Adicionar a Para ler",
      "Adicionar à coleção…",
      "Mover para a lixeira",
    ]);
  });

  it("dentro de uma coleção, também dá para tirar o livro dela", () => {
    const onAcao = vi.fn();
    render(MenuLivro, {
      livro: livro(),
      aberto: true,
      naColecao: true,
      onAcao,
      onFechar: () => {},
      onAlternar: () => {},
    });
    expect(itens()).toContain("Tirar desta coleção");
  });

  it("na lixeira: restaurar e apagar de vez", () => {
    renderizar({ removidoEm: 5 });
    expect(itens()).toEqual(["Restaurar", "Apagar de vez…"]);
  });

  it("ao abrir, o foco vai ao primeiro item; setas andam; escolher chama a ação e fecha", async () => {
    const { onAcao, onFechar } = renderizar();
    await tick();
    const [primeiro, segundo] = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(primeiro);
    await fireEvent.keyDown(primeiro!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(segundo);
    await fireEvent.keyDown(segundo!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(primeiro);
    await fireEvent.keyDown(primeiro!, { key: "End" });
    await fireEvent.click(document.activeElement!);
    expect(onAcao).toHaveBeenCalledWith("lixeira");
    expect(onFechar).toHaveBeenCalled();
  });

  it("Esc fecha o menu", async () => {
    const { onFechar } = renderizar();
    await tick();
    await fireEvent.keyDown(screen.getAllByRole("menuitem")[0]!, { key: "Escape" });
    expect(onFechar).toHaveBeenCalled();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    await tick();
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
