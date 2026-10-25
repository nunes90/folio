import { fireEvent, render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { createRawSnippet, tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { Destaque } from "../lib/biblioteca";
import AbasIndice from "./AbasIndice.svelte";
import BarraDestaque from "./BarraDestaque.svelte";
import EditarNota from "./EditarNota.svelte";
import ListaDestaques from "./ListaDestaques.svelte";

const semViolacoes = async (container: HTMLElement) => {
  const { violations } = await axe.run(container);
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
};

function destaque(parcial: Partial<Destaque> = {}): Destaque {
  return {
    id: 1,
    livroId: "x",
    local: "epubcfi(/6/4!/4/2,/1:0,/1:5)",
    trecho: "escondi-me atrás da porta",
    cor: "amarelo",
    nota: null,
    capitulo: "III. A denúncia",
    posicao: 0.1,
    criadoEm: 0,
    atualizadoEm: 0,
    ...parcial,
  };
}

describe("BarraDestaque", () => {
  function renderizar(extra = {}) {
    const props = {
      x: 300,
      y: 200,
      onCor: vi.fn(),
      onNota: vi.fn(),
      onCopiar: vi.fn(),
      onFechar: vi.fn(),
      ...extra,
    };
    const r = render(BarraDestaque, props);
    return { ...r, props };
  }

  it("é uma toolbar com as cores pelo nome, Nota e Copiar", () => {
    renderizar();
    const barra = screen.getByRole("toolbar", { name: "Destaque" });
    const nomes = within(barra)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());
    expect(nomes).toEqual(["Amarelo", "Verde", "Azul", "Rosa", "Nota", "Copiar"]);
  });

  it("numa seleção nova, as cores não são liga/desliga; num destaque, a atual fica marcada e há Apagar", () => {
    renderizar();
    expect(screen.getByRole("button", { name: "Verde" }).hasAttribute("aria-pressed")).toBe(false);
    document.body.innerHTML = "";
    renderizar({ corAtual: "verde", onApagar: vi.fn() });
    expect(screen.getByRole("button", { name: "Verde" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Amarelo" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Apagar" })).toBeTruthy();
  });

  it("os botões chamam as ações", async () => {
    const { props } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Azul" }));
    expect(props.onCor).toHaveBeenCalledWith("azul");
    await fireEvent.click(screen.getByRole("button", { name: "Nota" }));
    expect(props.onNota).toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    expect(props.onCopiar).toHaveBeenCalled();
  });

  it("aberta pelo teclado, foca a primeira cor; setas andam, Esc fecha", async () => {
    const { props } = renderizar({ focar: true });
    await tick();
    await tick();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Amarelo");
    await fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Verde");
    await fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement?.textContent?.trim()).toBe("Copiar");
    await fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Amarelo");
    await fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(props.onFechar).toHaveBeenCalled();
  });

  it("uma parada de Tab só", () => {
    renderizar();
    const comTab = screen.getAllByRole("button").filter((b) => b.tabIndex === 0);
    expect(comTab).toHaveLength(1);
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar({ corAtual: "rosa", onApagar: vi.fn() });
    await semViolacoes(container);
  });
});

