import { fireEvent, render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { ATALHOS, porGrupo } from "../lib/atalhos";
import Atalhos from "./Atalhos.svelte";

describe("Atalhos", () => {
  it("lista os atalhos do contexto, uma tabela por grupo, na ordem dos grupos", () => {
    render(Atalhos, { contexto: "pdf", aberto: true, onFechar: () => {} });
    expect(screen.getByText("Leitura de PDF")).toBeTruthy();
    const tabelas = screen.getAllByRole("table");
    expect(tabelas.map((t) => t.querySelector("caption")?.textContent)).toEqual(
      porGrupo("pdf").map((g) => g.grupo),
    );
    // Uma linha de cabeçalho por tabela + uma por atalho.
    const linhas = tabelas.flatMap((t) => within(t).getAllByRole("row"));
    expect(linhas).toHaveLength(ATALHOS.pdf.length + tabelas.length);
    const navegacao = screen.getByRole("table", { name: "Navegação" });
    expect(within(navegacao).getByText("Buscar no documento")).toBeTruthy();
  });

  it("fica fechado quando não está aberto", () => {
    render(Atalhos, { contexto: "biblioteca", aberto: false, onFechar: () => {} });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ao fechar (Esc ou botão Fechar), avisa o componente pai", () => {
    // Quem fecha é o navegador (Esc ou <form method="dialog">), que dispara "close"; o jsdom
    // não implementa esse fechamento, então disparamos o evento diretamente.
    const onFechar = vi.fn();
    render(Atalhos, { contexto: "epub", aberto: true, onFechar });
    const dialogo = screen.getByRole("dialog", { name: "Atalhos de teclado" });
    expect(within(dialogo).getByRole("button", { name: "Fechar" })).toBeTruthy();
    dialogo.dispatchEvent(new Event("close"));
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Atalhos, { contexto: "epub", aberto: true, onFechar: () => {} });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("abre com o foco no título, dentro de um documento, para o leitor de tela ler com as setas", () => {
    render(Atalhos, { contexto: "pdf", aberto: true, onFechar: () => {} });
    const documento = document.querySelector("dialog [role=document]")!;
    const titulo = documento.querySelector("h2")!;
    expect(titulo.getAttribute("tabindex")).toBe("-1");
    expect(documento.querySelector("table")).toBeTruthy();
  });

  it("setas andam de atalho em atalho", async () => {
    render(Atalhos, { contexto: "pdf", aberto: true, onFechar: () => {} });
    const dialogo = document.querySelector("dialog")!;
    const linhas = [...dialogo.querySelectorAll<HTMLElement>("tbody tr")];
    await fireEvent.keyDown(dialogo, { key: "ArrowDown" });
    expect(document.activeElement).toBe(linhas[0]);
    const primeiro = porGrupo("pdf")[0].atalhos[0];
    expect(screen.getByRole("status", { hidden: true }).textContent).toBe(
      `${primeiro.teclas.map((c) => c.join("+")).join(" ou ")}: ${primeiro.acao}`,
    );
    expect(screen.getByRole("status", { hidden: true }).textContent).toMatch(/ ou /);
    await fireEvent.keyDown(linhas[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(linhas[1]);
    await fireEvent.keyDown(linhas[1], { key: "End" });
    expect(document.activeElement).toBe(linhas.at(-1));
  });
});
