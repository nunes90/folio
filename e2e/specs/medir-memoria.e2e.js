// De onde vem a memória de um PDF aberto (M39; não é um teste):
// FOLIO_MEDIR_MEMORIA=<pdf> ./virtual.sh npm test
// Mede a memória anônima do processo da página (a que o PDF faz crescer; PSS e RSS enganam, ver
// docs/testes/desempenho.md) em cada etapa, conta o que há na página (canvas, texto) e depois vai
// soltando uma coisa de cada vez, para ver quanto cada uma segurava.
import fs from "node:fs";
import path from "node:path";
import { ate, botao, esperarLivro } from "./ajuda.js";

const medida = (nome, valor) => console.log(`[medida] ${nome}: ${valor}`);

/** Memória anônima (MB) do processo da página desta sessão. */
function anonima() {
  let kb = 0;
  for (const pid of fs.readdirSync("/proc").filter((p) => /^\d+$/.test(p))) {
    try {
      if (!fs.readFileSync(`/proc/${pid}/environ`, "latin1").includes("folio-e2e-")) continue;
      if (!/WebKitWebProces/.test(fs.readFileSync(`/proc/${pid}/comm`, "latin1"))) continue;
      kb += Number(fs.readFileSync(`/proc/${pid}/smaps_rollup`, "latin1").match(/Anonymous:\s+(\d+)/)?.[1] ?? 0);
    } catch {
      // O processo terminou no meio da leitura.
    }
  }
  return Math.round(kb / 1024);
}

/** Espera a memória assentar (o coletor de lixo roda quando quer) e devolve a menor de 4 leituras. */
async function assentada() {
  let menor = Infinity;
  for (let i = 0; i < 4; i++) {
    await browser.pause(1500);
    menor = Math.min(menor, anonima());
  }
  return menor;
}

/** O que há na página: os canvas (e quanto ocupam, a 4 bytes por pixel), as páginas e o texto. */
const naPagina = () =>
  browser.execute(() => {
    const canvas = [...document.querySelectorAll(".pdfViewer canvas")];
    const mb = canvas.reduce((s, c) => s + c.width * c.height * 4, 0) / 1048576;
    const maior = canvas.reduce((m, c) => (c.width * c.height > m.width * m.height ? c : m), { width: 0, height: 0 });
    return {
      canvas: canvas.length,
      canvasMB: Math.round(mb),
      maior: `${maior.width}x${maior.height}`,
      paginas: document.querySelectorAll(".pdfViewer .page").length,
      spans: document.querySelectorAll(".pdfViewer .textLayer span").length,
      dpr: devicePixelRatio,
    };
  });

const pagina = () => browser.execute(() => Number(document.querySelector('footer input[type="number"]')?.value));