describe("ListaDestaques", () => {
  const lista = [
    destaque(),
    destaque({ id: 2, trecho: "Tio Cosme", cor: "rosa", nota: "pensar nisso", capitulo: null }),
  ];

  it("mostra o trecho, a cor em palavras, o capítulo e a nota", () => {
    render(ListaDestaques, { destaques: lista, onIr() {}, onNota() {}, onApagar() {} });
    const itens = within(screen.getByRole("list", { name: "Destaques" })).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]!.textContent).toContain("Amarelo · III. A denúncia");
    expect(itens[1]!.textContent).toContain("Rosa");
    expect(itens[1]!.textContent).toContain("pensar nisso");
  });

  it("ir, nota, apagar e exportar chamam as ações com o destaque", async () => {
    const onIr = vi.fn();
    const onNota = vi.fn();
    const onApagar = vi.fn();
    const onExportar = vi.fn();
    render(ListaDestaques, { destaques: lista, onIr, onNota, onApagar, onExportar });
    await fireEvent.click(screen.getByRole("button", { name: /Tio Cosme.*pensar nisso/ }));
    expect(onIr).toHaveBeenCalledWith(lista[1]);
    await fireEvent.click(screen.getByRole("button", { name: "Adicionar nota: escondi-me atrás da porta" }));
    expect(onNota).toHaveBeenCalledWith(lista[0]);
    await fireEvent.click(screen.getByRole("button", { name: "Editar nota: Tio Cosme" }));
    expect(onNota).toHaveBeenCalledWith(lista[1]);
    await fireEvent.click(screen.getByRole("button", { name: "Apagar destaque: Tio Cosme" }));
    expect(onApagar).toHaveBeenCalledWith(lista[1]);
    await fireEvent.click(screen.getByRole("button", { name: "Exportar em Markdown…" }));
    expect(onExportar).toHaveBeenCalled();
  });

  it("sem destaques, explica como criar", () => {
    render(ListaDestaques, { destaques: [], onIr() {}, onNota() {}, onApagar() {} });
    expect(screen.getByText(/Nenhum destaque ainda/)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(ListaDestaques, {
      destaques: lista,
      onIr() {},
      onNota() {},
      onApagar() {},
      onExportar() {},
    });
    await semViolacoes(container);
  });
});

describe("AbasIndice", () => {
  const trecho = (html: string) => createRawSnippet(() => ({ render: () => html }));
  const renderizar = () =>
    render(AbasIndice, {
      quantidade: 3,
      conteudoIndice: trecho("<p>Capítulos</p>"),
      conteudoDestaques: trecho("<p>Os destaques</p>"),
    });

  it("duas abas; a escolhida mostra o seu painel", async () => {
    renderizar();
    const indice = screen.getByRole("tab", { name: "Índice" });
    const destaques = screen.getByRole("tab", { name: "Destaques (3)" });
    expect(indice.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Capítulos");
    await fireEvent.click(destaques);
    expect(destaques.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Os destaques");
  });

  it("setas trocam de aba e levam o foco (uma parada de Tab)", async () => {
    renderizar();
    const indice = screen.getByRole("tab", { name: "Índice" });
    expect(indice.tabIndex).toBe(0);
    indice.focus();
    await fireEvent.keyDown(indice, { key: "ArrowRight" });
    const destaques = screen.getByRole("tab", { name: "Destaques (3)" });
    expect(document.activeElement).toBe(destaques);
    expect(destaques.tabIndex).toBe(0);
    expect(indice.tabIndex).toBe(-1);
    await fireEvent.keyDown(destaques, { key: "Home" });
    expect(document.activeElement).toBe(indice);
  });

  it("mostrar() troca a aba (paleta de comandos)", async () => {
    const { component } = renderizar();
    component.mostrar("destaques");
    await tick();
    expect(screen.getByRole("tab", { name: "Destaques (3)" }).getAttribute("aria-selected")).toBe("true");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar();
    await semViolacoes(container);
  });
});

describe("EditarNota", () => {
  it("abre com a nota atual e o trecho; Salvar devolve o texto", async () => {
    const onSalvar = vi.fn();
    render(EditarNota, {
      aberto: true,
      trecho: "escondi-me atrás da porta",
      valorInicial: "antiga",
      onSalvar,
      onCancelar() {},
    });
    const campo = screen.getByRole("textbox", { name: "Nota" }) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe("antiga");
    expect(screen.getByText("escondi-me atrás da porta")).toBeTruthy();
    await fireEvent.input(campo, { target: { value: "nova" } });
    await fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith("nova");
  });

  it("Ctrl+Enter salva; fechar sem salvar cancela", async () => {
    const onSalvar = vi.fn();
    const onCancelar = vi.fn();
    render(EditarNota, { aberto: true, trecho: "t", onSalvar, onCancelar });
    const campo = screen.getByRole("textbox", { name: "Nota" });
    await fireEvent.keyDown(campo, { key: "Enter", ctrlKey: true });
    expect(onSalvar).toHaveBeenCalledWith("");
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it("Cancelar avisa o pai", async () => {
    const onCancelar = vi.fn();
    render(EditarNota, { aberto: true, trecho: "t", onSalvar() {}, onCancelar });
    await fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledOnce();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(EditarNota, {
      aberto: true,
      trecho: "t",
      onSalvar() {},
      onCancelar() {},
    });
    await semViolacoes(container);
  });
});
