import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avisar,
  avisarSeDemorar,
  avisos,
  dispensar,
  mensagensDaImportacao,
} from "./avisos.svelte";
import type { Livro } from "./biblioteca";

function livro(titulo: string): Livro {
  return {
    id: titulo,
    formato: "epub",
    titulo,
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
  };
}

afterEach(() => avisos.splice(0));

describe("avisar e dispensar", () => {
  it("empilha avisos com id próprio e remove pelo id", () => {
    const a = avisar("Dom Casmurro foi importado.");
    const b = avisar("Não foi possível abrir x.epub.", "erro");
    expect(avisos.map((x) => x.tipo)).toEqual(["sucesso", "erro"]);
    dispensar(a);
    expect(avisos.map((x) => x.id)).toEqual([b]);
  });
});

describe("avisarSeDemorar", () => {
  afterEach(() => vi.useRealTimers());

  it("trabalho rápido não pisca aviso nenhum", async () => {
    vi.useFakeTimers();
    const resultado = avisarSeDemorar(Promise.resolve(42), "Importando…");
    await expect(resultado).resolves.toBe(42);
    vi.advanceTimersByTime(1000);
    expect(avisos).toHaveLength(0);
  });

  it("trabalho lento mostra o aviso de progresso e o tira ao terminar", async () => {
    vi.useFakeTimers();
    let terminar!: () => void;
    const trabalho = new Promise<void>((r) => (terminar = r));
    const fim = avisarSeDemorar(trabalho, "Importando 1 livro…");
    vi.advanceTimersByTime(400);
    expect(avisos).toEqual([
      expect.objectContaining({
        tipo: "progresso",
        texto: "Importando 1 livro…",
      }),
    ]);
    terminar();
    await fim;
    expect(avisos).toHaveLength(0);
  });

  it("se o trabalho falhar, o aviso some e o erro continua para quem chamou", async () => {
    vi.useFakeTimers();
    const fim = avisarSeDemorar(
      Promise.reject(new Error("disco cheio")),
      "Importando…",
    );
    await expect(fim).rejects.toThrow("disco cheio");
    expect(avisos).toHaveLength(0);
  });
});

describe("mensagensDaImportacao", () => {
  const vazio = { importados: [], jaExistentes: [], restaurados: [], falhas: [] };

  it("um livro: diz qual; vários: diz quantos", () => {
    expect(
      mensagensDaImportacao({ ...vazio, importados: [livro("Dom Casmurro")] }),
    ).toEqual([{ tipo: "sucesso", texto: "Dom Casmurro foi importado." }]);
    expect(
      mensagensDaImportacao({
        ...vazio,
        importados: [livro("A"), livro("B"), livro("C")],
      }),
    ).toEqual([{ tipo: "sucesso", texto: "3 livros importados." }]);
  });

  it("avisa quando o livro já estava na biblioteca", () => {
    expect(
      mensagensDaImportacao({
        ...vazio,
        jaExistentes: [livro("Dom Casmurro")],
      }),
    ).toEqual([
      { tipo: "sucesso", texto: "Dom Casmurro já estava na biblioteca." },
    ]);
    expect(
      mensagensDaImportacao({
        ...vazio,
        jaExistentes: [livro("A"), livro("B")],
      }),
    ).toEqual([
      { tipo: "sucesso", texto: "2 livros já estavam na biblioteca." },
    ]);
  });

  it("avisa quando o livro estava na lixeira e voltou para a estante", () => {
    expect(mensagensDaImportacao({ ...vazio, restaurados: [livro("Dom Casmurro")] })).toEqual([
      { tipo: "sucesso", texto: "Dom Casmurro voltou da lixeira." },
    ]);
    expect(mensagensDaImportacao({ ...vazio, restaurados: [livro("A"), livro("B")] })).toEqual([
      { tipo: "sucesso", texto: "2 livros voltaram da lixeira." },
    ]);
  });

  it("cada falha vira um aviso de erro com o nome do arquivo", () => {
    const falhas = [
      { caminho: "/home/l/Livros/quebrado.epub", erro: "não é um EPUB" },
    ];
    expect(mensagensDaImportacao({ ...vazio, falhas })).toEqual([
      {
        tipo: "erro",
        texto: "Não foi possível importar quebrado.epub: não é um EPUB",
      },
    ]);
  });

  it("várias falhas: um aviso só, com cada arquivo e o motivo (não uma pilha de avisos)", () => {
    const falhas = [
      { caminho: "/l/pdf-cortado.pdf", erro: "o PDF está danificado ou incompleto" },
      { caminho: "/l/vazio.epub", erro: "o arquivo está vazio" },
    ];
    expect(mensagensDaImportacao({ ...vazio, falhas })).toEqual([
      {
        tipo: "erro",
        texto:
          "2 arquivos não foram importados: pdf-cortado.pdf (o PDF está danificado ou incompleto); " +
          "vazio.epub (o arquivo está vazio).",
      },
    ]);
  });

  it("nada importado e nada a dizer: nenhum aviso", () => {
    expect(mensagensDaImportacao(vazio)).toEqual([]);
  });
});
