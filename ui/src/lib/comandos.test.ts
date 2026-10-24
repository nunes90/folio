import { describe, expect, it } from "vitest";
import { filtrarComandos, type Comando } from "./comandos";

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
