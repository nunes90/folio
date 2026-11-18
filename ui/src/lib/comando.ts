// A chamada aos comandos do app (M40a). O core devolve os erros como `{ tipo, mensagem }`; aqui
// eles viram um `ErroDoComando`, para quem trata poder perguntar o tipo ("o nome já existe" ou
// "o banco falhou"?) sem comparar frases. Escrito num texto (`${erro}`, `String(erro)`), o erro
// continua sendo só a mensagem, como quando chegava como texto.
import { invoke as invocar, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";

/** As categorias de `crates/app/src/erro.rs` (`Tipo`). */
export type TipoDeErro =
  | "nome-em-uso"
  | "nome-vazio"
  | "nao-encontrado"
  | "livro-invalido"
  | "copia-invalida"
  | "arquivo"
  | "banco"
  | "voz"
  | "outro";

export class ErroDoComando extends Error {
  readonly tipo: TipoDeErro;

  constructor(tipo: TipoDeErro, mensagem: string) {
    super(mensagem);
    this.name = "ErroDoComando";
    this.tipo = tipo;
  }

  /** Só a frase, sem o "ErroDoComando: " que o `Error` poria na frente. */
  override toString(): string {
    return this.message;
  }
}

/** O que o comando rejeitou, como `ErroDoComando` se tiver a forma dele; senão, como veio. */
export function comoErro(erro: unknown): unknown {
  if (typeof erro !== "object" || erro === null) return erro;
  const { tipo, mensagem } = erro as { tipo?: unknown; mensagem?: unknown };
  if (typeof tipo !== "string" || typeof mensagem !== "string") return erro;
  return new ErroDoComando(tipo as TipoDeErro, mensagem);
}

/** O tipo do erro de um comando; `null` para qualquer outra coisa (um erro da própria página). */
export function tipoDoErro(erro: unknown): TipoDeErro | null {
  return erro instanceof ErroDoComando ? erro.tipo : null;
}

/**
 * O erro é do nome digitado (repetido ou vazio)? Então a frase vai no próprio campo, que fica
 * marcado como inválido; qualquer outro (o banco, o disco) não é culpa do que se digitou.
 */
export function erroDoNome(erro: unknown): boolean {
  const tipo = tipoDoErro(erro);
  return tipo === "nome-em-uso" || tipo === "nome-vazio";
}

/** O `invoke` do Tauri, com os erros do core já como `ErroDoComando`. */
export async function invoke<T>(
  ...chamada: [comando: string, args?: InvokeArgs, opcoes?: InvokeOptions]
): Promise<T> {
  try {
    // Os argumentos vão como vieram (sem `undefined` a mais no fim).
    return await invocar<T>(...chamada);
  } catch (erro) {
    throw comoErro(erro);
  }
}
