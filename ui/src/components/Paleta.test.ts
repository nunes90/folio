import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Comando } from "../lib/comandos";
import Paleta from "./Paleta.svelte";

function comandos() {
  const lista: Comando[] = [
    { id: "importar", titulo: "Importar livros…", grupo: "Biblioteca", teclas: [["Ctrl", "O"]], executar: vi.fn() },
    { id: "escuro", titulo: "Interface: escuro", grupo: "Aparência", executar: vi.fn() },
    { id: "dom", titulo: "Abrir Dom Casmurro", grupo: "Livros", dica: "Machado de Assis", executar: vi.fn() },
  ];
  return lista;
}

function abrir(lista = comandos(), onFechar = vi.fn()) {
  render(Paleta, { aberto: true, comandos: lista, onFechar });
  return { lista, onFechar, campo: screen.getByRole("combobox", { name: "Buscar comando" }) };
}

const ativa = (campo: HTMLElement) =>
  document.getElementById(campo.getAttribute("aria-activedescendant") ?? "");

describe("Paleta", () => {
  it("abre com o foco no campo e todos os comandos, o primeiro ativo", () => {
    const { campo } = abrir();
    expect(document.activeElement).toBe(campo);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(ativa(campo)?.textContent).toContain("Importar livros…");
    expect(screen.getByRole("status").textContent).toBe("3 comandos");
  });

  it("filtra ao digitar e anuncia quantos sobraram", async () => {
    const { campo } = abrir();
    await fireEvent.input(campo, { target: { value: "escuro" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("1 comando");
    await fireEvent.input(campo, { target: { value: "nada disso" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("Nenhum comando encontrado");
  });

  it("as setas mudam a opção ativa, dando a volta", async () => {
    const { campo } = abrir();
    await fireEvent.keyDown(campo, { key: "ArrowDown" });
    expect(ativa(campo)?.textContent).toContain("Interface: escuro");
    expect(ativa(campo)?.getAttribute("aria-selected")).toBe("true");
    await fireEvent.keyDown(campo, { key: "ArrowUp" });
    await fireEvent.keyDown(campo, { key: "ArrowUp" });
    expect(ativa(campo)?.textContent).toContain("Abrir Dom Casmurro");
  });

  it("Enter fecha a paleta e só então executa o comando ativo", async () => {
    const { campo, lista, onFechar } = abrir();
    await fireEvent.keyDown(campo, { key: "ArrowDown" });
    await fireEvent.keyDown(campo, { key: "Enter" });
    expect(onFechar).toHaveBeenCalledOnce();
    expect(lista[1]!.executar).toHaveBeenCalledOnce();
    expect(onFechar.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(lista[1]!.executar).mock.invocationCallOrder[0]!,
    );
    expect(lista[0]!.executar).not.toHaveBeenCalled();
  });

  it("clique numa opção executa ela", async () => {
    const { lista } = abrir();
    await fireEvent.click(screen.getByRole("option", { name: /Dom Casmurro/ }));
    expect(lista[2]!.executar).toHaveBeenCalledOnce();
  });

  it("fechar sem escolher (Esc) não executa nada", () => {
    const { lista, onFechar } = abrir();
    screen.getByRole("dialog", { name: "Comandos" }).dispatchEvent(new Event("close"));
    expect(onFechar).toHaveBeenCalledOnce();
    for (const c of lista) expect(c.executar).not.toHaveBeenCalled();
  });

  it("mostra o atalho do comando como teclas", () => {
    abrir();
    const opcao = screen.getByRole("option", { name: /Importar/ });
    expect([...opcao.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Ctrl", "O"]);
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Paleta, { aberto: true, comandos: comandos(), onFechar: () => {} });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
