import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { createRawSnippet } from "svelte";
import { describe, expect, it, vi } from "vitest";
import MolduraLeitor from "./MolduraLeitor.svelte";

const trecho = (html: string) => createRawSnippet(() => ({ render: () => html }));

function renderizar(extra = {}) {
  const onFechar = vi.fn();
  const r = render(MolduraLeitor, {
    titulo: "Dom Casmurro",
    onFechar,
    indice: trecho('<ol><li><button type="button">Capítulo 1</button></li></ol>'),
    aparencia: trecho('<div><button type="button">Claro</button></div>'),
    rodape: trecho("<span>12%</span>"),
    children: trecho("<p>Texto do livro</p>"),
    ...extra,
  });
  return { ...r, onFechar };
}

describe("MolduraLeitor", () => {
  it("cabeçalho padrão: Índice, título, ações do formato, Aparência, Voltar", () => {
    renderizar({ acoes: trecho('<button type="button">Buscar</button>') });
    const cabecalho = screen.getAllByRole("banner")[0]!;
    const nomes = Array.from(cabecalho.querySelectorAll("button, h1"), (el) =>
      el.textContent?.trim(),
    );
    expect(nomes).toEqual(["Índice", "Dom Casmurro", "Buscar", "Aparência", "Voltar à biblioteca"]);
  });

  it("botões controlam os painéis (aria-expanded e aria-controls)", async () => {
    renderizar();
    const indice = screen.getByRole("button", { name: "Índice" });
    const aparencia = screen.getByRole("button", { name: "Aparência" });
    expect(indice.getAttribute("aria-controls")).toBe("indice");
    expect(indice.getAttribute("aria-expanded")).toBe("true");
    expect(aparencia.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("navigation", { name: "Índice" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Aparência" })).toBeNull();

    await fireEvent.click(aparencia);
    expect(aparencia.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Claro" })).toBeTruthy();
  });

  it("Esc fecha o painel em que o foco está e devolve o foco ao botão", async () => {
    renderizar({ aparenciaAberta: true });
    const claro = screen.getByRole("button", { name: "Claro" });
    claro.focus();
    await fireEvent.keyDown(claro, { key: "Escape" });
    const aparencia = screen.getByRole("button", { name: "Aparência" });
    expect(aparencia.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(aparencia);
  });

  it("Esc no índice fecha o índice", async () => {
    renderizar();
    const capitulo = screen.getByRole("button", { name: "Capítulo 1" });
    capitulo.focus();
    await fireEvent.keyDown(capitulo, { key: "Escape" });
    const indice = screen.getByRole("button", { name: "Índice" });
    expect(indice.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(indice);
  });

  it("Voltar chama onFechar", async () => {
    const { onFechar } = renderizar();
    await fireEvent.click(screen.getByRole("button", { name: "Voltar à biblioteca" }));
    expect(onFechar).toHaveBeenCalledOnce();
  });

  it("anúncios vão para uma região aria-live", () => {
    renderizar({ anuncio: "Seção: Capítulo 2" });
    const regiao = screen.getByText("Seção: Capítulo 2");
    expect(regiao.getAttribute("aria-live")).toBe("polite");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar({ aparenciaAberta: true });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
