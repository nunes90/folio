// Notas de rodapé num balão (M35b), e os links do livro que não são notas (M35a).
import { Key, ate, confirmacao, esperarLivro, noDialogo, texto } from "./ajuda.js";

/** O índice da seção à vista e o texto do balão da nota ("" se fechado). */
const estado = () =>
  browser.execute(() => {
    const v = document.querySelector("foliate-view");
    return {
      secao: v.renderer.getContents()[0]?.index,
      balao: document.querySelector(".balao-nota")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      focoNoBalao: !!document.activeElement?.closest(".balao-nota"),
    };
  });

/** Clica num link do capítulo à vista (o clique chega ao foliate-js como o do mouse). */
const clicarNoLink = (id) =>
  browser.execute((id) => {
    const doc = document.querySelector("foliate-view").renderer.getContents()[0].doc;
    doc.getElementById(id).click();
  }, id);

describe("Notas de rodapé", () => {
  it("a nota marcada pelo livro abre num balão, sem sair da página; Esc fecha", async () => {
    await esperarLivro("Livro com notas");
    await ate(async () => (await estado()).secao === 0, "o livro não abriu no capítulo um");
    await browser.pause(500);
    await clicarNoLink("r1");
    await ate(async () => (await estado()).balao !== "", "o balão não abriu");
    const e = await estado();
    expect(e.balao).toContain("Nota de rodapé");
    expect(e.balao).toContain("Texto da nota um, no mesmo capítulo.");
    // Sem o número de volta à chamada.
    expect(e.balao).not.toMatch(/Nota de rodapé\s*1/);
    expect(e.secao).toBe(0);
    // O foco vai ao balão um instante depois de ele aparecer (falhou uma vez na CI, por conferir na hora).
    await ate(async () => (await estado()).focoNoBalao, "o foco não foi ao balão");
    await browser.keys(Key.Escape);
    await ate(async () => (await estado()).balao === "", "Esc não fechou o balão");
  });

  it("a nota de fim (só o número em sobrescrito) também; Ir até a nota leva a ela, e Alt+← volta", async () => {
    await clicarNoLink("r2");
    await ate(async () => (await estado()).balao.includes("Texto da nota dois"), "o balão da nota de fim não abriu");
    expect((await estado()).balao).not.toMatch(/Nota\s*2 Texto/);
    await browser.execute(() =>
      [...document.querySelectorAll(".balao-nota button")].find((b) => b.textContent.trim() === "Ir até a nota").click(),
    );
    await ate(async () => (await estado()).secao === 2, "não foi até a nota");
    expect((await estado()).balao).toBe("");
    await browser.pause(400);
    await browser.keys([Key.Alt, Key.ArrowLeft]);
    await ate(async () => (await estado()).secao === 0, "Alt+← não voltou ao capítulo da chamada");
  });

  it("um link comum leva ao destino, com o aviso de voltar; Alt+← volta", async () => {
    await browser.pause(400);
    await clicarNoLink("comum");
    await ate(async () => (await estado()).secao === 1, "o link comum não levou ao capítulo dois");
    expect((await estado()).balao).toBe("");
    await ate(
      async () => (await texto(".avisos")).includes("Você seguiu um link do livro."),
      "o aviso de voltar não apareceu",
    );
    await browser.pause(400);
    await browser.keys([Key.Alt, Key.ArrowLeft]);
    await ate(async () => (await estado()).secao === 0, "Alt+← não voltou");
  });

  it("um link para a web pede confirmação antes de abrir no navegador; Cancelar não abre nada", async () => {
    await browser.pause(400);
    await clicarNoLink("fora");
    await ate(async () => (await confirmacao()).titulo !== "", "a confirmação não apareceu");
    const c = await confirmacao();
    expect(c.titulo).toBe("Abrir example.org no navegador?");
    expect(c.texto).toContain("https://example.org/folio");
    // O foco fica em Cancelar: um Enter distraído não abre o navegador.
    expect(await browser.execute(() => document.activeElement?.textContent?.trim())).toBe("Cancelar");
    await noDialogo("Cancelar");
    await ate(async () => (await confirmacao()).titulo === "", "a confirmação não fechou");
    expect((await estado()).secao).toBe(0);
  });

  it("um link que não é da web (mailto) não abre, e um aviso diz por quê", async () => {
    await clicarNoLink("correio");
    await ate(
      async () => (await texto(".avisos")).includes("só endereços da web"),
      "o aviso do link recusado não apareceu",
    );
    expect((await confirmacao()).titulo).toBe("");
  });
});
