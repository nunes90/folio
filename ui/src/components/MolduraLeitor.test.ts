import { fireEvent, render, screen } from "@testing-library/svelte";
import axe from "axe-core";
import { createRawSnippet, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sistema } from "../lib/ambiente.svelte";
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

  it("virarPagina navega e depois anima a área do livro com o estilo das preferências", async () => {
    const { component } = renderizar();
    const area = document.querySelector<HTMLElement>("[data-area-livro]")!;
    const animar = vi.spyOn(area, "animate");
    const ordem: string[] = [];
    animar.mockImplementation(() => {
      ordem.push("animou");
      return { cancel() {} } as unknown as Animation;
    });
    await component.virarPagina("direita", () => ordem.push("navegou"));
    expect(ordem).toEqual(["navegou", "animou"]);
    // Padrão: esmaecer.
    expect(animar.mock.calls[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  describe("janela estreita", () => {
    afterEach(() => {
      sistema.estreita = false;
    });

    it("o índice começa fechado e os painéis cobrem o livro (o livro não muda de tamanho)", async () => {
      sistema.estreita = true;
      const { container } = renderizar();
      expect(container.querySelector(".moldura")!.classList.contains("estreita")).toBe(true);
      const indice = screen.getByRole("button", { name: "Índice" });
      expect(indice.getAttribute("aria-expanded")).toBe("false");
      await fireEvent.click(indice);
      expect(indice.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector(".veu")).toBeTruthy();
    });

    it("os botões do cabeçalho têm ícone e mantêm o nome (o texto fica para o leitor de tela)", () => {
      sistema.estreita = true;
      renderizar();
      for (const nome of ["Índice", "Aparência", "Voltar à biblioteca"]) {
        const botao = screen.getByRole("button", { name: nome });
        expect(botao.querySelector("svg")).toBeTruthy();
        expect(botao.querySelector(".rotulo")?.textContent).toBe(nome);
      }
    });

    it("abrir um painel fecha o outro", async () => {
      sistema.estreita = true;
      renderizar();
      const indice = screen.getByRole("button", { name: "Índice" });
      const aparencia = screen.getByRole("button", { name: "Aparência" });
      await fireEvent.click(indice);
      await fireEvent.click(aparencia);
      expect(indice.getAttribute("aria-expanded")).toBe("false");
      expect(aparencia.getAttribute("aria-expanded")).toBe("true");
      await fireEvent.click(indice);
      expect(aparencia.getAttribute("aria-expanded")).toBe("false");
    });

    it("o foco vai para o painel aberto; clicar no véu fecha e devolve o foco ao botão", async () => {
      sistema.estreita = true;
      const { container } = renderizar();
      const aparencia = screen.getByRole("button", { name: "Aparência" });
      await fireEvent.click(aparencia);
      await tick();
      expect(document.activeElement).toBe(document.getElementById("aparencia"));
      await fireEvent.click(container.querySelector(".veu")!);
      expect(aparencia.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(aparencia);
    });

    it("Esc fecha o painel que cobre o livro, esteja o foco onde estiver", async () => {
      sistema.estreita = true;
      renderizar();
      const indice = screen.getByRole("button", { name: "Índice" });
      await fireEvent.click(indice);
      const voltar = screen.getByRole("button", { name: "Voltar à biblioteca" });
      voltar.focus();
      await fireEvent.keyDown(voltar, { key: "Escape" });
      expect(indice.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(indice);
    });

    it("ao estreitar a janela com os dois painéis abertos, fica só o último aberto", async () => {
      renderizar({ aparenciaAberta: true });
      sistema.estreita = true;
      await tick();
      expect(screen.getByRole("button", { name: "Índice" }).getAttribute("aria-expanded")).toBe(
        "false",
      );
      expect(screen.getByRole("button", { name: "Aparência" }).getAttribute("aria-expanded")).toBe(
        "true",
      );
    });

    it("janela larga: os dois painéis podem ficar abertos lado a lado, sem véu", async () => {
      const { container } = renderizar();
      await fireEvent.click(screen.getByRole("button", { name: "Aparência" }));
      expect(screen.getByRole("button", { name: "Índice" }).getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector(".veu")).toBeNull();
    });
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar({ aparenciaAberta: true });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
