// Cópia de segurança (M38), no app em execução: exportar, mudar a biblioteca, restaurar (o banco é
// trocado com o app aberto) e conferir que ela voltou e continua funcionando. Os diálogos de
// arquivo são do sistema e o WebDriver não os alcança: os comandos são chamados direto.
import fs from "node:fs";
import path from "node:path";
import { ate, botao, esperarLivro, paleta, texto } from "./ajuda.js";

const invocar = (comando, argumentos = {}) =>
  browser.executeAsync(
    (c, a, feito) =>
      window.__TAURI_INTERNALS__.invoke(c, a).then(
        (valor) => feito({ valor }),
        (erro) => feito({ erro: String(erro) }),
      ),
    comando,
    argumentos,
  );

const titulos = async () => (await invocar("listar_livros")).valor.map((l) => l.titulo).sort();

describe("Cópia de segurança", () => {
  const copia = () => path.join(path.dirname(process.env.FOLIO_DADOS_TESTE), "teste.folio-backup");
  let dom;

  it("exporta a biblioteca com os livros", async () => {
    await esperarLivro("Dom Casmurro");
    // Um ponto de leitura, para conferir que volta.
    await paleta("20%");
    await ate(async () => (await texto("footer .porcento")) === "20%", "não foi a 20%");
    await botao("Voltar à biblioteca", "//header").click();
    await browser.pause(1000);
    dom = (await invocar("listar_livros")).valor[0];
    expect(dom.titulo).toBe("Dom Casmurro");

    const r = await invocar("exportar_copia", { caminho: copia(), comLivros: true });
    expect(r.erro).toBeUndefined();
    expect(r.valor).toMatchObject({ formato: 1, livros: 1, arquivos: 1 });
    expect(fs.statSync(copia()).size).toBeGreaterThan(100_000);
    expect((await invocar("ler_copia", { caminho: copia() })).valor.livros).toBe(1);
  });

  it("restaura depois de a biblioteca mudar: o livro e o progresso voltam, com o app aberto", async () => {
    // A biblioteca muda: o livro é apagado de vez (registro, progresso e arquivo).
    await invocar("mover_para_lixeira", { id: dom.id });
    expect((await invocar("apagar_livro", { id: dom.id })).erro).toBeUndefined();
    expect(await titulos()).toEqual([]);

    const r = await invocar("restaurar_copia", { caminho: copia() });
    expect(r.erro).toBeUndefined();
    expect(r.valor).toMatchObject({ livros: 1, semArquivo: 0 });
    expect(fs.existsSync(r.valor.anterior)).toBe(true);
    expect(await titulos()).toEqual(["Dom Casmurro"]);
    const progresso = (await invocar("progresso_livro", { id: dom.id })).valor;
    expect(Math.round(progresso.fracao * 100)).toBe(20);
  });

  it("o livro restaurado abre, no ponto em que estava", async () => {
    // A página ainda mostra a lista de antes: recarregar, como o app faz depois de restaurar.
    await browser.execute(() => location.reload());
    await esperarLivro("Dom Casmurro");
    await ate(async () => (await texto("footer .porcento")) === "20%", "o livro não abriu em 20%");
  });

  it("um arquivo que não é cópia é recusado, e a biblioteca fica como estava", async () => {
    const r = await invocar("restaurar_copia", { caminho: path.resolve("../tests/fixtures/minimo.epub") });
    expect(r.erro).toContain("não é uma cópia de segurança do Folio");
    expect(await titulos()).toEqual(["Dom Casmurro"]);
  });
});
