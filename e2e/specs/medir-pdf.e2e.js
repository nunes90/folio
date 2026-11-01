// Medições do leitor de PDF (não é um teste; ver "Roteiro de desempenho"): FOLIO_MEDIR=<pdf> ./virtual.sh npm test
// Tela virtual, sem GPU: serve para comparar antes e depois, não como número absoluto.
import fs from "node:fs";
import { Key, ate, botao, esperarLivro, paleta, texto } from "./ajuda.js";

const medida = (nome, valor) => console.log(`[medida] ${nome}: ${valor}`);

/** RSS (MB) dos processos desta sessão, achados pela pasta de dados temporária no ambiente. */
function rss() {
  let kb = 0;
  for (const pid of fs.readdirSync("/proc").filter((p) => /^\d+$/.test(p))) {
    try {
      if (!fs.readFileSync(`/proc/${pid}/environ`, "latin1").includes("folio-e2e-")) continue;
      if (!/folio|WebKit/.test(fs.readFileSync(`/proc/${pid}/comm`, "latin1"))) continue;
      kb += Number(fs.readFileSync(`/proc/${pid}/status`, "latin1").match(/VmRSS:\s+(\d+)/)?.[1] ?? 0);
    } catch {
      // O processo terminou no meio da leitura.
    }
  }
  return Math.round(kb / 1024);
}

const pagina = () => browser.execute(() => Number(document.querySelector('.barra input[type="number"], input[type="number"]')?.value));

/** Vira `n` páginas e devolve o tempo de cada uma até ela estar desenhada (e marcada, na noite). */
async function virar(n, noite) {
  const tempos = [];
  for (let i = 0; i < n; i++) {
    const alvo = (await pagina()) + 1;
    const t = await browser.executeAsync((alvo, noite, feito) => {
      const t0 = performance.now();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      const conferir = () => {
        const p = document.querySelector(`.page[data-page-number="${alvo}"]`);
        const c = p?.querySelector("canvas");
        const desenhada = p?.dataset.loaded === "true" && c && (!noite || "invertida" in c.dataset);
        const naTela = p && p.getBoundingClientRect().height > 0;
        if (desenhada && naTela) requestAnimationFrame(() => feito(Math.round(performance.now() - t0)));
        else setTimeout(conferir, 2);
      };
      conferir();
    }, alvo, noite);
    tempos.push(t);
    await browser.pause(60);
  }
  return tempos;
}

const resumo = (t) => {
  const o = [...t].sort((a, b) => a - b);
  return `mediana ${o[o.length >> 1]} ms, máx ${o.at(-1)} ms`;
};

describe("medir o PDF", () => {
  it("abrir de novo", async () => {
    await ate(async () => (await texto("header h1")) !== "" && (await $(".page canvas").isExisting()), "não abriu", 60000);
    await browser.pause(1500);
    medida("RSS com o livro aberto", `${rss()} MB`);
    await botao("Voltar à biblioteca", "//header").click();
    await $("nav[aria-label='Estantes']").waitForDisplayed();
    await browser.pause(800);
    const t = await browser.executeAsync((feito) => {
      const t0 = performance.now();
      const capa = document.querySelector("[data-capa-livro]");
      (capa.closest("button") ?? capa.parentElement.querySelector("button") ?? capa).click();
      const conferir = () => {
        const p = document.querySelector('.page[data-loaded="true"] canvas');
        if (p) feito(Math.round(performance.now() - t0));
        else setTimeout(conferir, 5);
      };
      conferir();
    });
    medida("abrir até a primeira página desenhada", `${t} ms`);
    await browser.pause(1500);
  });

  it("virar no original", async () => {
    const t = await virar(20, false);
    medida("virar 20, original", resumo(t));
    medida("RSS depois de virar", `${rss()} MB`);
  });

  it("noite", async () => {
    const t0 = Date.now();
    await paleta("página: noite");
    await ate(() => browser.execute(() => !!document.querySelector(".page canvas[data-invertida]")), "não inverteu");
    medida("ligar a noite (até a página invertida)", `${Date.now() - t0} ms, com a paleta`);
    await browser.pause(800);
    const t = await virar(20, true);
    medida("virar 20, noite", resumo(t));
    medida("RSS na noite", `${rss()} MB`);
  });

  it("lado a lado", async () => {
    const antes = rss();
    const t0 = Date.now();
    await paleta("abrir este ponto ao lado");
    await ate(() => browser.execute(() => !!document.querySelector(".area-lado .page canvas")), "o lado não abriu");
    medida("abrir o lado", `${Date.now() - t0} ms, com a paleta`);
    await browser.pause(1500);
    medida("RSS com o lado", `${rss()} MB (antes: ${antes} MB)`);
    await browser.keys([Key.Ctrl, Key.Shift, "l"]);
    await browser.pause(1000);
    medida("RSS depois de fechar o lado", `${rss()} MB`);
    for (let i = 0; i < 3; i++) {
      await browser.keys([Key.Ctrl, Key.Shift, "l"]);
      await ate(() => browser.execute(() => !!document.querySelector(".area-lado .page canvas")), "o lado não abriu");
      await browser.pause(800);
      await browser.keys([Key.Ctrl, Key.Shift, "l"]);
      await browser.pause(800);
    }
    medida("RSS depois de abrir e fechar o lado mais 3 vezes", `${rss()} MB`);
  });

  it("abrir e fechar o livro", async () => {
    for (let i = 0; i < 3; i++) {
      await botao("Voltar à biblioteca", "//header").click();
      await $("nav[aria-label='Estantes']").waitForDisplayed();
      await browser.pause(800);
      if (i === 0) medida("RSS na biblioteca", `${rss()} MB`);
      await browser.execute(() => {
        const capa = document.querySelector("[data-capa-livro]");
        (capa.closest("button") ?? capa.parentElement.querySelector("button") ?? capa).click();
      });
      await ate(() => browser.execute(() => !!document.querySelector('.page[data-loaded="true"] canvas')), "não abriu", 30000);
      await browser.pause(800);
    }
    medida("RSS depois de abrir e fechar o livro mais 3 vezes", `${rss()} MB`);
    await botao("Voltar à biblioteca", "//header").click();
    await browser.pause(3000);
    medida("RSS na biblioteca, 3 s depois", `${rss()} MB`);
  });
});
