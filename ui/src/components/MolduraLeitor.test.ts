import { fireEvent, render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { createRawSnippet, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sistema } from "../lib/ambiente.svelte";
import { MetaDaSessao } from "../lib/meta.svelte";
import { atualizarPreferencias } from "../lib/preferencias.svelte";
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
    expect(nomes).toEqual([
      "Índice",
      "Dom Casmurro",
      "Buscar",
      "Uma ideia por vez",
      "Modo foco",
      "Aparência",
      "Voltar à biblioteca",
    ]);
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

  it("mostrarPainel() (paleta de comandos) abre o painel e leva o foco a ele", async () => {
    const { component } = renderizar();
    await component.mostrarPainel("aparencia");
    const aparencia = screen.getByRole("button", { name: "Aparência" });
    expect(aparencia.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("aparencia");
    // Já aberto: não fecha (não é liga/desliga), só leva o foco.
    await component.mostrarPainel("indice");
    expect(screen.getByRole("button", { name: "Índice" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.id).toBe("indice");
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

  it("mostra o progresso numa barra decorativa (o leitor de tela usa a porcentagem do rodapé)", () => {
    const { container } = renderizar({ progresso: 0.37 });
    const barra = container.querySelector<HTMLElement>(".progresso-leitura")!;
    expect(barra.getAttribute("aria-hidden")).toBe("true");
    expect(barra.querySelector<HTMLElement>("span")!.style.transform).toBe("scaleX(0.37)");
  });

  it("cada painel tem título e botão de fechar, que devolve o foco ao botão da barra", async () => {
    renderizar({ aparenciaAberta: true });
    expect(screen.getByRole("heading", { name: "Aparência" })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Fechar Aparência" }));
    const aparencia = screen.getByRole("button", { name: "Aparência" });
    expect(aparencia.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(aparencia);

    await fireEvent.click(screen.getByRole("button", { name: "Fechar Índice" }));
    const indice = screen.getByRole("button", { name: "Índice" });
    expect(indice.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(indice);
  });

  it("publica a altura do rodapé (--rodape-leitor) para os avisos ficarem acima dele; ao sair, remove", () => {
    const raiz = document.documentElement;
    const { unmount } = renderizar();
    expect(raiz.style.getPropertyValue("--rodape-leitor")).toMatch(/^\d+(\.\d+)?px$/);
    unmount();
    expect(raiz.style.getPropertyValue("--rodape-leitor")).toBe("");
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

  describe("modo foco", () => {
    const moldura = () => document.querySelector<HTMLElement>(".moldura")!;
    const botaoFoco = () => screen.getByRole("button", { name: "Modo foco" });

    it("o botão liga e desliga (aria-pressed), fecha os painéis e os devolve ao sair", async () => {
      renderizar({ aparenciaAberta: true });
      expect(botaoFoco().getAttribute("aria-pressed")).toBe("false");
      await fireEvent.click(botaoFoco());
      expect(botaoFoco().getAttribute("aria-pressed")).toBe("true");
      expect(moldura().classList.contains("foco")).toBe(true);
      expect(screen.queryByRole("navigation", { name: "Índice" })).toBeNull();
      expect(screen.queryByRole("complementary", { name: "Aparência" })).toBeNull();
      await fireEvent.click(botaoFoco());
      expect(moldura().classList.contains("foco")).toBe(false);
      expect(screen.getByRole("navigation", { name: "Índice" })).toBeTruthy();
      expect(screen.getByRole("complementary", { name: "Aparência" })).toBeTruthy();
    });

    it("anuncia ao entrar e ao sair", async () => {
      renderizar();
      await fireEvent.click(botaoFoco());
      expect(screen.getByText("Modo foco ativado. Esc para sair.")).toBeTruthy();
      await fireEvent.click(botaoFoco());
      expect(screen.getByText("Modo foco desativado.")).toBeTruthy();
    });

    it("Ctrl+Shift+F entra e sai; Esc sai", async () => {
      renderizar();
      await fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true });
      expect(moldura().classList.contains("foco")).toBe(true);
      await fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true });
      expect(moldura().classList.contains("foco")).toBe(false);
      await fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true });
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(moldura().classList.contains("foco")).toBe(false);
    });

    it("as barras continuam no teclado: o foco nelas as revela", async () => {
      renderizar();
      await fireEvent.click(botaoFoco());
      expect(moldura().classList.contains("revelada")).toBe(false);
      const voltar = screen.getByRole("button", { name: "Voltar à biblioteca" });
      voltar.focus();
      await fireEvent.focusIn(voltar);
      expect(moldura().classList.contains("revelada")).toBe(true);
      await fireEvent.focusOut(voltar, { relatedTarget: document.body });
      expect(moldura().classList.contains("revelada")).toBe(false);
    });

    it("mostrarPainel() sai do modo foco", async () => {
      const { component } = renderizar();
      await fireEvent.click(botaoFoco());
      await component.mostrarPainel("aparencia");
      expect(moldura().classList.contains("foco")).toBe(false);
      expect(document.activeElement?.id).toBe("aparencia");
    });

    it("alternarFoco() é exposto (paleta de comandos) e o estado é bindable", async () => {
      const { component } = renderizar();
      await component.alternarFoco();
      expect(moldura().classList.contains("foco")).toBe(true);
    });
  });

  describe("uma ideia por vez", () => {
    const moldura = () => document.querySelector<HTMLElement>(".moldura")!;
    const botao = () => screen.getByRole("button", { name: "Uma ideia por vez" });

    it("o botão liga e desliga (aria-pressed) e anuncia", async () => {
      renderizar();
      expect(botao().getAttribute("aria-pressed")).toBe("false");
      await fireEvent.click(botao());
      expect(botao().getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByText(/Uma ideia por vez ativada/)).toBeTruthy();
      await fireEvent.click(botao());
      expect(botao().getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByText("Uma ideia por vez desativada.")).toBeTruthy();
    });

    it("Ctrl+Shift+B liga e desliga; Esc desliga", async () => {
      renderizar({ indiceAberto: false });
      await fireEvent.keyDown(window, { key: "B", ctrlKey: true, shiftKey: true });
      expect(botao().getAttribute("aria-pressed")).toBe("true");
      await fireEvent.keyDown(window, { key: "B", ctrlKey: true, shiftKey: true });
      expect(botao().getAttribute("aria-pressed")).toBe("false");
      await fireEvent.keyDown(window, { key: "b", ctrlKey: true, shiftKey: true });
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(botao().getAttribute("aria-pressed")).toBe("false");
    });

    it("o Esc fecha antes o painel aberto e o modo foco", async () => {
      renderizar({ umaIdeia: true, indiceAberto: false, aparenciaAberta: true });
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("complementary", { name: "Aparência" })).toBeNull();
      expect(botao().getAttribute("aria-pressed")).toBe("true");
      await fireEvent.click(screen.getByRole("button", { name: "Modo foco" }));
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(moldura().classList.contains("foco")).toBe(false);
      expect(botao().getAttribute("aria-pressed")).toBe("true");
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(botao().getAttribute("aria-pressed")).toBe("false");
    });

    it("com o índice aberto ao lado (janela larga) e o foco no livro, o Esc desliga", async () => {
      renderizar({ umaIdeia: true });
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(botao().getAttribute("aria-pressed")).toBe("false");
    });

    it("com o Esc ocupado no leitor (ex.: barra de destaque), não desliga", async () => {
      renderizar({ umaIdeia: true, indiceAberto: false, escOcupado: true });
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(botao().getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("meta da sessão", () => {
    it("o rodapé mostra a meta em texto, com um botão para tirá-la", async () => {
      const meta = new MetaDaSessao();
      meta.mover({ rotulo: "página 1", pagina: 1 });
      renderizar({ meta });
      expect(screen.queryByRole("group", { name: "Meta da sessão" })).toBeNull();
      meta.definir({ tipo: "paginas", paginas: 10 });
      await tick();
      expect(screen.getByText("Meta: 0 de 10 páginas")).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: "Tirar a meta da sessão" }));
      expect(meta.meta).toBeNull();
      expect(screen.queryByRole("group", { name: "Meta da sessão" })).toBeNull();
    });

    it("ao cumprir, a pausa aparece; Voltar à biblioteca fecha o livro", async () => {
      const meta = new MetaDaSessao();
      meta.mover({ rotulo: "página 1", pagina: 1 });
      const { onFechar } = renderizar({ meta });
      meta.definir({ tipo: "paginas", paginas: 2 });
      meta.mover({ rotulo: "página 3", pagina: 3 });
      await tick();
      const pausa = screen.getByRole("dialog", { name: "Meta cumprida" });
      await fireEvent.click(within(pausa).getByRole("button", { name: "Voltar à biblioteca" }));
      expect(onFechar).toHaveBeenCalledOnce();
      expect(meta.meta).toBeNull();
    });
  });

  describe("modo foco planejado e barras só pelo teclado", () => {
    const moldura = () => document.querySelector<HTMLElement>(".moldura")!;

    it("focarPor entra no foco e sai sozinho ao cumprir, com um anúncio", async () => {
      const saidaDoFoco = new MetaDaSessao();
      saidaDoFoco.mover({ rotulo: "página 1", pagina: 1 });
      const { component } = renderizar({ saidaDoFoco });
      component.focarPor({ tipo: "paginas", paginas: 2 });
      await tick();
      expect(moldura().classList.contains("foco")).toBe(true);
      expect(screen.getByText("Modo foco por 2 páginas. Esc sai antes.")).toBeTruthy();
      saidaDoFoco.mover({ rotulo: "página 3", pagina: 3 });
      await tick();
      expect(moldura().classList.contains("foco")).toBe(false);
      expect(screen.getByText(/Modo foco encerrado como planejado/)).toBeTruthy();
      expect(saidaDoFoco.meta).toBeNull();
    });

    it("sair do foco antes desfaz a saída planejada", async () => {
      const saidaDoFoco = new MetaDaSessao();
      const { component } = renderizar({ saidaDoFoco });
      component.focarPor({ tipo: "minutos", minutos: 10 });
      await tick();
      await fireEvent.keyDown(window, { key: "Escape" });
      expect(saidaDoFoco.meta).toBeNull();
    });

    it("com barras só pelo teclado, o ponteiro na beira do cabeçalho não revela", async () => {
      atualizarPreferencias({ barrasSoPeloTeclado: true });
      const { component } = renderizar();
      component.alternarFoco();
      await tick();
      await fireEvent.pointerEnter(screen.getAllByRole("banner")[0]!);
      expect(moldura().classList.contains("revelada")).toBe(false);
      atualizarPreferencias({ barrasSoPeloTeclado: false });
    });

    it("o foco devolvido ao voltar para a janela não revela as barras; um Tab depois, sim", async () => {
      const { component } = renderizar();
      component.alternarFoco();
      await tick();
      const voltar = screen.getByRole("button", { name: "Voltar à biblioteca" });
      window.dispatchEvent(new Event("blur"));
      await fireEvent.focusIn(voltar);
      window.dispatchEvent(new Event("focus"));
      expect(moldura().classList.contains("revelada")).toBe(false);
      await new Promise((r) => setTimeout(r));
      await fireEvent.focusIn(voltar);
      expect(moldura().classList.contains("revelada")).toBe(true);
    });

    it("com barras só pelo teclado, não há faixas para o ponteiro", async () => {
      atualizarPreferencias({ barrasSoPeloTeclado: true });
      const { component } = renderizar();
      component.alternarFoco();
      await tick();
      expect(document.querySelector(".sensor")).toBeNull();
      atualizarPreferencias({ barrasSoPeloTeclado: false });
      await tick();
      expect(document.querySelectorAll(".sensor")).toHaveLength(2);
    });
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = renderizar({ aparenciaAberta: true });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
