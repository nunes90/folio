import { describe, expect, it, vi } from "vitest";
import {
  comandosDaPagina,
  comandosDoIndice,
  comandosDoTexto,
  filtrarComandos,
  irParaPagina,
  type Comando,
} from "./comandos";
import { LIMITES, PADRAO } from "./preferencias.svelte";

const nada = () => {};
const c = (id: string, titulo: string, extra: Partial<Comando> = {}): Comando => ({
  id,
  titulo,
  grupo: "Teste",
  executar: nada,
  ...extra,
});

const COMANDOS = [
  c("importar", "Importar livros…"),
  c("escuro", "Interface: escuro"),
  c("lendo", "Estante: Lendo"),
  c("dom", "Abrir Dom Casmurro", { dica: "Machado de Assis" }),
  c("cortico", "Abrir O Cortiço", { dica: "Aluísio Azevedo" }),
  c("claro", "Interface: claro", { palavras: "tema cores" }),
];

const ids = (lista: Comando[]) => lista.map((x) => x.id);

describe("filtrarComandos", () => {
  it("sem termo, devolve todos na ordem original", () => {
    expect(ids(filtrarComandos(COMANDOS, "  "))).toEqual(ids(COMANDOS));
  });

  it("acha sem acentos nem maiúsculas, com as palavras em qualquer ordem", () => {
    expect(ids(filtrarComandos(COMANDOS, "cortico"))).toEqual(["cortico"]);
    expect(ids(filtrarComandos(COMANDOS, "ESCURO interface"))).toEqual(["escuro"]);
  });

  it("busca também na dica (ex.: o autor do livro) e nas palavras extras", () => {
    expect(ids(filtrarComandos(COMANDOS, "aluisio"))).toEqual(["cortico"]);
    expect(ids(filtrarComandos(COMANDOS, "tema"))).toEqual(["claro"]);
  });

  it("exige todas as palavras", () => {
    expect(filtrarComandos(COMANDOS, "abrir xyz")).toEqual([]);
  });

  it("põe primeiro o que começa com o termo, depois o que tem palavras começando com ele", () => {
    const lista = [
      c("meio", "Estante: Lidos"), // "li" começa a palavra "lidos"; não tem "le"
      c("dentro", "Abrir Hamlet"), // "hamlet": "le" só no meio
      c("comeco", "Lendo agora"),
    ];
    expect(ids(filtrarComandos(lista, "le"))).toEqual(["comeco", "dentro"]);
    expect(ids(filtrarComandos(lista, "li"))).toEqual(["meio"]);
    const ordem = [c("a", "Abrir Hamlet"), c("b", "Estante: Lendo"), c("c", "Lendo agora")];
    expect(ids(filtrarComandos(ordem, "le"))).toEqual(["c", "b", "a"]);
  });
});

describe("comandos do leitor", () => {
  const prefs = { ...PADRAO };

  it("índice: um comando por item (com subitens), o atual marcado", () => {
    const navegar = vi.fn();
    const itens = [
      { label: "I. Do título", href: "c1" },
      { label: " II. Do livro ", href: "c2", subitems: [{ label: "Parte A", href: "c2a" }] },
    ];
    const lista = comandosDoIndice(itens, "c2", navegar);
    expect(lista.map((c) => c.titulo)).toEqual([
      "Ir para: I. Do título",
      "Ir para: II. Do livro",
      "Ir para: Parte A",
    ]);
    expect(lista.map((c) => c.dica)).toEqual([undefined, "atual", undefined]);
    lista[2]!.executar();
    expect(navegar).toHaveBeenCalledWith("c2a");
  });

  it("índice: hrefs repetidos não repetem o id", () => {
    const itens = [
      { label: "A", href: "x" },
      { label: "B", href: "x" },
    ];
    const ids = comandosDoIndice(itens, undefined, () => {}).map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("página e virada: uma opção por valor, a atual marcada, e mudar grava a preferência", () => {
    const mudar = vi.fn();
    const lista = comandosDaPagina({ ...prefs, pagina: "sepia" }, mudar);
    const sepia = lista.find((c) => c.titulo === "Página: Sépia")!;
    expect(sepia.dica).toBe("atual");
    expect(lista.find((c) => c.titulo === "Página: Automática")).toBeTruthy();
    lista.find((c) => c.titulo === "Página: Noite")!.executar();
    expect(mudar).toHaveBeenCalledWith({ pagina: "noite" });
    lista.find((c) => c.titulo === "Virada: Nenhuma")!.executar();
    expect(mudar).toHaveBeenCalledWith({ virada: "nenhuma" });
  });

  it("texto: aumentar e diminuir respeitam os limites", () => {
    const mudar = vi.fn();
    const no = (tamanho: number, titulo: string) =>
      comandosDoTexto({ ...prefs, tamanho }, mudar, () => {}).find((c) => c.titulo === titulo);
    no(1, "Aumentar o texto")!.executar();
    expect(mudar).toHaveBeenLastCalledWith({ tamanho: 1.1 });
    no(1, "Diminuir o texto")!.executar();
    expect(mudar).toHaveBeenLastCalledWith({ tamanho: 0.9 });
    // No limite, o comando some (não faria nada).
    expect(no(LIMITES.tamanho.max, "Aumentar o texto")).toBeUndefined();
    expect(no(LIMITES.tamanho.min, "Diminuir o texto")).toBeUndefined();
  });

  it("texto: fontes, alinhamento, hifenização e restaurar", () => {
    const mudar = vi.fn();
    const restaurar = vi.fn();
    const lista = comandosDoTexto({ ...prefs, hifenizacao: false }, mudar, restaurar);
    lista.find((c) => c.titulo === "Fonte: Atkinson Hyperlegible")!.executar();
    expect(mudar).toHaveBeenCalledWith({ fonte: "atkinson" });
    lista.find((c) => c.titulo === "Alinhamento: justificado")!.executar();
    expect(mudar).toHaveBeenCalledWith({ alinhamento: "justificado" });
    lista.find((c) => c.titulo === "Ligar a hifenização")!.executar();
    expect(mudar).toHaveBeenCalledWith({ hifenizacao: true });
    lista.find((c) => c.titulo === "Restaurar o texto padrão")!.executar();
    expect(restaurar).toHaveBeenCalled();
  });

  it("ir para a página: só com um número válido no termo", () => {
    const ir = vi.fn();
    expect(irParaPagina("42", 300, ir).map((c) => c.titulo)).toEqual(["Ir para a página 42"]);
    expect(irParaPagina("página 7", 300, ir)).toHaveLength(1);
    expect(irParaPagina("pag 7", 300, ir)).toHaveLength(1);
    expect(irParaPagina("0", 300, ir)).toEqual([]);
    expect(irParaPagina("301", 300, ir)).toEqual([]);
    expect(irParaPagina("noite", 300, ir)).toEqual([]);
    irParaPagina(" 12 ", 300, ir)[0]!.executar();
    expect(ir).toHaveBeenCalledWith(12);
  });
});
