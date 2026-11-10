// Mede quanto a janela fica parada durante uma importação (M29; não é um teste):
// FOLIO_MEDIR_IMPORTAR=<pasta com livros grandes> ./virtual.sh npm test
// Com um livro aberto, importa tudo o que está na pasta e, enquanto isso, chama um comando leve do
// banco (listar_livros) sem parar: o tempo que ele leva para responder é o tempo que quem está
// lendo esperaria para o progresso ser gravado. Um comando sem `async` roda na thread principal:
// enquanto ele espera a trava da biblioteca, a janela não redesenha nem recebe teclas.
import fs from "node:fs";
import path from "node:path";
import { esperarLivro } from "./ajuda.js";

describe("Medições da importação", () => {
  it("espera de um comando leve durante a importação", async () => {
    await esperarLivro("Dom Casmurro");
    const pasta = path.resolve(process.env.FOLIO_MEDIR_IMPORTAR);
    const caminhos = fs.readdirSync(pasta).map((n) => path.join(pasta, n));
    await browser.setTimeout({ script: 200000 });
    const r = await browser.executeAsync((caminhos, feito) => {
      const invocar = window.__TAURI_INTERNALS__.invoke;
      const t0 = performance.now();
      let total = null;
      const esperas = [];
      void invocar("importar_livros", { caminhos }).then((resultado) => {
        total = { ms: performance.now() - t0, importados: resultado.importados.length, falhas: resultado.falhas };
      });
      const medir = async () => {
        while (total === null) {
          const a = performance.now();
          await invocar("listar_livros");
          esperas.push(performance.now() - a);
          await new Promise((r) => setTimeout(r, 10));
        }
        esperas.sort((a, b) => a - b);
        feito({
          ...total,
          chamadas: esperas.length,
          mediana: esperas[Math.floor(esperas.length / 2)],
          maxima: esperas.at(-1),
          acimaDe100ms: esperas.filter((e) => e > 100).length,
        });
      };
      void medir();
    }, caminhos);
    const ms = (v) => `${Math.round(v)} ms`;
    console.log(`[medida] arquivos: ${caminhos.length} (importados: ${r.importados}; falhas: ${JSON.stringify(r.falhas)})`);
    console.log(`[medida] importação inteira: ${ms(r.ms)}`);
    console.log(`[medida] comando leve durante a importação: ${r.chamadas} chamadas, mediana ${ms(r.mediana)}, máxima ${ms(r.maxima)}, acima de 100 ms: ${r.acimaDe100ms}`);
  });
});