async function virar(n) {
  for (let i = 0; i < n; i++) {
    const alvo = (await pagina()) + 1;
    await browser.execute(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    await ate(
      () => browser.execute((a) => document.querySelector(`.page[data-page-number="${a}"]`)?.dataset.loaded === "true", alvo),
      `a página ${alvo} não foi desenhada`,
      30000,
    );
    await browser.pause(120);
  }
}

describe("memória do PDF", () => {
  it("de onde vem", async () => {
    // A sessão começa com um EPUB: o processo da página ainda não carregou o pdf.js, e a biblioteca
    // é a base limpa. O PDF entra pela importação e abre na página pedida (FOLIO_MEDIR_PAGINA).
    await esperarLivro("Dom Casmurro");
    await browser.execute((sem) => localStorage.setItem("folio-medir", `1 ${sem}`), process.env.FOLIO_MEDIR_SEM ?? "");
    if (process.env.FOLIO_MEDIR_SEM) medida("desligado nesta rodada", process.env.FOLIO_MEDIR_SEM);
    await botao("Voltar à biblioteca", "//header").click();
    await $("nav[aria-label='Estantes']").waitForDisplayed();
    const pdf = await browser.executeAsync((caminho, pagina, feito) => {
      const invocar = window.__TAURI_INTERNALS__.invoke;
      invocar("importar_livros", { caminhos: [caminho] })
        .then(async (r) => {
          const livro = r.importados[0] ?? r.jaExistentes[0];
          if (pagina > 1)
            await invocar("salvar_progresso", { id: livro.id, progresso: { localizacao: `pagina:${pagina}`, fracao: 0.5 } });
          feito({ id: livro.id, titulo: livro.titulo });
        })
        .catch((e) => feito({ erro: String(e) }));
    }, path.resolve(process.env.FOLIO_MEDIR_MEMORIA), Number(process.env.FOLIO_MEDIR_PAGINA ?? 1));
    if (pdf.erro) throw new Error(pdf.erro);
    // A página não sabe do livro novo: recarregar (reabre o EPUB da linha de comando) e voltar.
    await browser.execute(() => location.reload());
    await browser.pause(1000);
    await esperarLivro("Dom Casmurro");
    await botao("Voltar à biblioteca", "//header").click();
    await $("nav[aria-label='Estantes']").waitForDisplayed();
    // A capa do PDF é gerada com o pdf.js ao importar: esperar acabar, para a base já incluir isso?
    // Não: a base é "antes de abrir este PDF"; o que a capa custou fica dito à parte.
    await browser.pause(4000);
    const biblioteca = await assentada();
    medida("biblioteca (com a capa do PDF já gerada)", `${biblioteca} MB`);

    await browser.execute((titulo) => {
      const botoes = [...document.querySelectorAll('ul[aria-label="Livros"] button.livro')];
      botoes.find((b) => b.textContent.includes(titulo)).click();
    }, pdf.titulo);
    await ate(() => browser.execute(() => !!document.querySelector('.page[data-loaded="true"] canvas')), "não abriu", 60000);
    const aberto = await assentada();
    // A página foi desenhada de verdade (uma imagem reduzida continua sendo uma imagem): a fração
    // de pixels que não são brancos.
    const tinta = await browser.execute(() => {
      const c = document.querySelector(".pdfViewer canvas");
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n++;
      return Math.round((100 * n) / (d.length / 4));
    });
    medida("pixels com tinta na página", `${tinta}%`);
    const pedidos = await browser.execute(() => window.__folioTrechos);
    medida("entradas do sumário", await browser.execute(() => window.__folioSumario?.itens ?? "-"));
    medida("lido do arquivo", `${pedidos.n} trechos, ${Math.round(pedidos.bytes / 1048576)} MB`);
    medida(`aberto na página ${await pagina()}`, `${aberto} MB (+${aberto - biblioteca})  ${JSON.stringify(await naPagina())}`);

    if (process.env.FOLIO_MEDIR_CURTO) return;
    await virar(30);
    const virado = await assentada();
    medida("depois de virar 30 páginas", `${virado} MB (+${virado - biblioteca})  ${JSON.stringify(await naPagina())}`);

    // Soltando uma coisa de cada vez.
    await browser.executeAsync((feito) => window.__folioPdf.documento.cleanup().then(() => feito(), () => feito()));
    let agora = await assentada();
    medida("solto: o que o documento guarda (fontes, imagens)", `${agora} MB (${agora - virado})`);
    let antes = agora;

    await browser.execute(() => {
      const atual = window.__folioPdf.visor().currentPageNumber;
      for (const c of document.querySelectorAll(".pdfViewer canvas")) {
        if (c.closest(".page")?.dataset.pageNumber !== String(atual)) c.width = c.height = 0;
      }
    });
    agora = await assentada();
    medida("solto: os canvas das páginas fora da tela", `${agora} MB (${agora - antes})`);
    antes = agora;

    await browser.execute(() => window.__folioPdf.visor().cleanup());
    agora = await assentada();
    medida("solto: o que o visor guarda das páginas fora da tela", `${agora} MB (${agora - antes})  ${JSON.stringify(await naPagina())}`);

    await botao("Voltar à biblioteca", "//header").click();
    await $("nav[aria-label='Estantes']").waitForDisplayed();
    const fechado = await assentada();
    medida("de volta à biblioteca", `${fechado} MB (+${fechado - biblioteca} em relação ao começo)`);
  });
});
