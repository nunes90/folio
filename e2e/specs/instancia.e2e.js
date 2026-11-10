// Instância única (M30): um segundo "Abrir com", com o app já aberto, não inicia outro app; o
// processo novo entrega o arquivo ao que já existe e sai.
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { esperarLivro } from "./ajuda.js";

const fixtures = fileURLToPath(new URL("../../tests/fixtures/", import.meta.url));
const app = process.env.FOLIO_APP ?? fileURLToPath(new URL("../../target/debug/folio", import.meta.url));

/** Chama o app de novo, como o gerenciador de arquivos faria, e espera esse processo sair. */
function chamarDeNovo(arquivo, pasta = fixtures) {
  const dados = path.dirname(process.env.FOLIO_DADOS_TESTE);
  const ambiente = {
    ...process.env,
    FOLIO_INSTANCIA_UNICA: "1",
    XDG_DATA_HOME: path.join(dados, "dados"),
    XDG_CACHE_HOME: path.join(dados, "cache"),
    XDG_STATE_HOME: path.join(dados, "estado"),
    GDK_BACKEND: "x11",
  };
  delete ambiente.WAYLAND_DISPLAY;
  return spawnSync(app, [arquivo], { cwd: pasta, env: ambiente, timeout: 15000 });
}

describe("Instância única", () => {
  it("o segundo processo entrega o arquivo e sai", async () => {
    await esperarLivro("Dom Casmurro");
    // Caminho relativo: vale a partir da pasta de quem chamou.
    const segundo = chamarDeNovo("texto.pdf");
    expect(segundo.error).toBeUndefined();
    expect(segundo.status).toBe(0);
    await esperarLivro("Documento de Teste");
  });

  it("com um livro aberto, troca para o que foi pedido", async () => {
    const terceiro = chamarDeNovo(path.join(fixtures, "dom-casmurro.epub"), "/");
    expect(terceiro.status).toBe(0);
    await esperarLivro("Dom Casmurro");
    // Continua uma janela só.
    expect((await browser.getWindowHandles()).length).toBe(1);
  });
});
