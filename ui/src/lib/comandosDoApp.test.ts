import { describe, expect, it, vi } from "vitest";
import type { Colecao, Livro } from "./biblioteca";
import { comandosDoApp, type AcoesDoApp, type EstadoDoApp } from "./comandosDoApp";

const livro = (id: string, titulo: string, autores: string[] = []) =>
  ({ id, titulo, autores, formato: "epub" }) as unknown as Livro;

function estado(mudancas: Partial<EstadoDoApp> = {}): EstadoDoApp {
  return {
    lendo: false,
    importando: false,
    livros: [],
    colecoes: [],
    lixeiraComLivros: false,
    preferencias: { tema: "sistema", movimento: "sistema" },
    doLeitor: [],
    ...mudancas,
  };
}

function acoes(): AcoesDoApp {
  return {
    importar: vi.fn(),
    buscarNaBiblioteca: vi.fn(),
    mostrar: vi.fn(),
    novaColecao: vi.fn(),
    esvaziarLixeira: vi.fn(),
    voltarABiblioteca: vi.fn(),
    mudarPreferencias: vi.fn(),
    mostrarAtalhos: vi.fn(),
    mostrarSobre: vi.fn(),
    abrir: vi.fn(),
  };
}

const ids = (e: EstadoDoApp) => comandosDoApp(e, acoes()).map((c) => c.id);

describe("comandosDoApp", () => {
  it("na biblioteca: importar, buscar, estantes, coleções e os livros por último", () => {
    const lista = ids(
      estado({
        livros: [livro("a", "Dom Casmurro", ["Machado de Assis"])],
        colecoes: [{ id: 7, nome: "Clássicos", quantidade: 1 } as Colecao],
      }),
    );
    expect(lista.slice(0, 2)).toEqual(["importar", "buscar"]);
    expect(lista).toContain("estante-lendo");
    expect(lista).toContain("colecao-7");
    expect(lista).toContain("nova-colecao");
    expect(lista.at(-1)).toBe("livro-a");
    expect(lista).not.toContain("voltar");
  });

  it("importando, não oferece importar de novo; a lixeira só se tiver livros", () => {
    expect(ids(estado({ importando: true }))).not.toContain("importar");
    expect(ids(estado())).not.toContain("esvaziar");
    expect(ids(estado({ lixeiraComLivros: true }))).toContain("esvaziar");
  });

  it("no leitor: voltar e os comandos do leitor, sem os da biblioteca nem os livros", () => {
    const doLeitor = [{ id: "proxima", titulo: "Próxima página", grupo: "Leitura", executar: () => {} }];
    const lista = ids(estado({ lendo: true, doLeitor, livros: [livro("a", "Dom Casmurro")] }));
    expect(lista.slice(0, 2)).toEqual(["voltar", "proxima"]);
    expect(lista).not.toContain("importar");
    expect(lista).not.toContain("livro-a");
    // O que vale nas duas telas continua.
    expect(lista).toEqual(expect.arrayContaining(["tema-escuro", "movimento-reduzido", "atalhos", "sobre"]));
  });

  it("marca o tema e a animação atuais", () => {
    const lista = comandosDoApp(estado({ preferencias: { tema: "escuro", movimento: "reduzido" } }), acoes());
    const dica = (id: string) => lista.find((c) => c.id === id)?.dica;
    expect(dica("tema-escuro")).toBe("atual");
    expect(dica("tema-claro")).toBeUndefined();
    expect(dica("movimento-reduzido")).toBe("atual");
  });

  it("cada comando chama a ação certa", () => {
    const a = acoes();
    const dom = livro("a", "Dom Casmurro", ["Machado de Assis"]);
    const lista = comandosDoApp(
      estado({ livros: [dom], colecoes: [{ id: 7, nome: "Clássicos", quantidade: 1 } as Colecao] }),
      a,
    );
    const rodar = (id: string) => lista.find((c) => c.id === id)!.executar();
    rodar("estante-lidos");
    rodar("colecao-7");
    rodar("tema-claro");
    rodar("livro-a");
    expect(a.mostrar).toHaveBeenNthCalledWith(1, "lidos");
    expect(a.mostrar).toHaveBeenNthCalledWith(2, "colecao:7");
    expect(a.mudarPreferencias).toHaveBeenCalledWith({ tema: "claro" });
    expect(a.abrir).toHaveBeenCalledWith(dom);
    expect(lista.find((c) => c.id === "livro-a")?.dica).toBe("Machado de Assis");
  });
});
