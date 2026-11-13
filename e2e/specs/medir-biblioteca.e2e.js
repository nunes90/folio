// Mede a biblioteca com muitos livros (M36; não é um teste): FOLIO_MEDIR_BIBLIOTECA=5000 ./virtual.sh npm test
// Enche o banco da sessão de teste com cópias do registro do livro aberto (a mesma capa, títulos
// diferentes), recarrega a página e mede: o tempo para voltar do leitor à biblioteca, o custo de
// refazer o layout, a rolagem (que vai desenhando a grade em lotes) e a busca.
// Tela virtual, sem GPU: serve para comparar, não como número absoluto.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ate, botao, esperarLivro } from "./ajuda.js";

const N = Number(process.env.FOLIO_MEDIR_BIBLIOTECA);
const medida = (nome, valor) => console.log(`[medida] ${nome}: ${valor}`);
const cartoes = () => browser.execute(() => document.querySelectorAll('ul[aria-label="Livros"] > li').length);

const ENCHER = `
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
n = int(sys.argv[2])
colunas = [l[1] for l in c.execute("pragma table_info(livros)")]
modelo = dict(zip(colunas, c.execute("select * from livros limit 1").fetchone()))
for i in range(n):
    linha = dict(modelo, id=f"{i:064x}", titulo=f"Livro de teste {i:05d}", autores=f"Autora {i % 300}", adicionado_em=modelo["adicionado_em"] - i - 1, aberto_em=None)
    c.execute(f"insert into livros ({','.join(colunas)}) values ({','.join('?' * len(colunas))})", [linha[k] for k in colunas])
c.commit()
`;

/** Mede na página: refazer o layout da grade, rolar 40 telas e filtrar pela busca. */
const medirNaPagina = () =>
  browser.executeAsync((feito) => {
    const ul = document.querySelector('ul[aria-label="Livros"]');
    const quadro = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
    (async () => {
      // 1. Layout: esconder e mostrar a grade obriga a recalcular tudo.
      let t = performance.now();
      ul.style.display = "none";
      void ul.offsetHeight;
      ul.style.display = "";
      void ul.offsetHeight;
      await quadro();
      const layout = performance.now() - t;
      // 2. Rolagem: 40 passos de uma tela, um por quadro.
      const tempos = [];
      let antes = await quadro();
      for (let i = 0; i < 40; i++) {
        window.scrollBy(0, innerHeight);
        const agora = await quadro();
        tempos.push(agora - antes);
        antes = agora;
      }
      tempos.sort((a, b) => a - b);
      // A rolagem foi acrescentando lotes à grade.
      const desenhados = ul.querySelectorAll(":scope > li").length;
      window.scrollTo(0, 0);
      // 3. Busca: digitar um termo que deixa ~1/300 dos livros.
      const campo = document.querySelector('search input, input[type="search"]');
      t = performance.now();
      campo.value = "Autora 7";
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      await quadro();
      await quadro();
      const busca = performance.now() - t;
      const filtrados = ul.querySelectorAll(":scope > li").length;
      campo.value = "";
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      await quadro();
      await quadro();
      feito({ layout, mediana: tempos[20], pior: tempos.at(-1), busca, filtrados, desenhados });
    })();
  });

describe("Medições da biblioteca", () => {
  it(`com ${N} livros`, async () => {
    await esperarLivro("Dom Casmurro");
    await botao("Voltar à biblioteca", "//header").click();
    await ate(async () => (await cartoes()) === 1, "a biblioteca não apareceu");
    const banco = path.join(process.env.FOLIO_DADOS_TESTE, "io.github.nunes90.folio", "biblioteca.sqlite3");
    execFileSync("python3", ["-c", ENCHER, banco, String(N)]);

    // Recarregar: o app lista de novo e reabre o livro da linha de comando; daí, de volta à biblioteca.
    await browser.execute(() => location.reload());
    await browser.pause(1000);
    await esperarLivro("Dom Casmurro");
    await browser.pause(1500);
    const t0 = Date.now();
    await botao("Voltar à biblioteca", "//header").click();
    await ate(async () => (await cartoes()) >= 100, "a grade não apareceu", 120000);
    medida("do leitor de volta à biblioteca, com a grade desenhada", `${Date.now() - t0} ms (${await cartoes()} cartões)`);
    await browser.pause(2000);
    await browser.setTimeout({ script: 120000 });

    const ms = (v) => `${Math.round(v)} ms`;
    const r = await medirNaPagina();
    medida(
      "na grade",
      `layout ${ms(r.layout)}; rolagem: mediana ${ms(r.mediana)} por quadro, pior ${ms(r.pior)}; busca ${ms(r.busca)} (${r.filtrados} cartões)`,
    );
    medida("cartões desenhados depois de rolar 40 telas", r.desenhados);
    // Pelo teclado: End leva ao último livro, e a grade passa a ter todos.
    await browser.execute(() => document.querySelector('ul[aria-label="Livros"] button.livro').focus());
    const t1 = Date.now();
    await browser.keys("End");
    await ate(async () => (await cartoes()) > N, "End não desenhou a grade inteira", 120000);
    const ultimo = await browser.execute(() => document.activeElement?.querySelector(".titulo")?.textContent?.trim());
    medida("End: a grade inteira e o foco no último livro", `${Date.now() - t1} ms (${await cartoes()} cartões; foco em “${ultimo}”)`);
  });
});
