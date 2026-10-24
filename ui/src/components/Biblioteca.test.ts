import { fireEvent, render, screen, within } from "@testing-library/svelte";
import axe from "axe-core";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sistema } from "../lib/ambiente.svelte";
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
    situacao: "nao-iniciado",
    paraLerEm: null,
    lidoEm: null,
    removidoEm: null,
    favoritoEm: null,
    colecoes: [],
    ...parcial,
  };
}

const livros = [
  livro({ id: "a", fracao: 0.37, situacao: "lendo" }),
  livro({ id: "b", titulo: "Memórias Póstumas", fracao: null }),
];

const semAcao = { onAbrir: () => {}, onImportar: () => {} };

/** Itens da grade de livros (a barra lateral também tem uma lista). A grade vazia fica
 *  `hidden` e sai da árvore de acessibilidade: aí não há itens. */
function itensDaGrade(): HTMLElement[] {
  const grade = screen.queryByRole("list", { name: "Livros" });
  return grade ? within(grade).queryAllByRole("listitem") : [];
}

describe("Biblioteca", () => {
  it("lista os livros com título, autor e progresso no nome do botão", () => {
    render(Biblioteca, { livros, ...semAcao });
    expect(itensDaGrade()).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Dom Casmurro.*Machado de Assis.*37% lido/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Memórias Póstumas.*Não iniciado/ })).toBeTruthy();
  });

  it("livro recém-aberto não aparece como 0%", () => {
    render(Biblioteca, { livros: [livro({ fracao: 0.0013, situacao: "lendo" })], ...semAcao });
    expect(screen.getByText("menos de 1% lido")).toBeTruthy();
  });

  it("livro concluído (situação vinda do core) aparece como Lido", () => {
    render(Biblioteca, { livros: [livro({ fracao: 0.997, situacao: "concluido" })], ...semAcao });
    expect(screen.getByRole("button", { name: /Dom Casmurro.*EPUB Lido$/ })).toBeTruthy();
  });

  it("mostra o formato no card e o progresso numa barra decorativa sobre a capa", () => {
    const { container } = render(Biblioteca, {
      livros: [
        livro({ id: "a", fracao: 0.37, situacao: "lendo" }),
        livro({ id: "b", formato: "pdf", fracao: null }),
      ],
      ...semAcao,
    });
    expect(screen.getByRole("button", { name: /Dom Casmurro.*EPUB.*37% lido/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /PDF.*Não iniciado/ })).toBeTruthy();
    // Só o livro iniciado tem barra; ela é decorativa (o texto "37% lido" já informa).
    const barras = container.querySelectorAll<HTMLElement>(".progresso-capa");
    expect(barras).toHaveLength(1);
    expect(barras[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(barras[0]!.querySelector<HTMLElement>("span")!.style.transform).toBe("scaleX(0.37)");
  });

  describe("busca e filtros", () => {
    const estante = [
      livro({ id: "a", titulo: "Dom Casmurro", fracao: 0.37, situacao: "lendo" }),
      livro({ id: "b", titulo: "Memórias Póstumas", fracao: 1, situacao: "concluido" }),
      livro({ id: "c", titulo: "O Cortiço", autores: ["Aluísio Azevedo"], paraLerEm: 5 }),
    ];
    afterEach(() => {
      sistema.estreita = false;
    });
    const naBarra = (nome: RegExp) =>
      within(screen.getByRole("navigation", { name: "Estantes" })).getByRole("button", {
        name: nome,
      });
    // Itens da grade acessíveis (a lista vazia fica `hidden` e sai da árvore de acessibilidade).
    const visiveis = () => itensDaGrade().length;

    it("a busca filtra por título ou autor e anuncia quantos livros sobraram", async () => {
      render(Biblioteca, { livros: estante, ...semAcao });
      const busca = screen.getByRole("searchbox", { name: "Buscar na biblioteca" });
      await fireEvent.input(busca, { target: { value: "aluisio" } });
      expect(visiveis()).toBe(1);
      expect(screen.getByText("1 livro encontrado")).toBeTruthy();
    });

    it("barra lateral: estantes com contagem, a atual com aria-current", async () => {
      render(Biblioteca, { livros: estante, ...semAcao });
      const todos = naBarra(/^Todos 3$/);
      const lidos = naBarra(/^Lidos 1$/);
      expect(naBarra(/^Lendo 1$/)).toBeTruthy();
      expect(naBarra(/^Para ler 1$/)).toBeTruthy();
      expect(todos.getAttribute("aria-current")).toBe("page");
      await fireEvent.click(lidos);
      expect(lidos.getAttribute("aria-current")).toBe("page");
      expect(todos.hasAttribute("aria-current")).toBe(false);
      expect(visiveis()).toBe(1);
      expect(screen.getByRole("button", { name: /Memórias Póstumas/ })).toBeTruthy();
      await fireEvent.click(naBarra(/^Para ler/));
      expect(screen.getByRole("button", { name: /O Cortiço/ })).toBeTruthy();
      expect(visiveis()).toBe(1);
    });

    it("setas ↑↓, Home e End andam entre as estantes (uma só parada de Tab)", async () => {
      render(Biblioteca, { livros: estante, ...semAcao });
      const todos = naBarra(/^Todos/);
      expect(todos.getAttribute("tabindex")).toBe("0");
      expect(naBarra(/^Lendo/).getAttribute("tabindex")).toBe("-1");
      todos.focus();
      await fireEvent.keyDown(todos, { key: "ArrowDown" });
      expect(document.activeElement).toBe(naBarra(/^Favoritos/));
      await fireEvent.keyDown(document.activeElement!, { key: "End" });
      expect(document.activeElement).toBe(naBarra(/^Lixeira/));
      await fireEvent.keyDown(document.activeElement!, { key: "Home" });
      expect(document.activeElement).toBe(todos);
    });

    it("janela estreita: as estantes ficam num painel aberto pelo botão Estantes", async () => {
      sistema.estreita = true;
      render(Biblioteca, { livros: estante, ...semAcao });
      const botao = screen.getByRole("button", { name: "Estantes" });
      expect(botao.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("navigation", { name: "Estantes" })).toBeNull();
      await fireEvent.click(botao);
      expect(botao.getAttribute("aria-expanded")).toBe("true");
      // Escolher uma estante fecha o painel e devolve o foco ao botão.
      await fireEvent.click(naBarra(/^Lendo/));
      expect(botao.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(botao);
      expect(visiveis()).toBe(1);
    });

    it("sem resultado, explica e oferece limpar a busca", async () => {
      render(Biblioteca, { livros: estante, ...semAcao });
      const busca = screen.getByRole("searchbox", { name: "Buscar na biblioteca" });
      await fireEvent.input(busca, { target: { value: "tolstói" } });
      expect(visiveis()).toBe(0);
      expect(screen.getByText(/Nenhum livro encontrado/)).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
      expect(visiveis()).toBe(3);
      expect(document.activeElement).toBe(busca);
    });

    it("as setas andam só entre os livros visíveis", async () => {
      render(Biblioteca, { livros: estante, ...semAcao });
      await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "o" } });
      // "o" aparece em Dom Casmurro, Memórias Póstumas e O Cortiço; com "cortico", só um.
      await fireEvent.input(screen.getByRole("searchbox"), { target: { value: "cortico" } });
      const unico = screen.getByRole("button", { name: /O Cortiço/ });
      expect(unico.getAttribute("tabindex")).toBe("0");
    });

    it("Ctrl+F leva à busca", async () => {
      render(Biblioteca, { livros: estante, ...semAcao });
      await fireEvent.keyDown(window, { key: "f", ctrlKey: true });
      expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    });

    it("biblioteca vazia não mostra busca nem filtros", () => {
      render(Biblioteca, { livros: [], ...semAcao });
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(screen.queryByRole("navigation", { name: "Estantes" })).toBeNull();
    });
  });

  it("Ctrl+O importa (o mesmo que o botão), exceto durante uma importação", async () => {
    const onImportar = vi.fn();
    const { rerender } = render(Biblioteca, { livros, onAbrir: () => {}, onImportar });
    await fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    expect(onImportar).toHaveBeenCalledOnce();
    rerender({ livros, onAbrir: () => {}, onImportar, importando: true });
    await fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    expect(onImportar).toHaveBeenCalledOnce();
  });

  it("arrastando arquivos, mostra onde soltar (inclusive com a biblioteca vazia)", () => {
    const { rerender } = render(Biblioteca, { livros, arrastando: false, ...semAcao });
    expect(screen.queryByText("Solte para importar")).toBeNull();
    rerender({ livros: [], arrastando: true, ...semAcao });
    expect(screen.getByText("Solte para importar")).toBeTruthy();
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

  it("estado vazio: um só botão de importar, no centro (o do cabeçalho some)", () => {
    const { container } = render(Biblioteca, { livros: [], ...semAcao });
    const botoes = screen.getAllByRole("button", { name: /Importar/ });
    expect(botoes).toHaveLength(1);
    expect(container.querySelector(".vazia")!.contains(botoes[0]!)).toBe(true);
    expect(screen.getByRole("heading", { name: "Sua biblioteca está vazia" })).toBeTruthy();
  });

  it("desabilita o botão enquanto importa", () => {
    render(Biblioteca, { livros, importando: true, ...semAcao });
    expect(screen.getByRole("button", { name: "Importando…" }).hasAttribute("disabled")).toBe(true);
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
      itensDaGrade().map((li) => within(li).getByRole("button"));

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

  describe("ações do livro e lixeira", () => {
    const naLixeira = livro({ id: "z", titulo: "Quincas Borba", removidoEm: 9 });
    const props = (extra = {}) => ({
      livros,
      lixeira: [naLixeira],
      ...semAcao,
      onAbrir: vi.fn(),
      onAcao: vi.fn(),
      onEsvaziar: vi.fn(),
      ...extra,
    });
    const naBarra = (nome: RegExp) =>
      within(screen.getByRole("navigation", { name: "Estantes" })).getByRole("button", {
        name: nome,
      });

    it("Delete manda o livro focado para a lixeira (sem confirmar: dá para desfazer)", async () => {
      const p = props();
      render(Biblioteca, p);
      const segundo = screen.getByRole("button", { name: /^Memórias Póstumas/ });
      expect(segundo.getAttribute("aria-keyshortcuts")).toContain("Delete");
      segundo.focus();
      await fireEvent.keyDown(segundo, { key: "Delete" });
      expect(p.onAcao).toHaveBeenCalledWith(livros[1], "lixeira");
    });

    it("Shift+F10 (ou a tecla Menu) abre o menu do livro focado; Esc devolve o foco ao livro", async () => {
      render(Biblioteca, props());
      const primeiro = screen.getByRole("button", { name: /^Dom Casmurro/ });
      primeiro.focus();
      await fireEvent.keyDown(primeiro, { key: "F10", shiftKey: true });
      await tick();
      const menu = screen.getByRole("menu", { name: "Ações para Dom Casmurro" });
      expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[0]);
      await fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(primeiro);
    });

    it("o botão ⋯ abre o menu; escolher uma ação a repassa com o livro", async () => {
      const p = props();
      render(Biblioteca, p);
      await fireEvent.click(screen.getByRole("button", { name: "Mais ações para Dom Casmurro" }));
      await fireEvent.click(screen.getByRole("menuitem", { name: "Adicionar a Para ler" }));
      expect(p.onAcao).toHaveBeenCalledWith(livros[0], "para-ler");
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("a Lixeira fica na barra; nela, clicar no livro abre as ações (não abre o livro)", async () => {
      const p = props();
      render(Biblioteca, p);
      await fireEvent.click(naBarra(/^Lixeira 1$/));
      expect(itensDaGrade()).toHaveLength(1);
      await fireEvent.click(screen.getByRole("button", { name: /^Quincas Borba/ }));
      expect(p.onAbrir).not.toHaveBeenCalled();
      expect(screen.getAllByRole("menuitem").map((i) => i.textContent?.trim())).toEqual([
        "Restaurar",
        "Apagar de vez…",
      ]);
    });

    it("na lixeira, Delete pede para apagar de vez e há o botão de esvaziar", async () => {
      const p = props();
      render(Biblioteca, p);
      await fireEvent.click(naBarra(/^Lixeira/));
      const livroNaLixeira = screen.getByRole("button", { name: /^Quincas Borba/ });
      livroNaLixeira.focus();
      await fireEvent.keyDown(livroNaLixeira, { key: "Delete" });
      expect(p.onAcao).toHaveBeenCalledWith(naLixeira, "apagar");
      await fireEvent.click(screen.getByRole("button", { name: "Esvaziar lixeira…" }));
      expect(p.onEsvaziar).toHaveBeenCalledOnce();
    });

    it("só com livros na lixeira, a barra continua lá (para poder restaurá-los)", () => {
      render(Biblioteca, props({ livros: [] }));
      expect(naBarra(/^Lixeira 1$/)).toBeTruthy();
      expect(screen.queryByRole("heading", { name: "Sua biblioteca está vazia" })).toBeNull();
    });

    it("ícones no card: Favorito, Para ler e Lido, botões liga/desliga que repassam a ação", async () => {
      const p = props({ livros: [livro({ id: "a", favoritoEm: 4 })] });
      render(Biblioteca, p);
      const card = itensDaGrade()[0]!;
      const favorito = within(card).getByRole("button", { name: "Favorito" });
      const paraLer = within(card).getByRole("button", { name: "Para ler" });
      const lido = within(card).getByRole("button", { name: "Lido" });
      expect(favorito.getAttribute("aria-pressed")).toBe("true");
      expect(paraLer.getAttribute("aria-pressed")).toBe("false");
      expect(lido.getAttribute("aria-pressed")).toBe("false");
      // Fora da ordem do Tab: no teclado, as mesmas ações estão no menu (Shift+F10).
      expect(favorito.tabIndex).toBe(-1);
      await fireEvent.click(paraLer);
      expect(p.onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "para-ler");
      await fireEvent.click(favorito);
      expect(p.onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "favorito");
    });

    it("lido pelo progresso: o ✓ aparece marcado e desativado (não há o que desmarcar)", () => {
      render(Biblioteca, props({ livros: [livro({ fracao: 1, situacao: "concluido" })] }));
      const lido = within(itensDaGrade()[0]!).getByRole("button", { name: "Lido" });
      expect(lido.getAttribute("aria-pressed")).toBe("true");
      expect(lido.getAttribute("aria-disabled")).toBe("true");
    });

    it("na lixeira, o card não tem os ícones (só as ações da lixeira)", async () => {
      render(Biblioteca, props());
      await fireEvent.click(naBarra(/^Lixeira/));
      expect(within(itensDaGrade()[0]!).queryByRole("button", { name: "Favorito" })).toBeNull();
    });

    it("a estante Favoritos fica entre Todos e Lendo", () => {
      render(Biblioteca, props({ livros: [livro({ id: "a", favoritoEm: 4 }), livros[1]] }));
      const nomes = within(screen.getByRole("navigation", { name: "Estantes" }))
        .getAllByRole("button")
        .map((b) => b.textContent?.replace(/\s+/g, " ").trim());
      expect(nomes.slice(0, 3)).toEqual(["Todos 2", "Favoritos 1", "Lendo 0"]);
    });

    describe("coleções", () => {
      const colecoes = [
        { id: 1, nome: "Clássicos", quantidade: 1 },
        { id: 2, nome: "Trabalho", quantidade: 0 },
      ];
      const comColecoes = () => ({
        ...props(),
        livros: [livro({ id: "a", colecoes: [1] }), livros[1]!],
        colecoes,
        onNovaColecao: vi.fn(),
        onRenomearColecao: vi.fn(),
        onApagarColecao: vi.fn(),
        onTirarDaColecao: vi.fn(),
      });

      it("aparecem na barra com contagem, entre as vistas e a lixeira; Nova coleção pede o nome", async () => {
        const p = comColecoes();
        render(Biblioteca, p);
        const barra = within(screen.getByRole("navigation", { name: "Estantes" }));
        const nomes = barra
          .getAllByRole("button")
          .map((b) => b.textContent?.replace(/\s+/g, " ").trim());
        expect(nomes.slice(-4)).toEqual(["Clássicos 1", "Trabalho 0", "Nova coleção", "Lixeira 1"]);
        await fireEvent.click(barra.getByRole("button", { name: "Nova coleção" }));
        expect(p.onNovaColecao).toHaveBeenCalledOnce();
      });

      it("a vista de uma coleção mostra os livros dela, com Renomear e Apagar", async () => {
        const p = comColecoes();
        render(Biblioteca, p);
        await fireEvent.click(naBarra(/^Clássicos/));
        expect(itensDaGrade()).toHaveLength(1);
        expect(screen.getByRole("heading", { name: "Clássicos" })).toBeTruthy();
        await fireEvent.click(screen.getByRole("button", { name: "Renomear…" }));
        expect(p.onRenomearColecao).toHaveBeenCalledWith(colecoes[0]);
        await fireEvent.click(screen.getByRole("button", { name: "Apagar coleção…" }));
        expect(p.onApagarColecao).toHaveBeenCalledWith(colecoes[0]);
      });

      it("no menu do livro: Adicionar à coleção… e, dentro de uma coleção, Tirar desta coleção", async () => {
        const p = comColecoes();
        render(Biblioteca, p);
        await fireEvent.click(naBarra(/^Clássicos/));
        await fireEvent.click(screen.getByRole("button", { name: "Mais ações para Dom Casmurro" }));
        await fireEvent.click(screen.getByRole("menuitem", { name: "Tirar desta coleção" }));
        expect(p.onTirarDaColecao).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), 1);
        await fireEvent.click(screen.getByRole("button", { name: "Mais ações para Dom Casmurro" }));
        await fireEvent.click(screen.getByRole("menuitem", { name: "Adicionar à coleção…" }));
        expect(p.onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "colecoes");
      });

      it("ícone de coleções no card: abre o diálogo e mostra se o livro está em alguma", async () => {
        const p = comColecoes();
        render(Biblioteca, p);
        const [comColecao, semColecao] = itensDaGrade();
        const botao = within(comColecao!).getByRole("button", { name: "Coleções" });
        expect(botao.getAttribute("aria-haspopup")).toBe("dialog");
        expect(botao.getAttribute("title")).toBe("Coleções (1)");
        expect(botao.classList.contains("marcada")).toBe(true);
        expect(botao.tabIndex).toBe(-1);
        expect(
          within(semColecao!).getByRole("button", { name: "Coleções" }).classList.contains("marcada"),
        ).toBe(false);
        await fireEvent.click(botao);
        expect(p.onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "colecoes");
      });

      it("se a coleção aberta deixar de existir, volta para Todos", async () => {
        const p = comColecoes();
        const { rerender } = render(Biblioteca, p);
        await fireEvent.click(naBarra(/^Trabalho/));
        await rerender({ ...p, colecoes: [colecoes[0]] });
        expect(naBarra(/^Todos/).getAttribute("aria-current")).toBe("page");
      });
    });

    it("sem onAcao, não há menu nem atalhos de ação", () => {
      render(Biblioteca, { livros, ...semAcao });
      expect(screen.queryByRole("button", { name: /^Mais ações/ })).toBeNull();
    });

    it("cada capa é marcada com o id do livro (origem da transição para o leitor)", () => {
    render(Biblioteca, { livros, ...semAcao });
    const capas = document.querySelectorAll<HTMLElement>(".capa-substituta");
    expect(capas[0]!.getAttribute("data-capa-livro")).toBe("a");
    expect(capas[1]!.getAttribute("data-capa-livro")).toBe("b");
  });

  it("não tem violações de acessibilidade (axe)", async () => {
      const { container } = render(Biblioteca, props());
      const { violations } = await axe.run(container);
      expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    const { container } = render(Biblioteca, { livros, ...semAcao });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
