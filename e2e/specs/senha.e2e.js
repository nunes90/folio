// PDF com senha: Cancelar volta à biblioteca sem erro; senha errada avisa; a certa abre.
import { Key, ate, botao, esperarLivro, texto } from "./ajuda.js";

const campo = () => $("#campo-senha");

describe("PDF com senha", () => {
  it("pede a senha; Cancelar volta à biblioteca, sem erro", async () => {
    await (await campo()).waitForDisplayed({ timeout: 20000 });
    await botao("Cancelar", '//dialog[@aria-labelledby="titulo-pedir-senha"]').click();
    await ate(
      async () => (await texto('ul[aria-label="Livros"] .titulo')) === "pdf-com-senha",
      "não voltou à biblioteca",
    );
    expect(await texto('p[role="alert"]')).toBe("");
  });

  it("senha errada avisa e pede de novo; a certa abre", async () => {
    await $('ul[aria-label="Livros"] .titulo').click();
    await (await campo()).waitForDisplayed({ timeout: 20000 });
    await (await campo()).setValue("errada");
    await browser.keys(Key.Enter);
    await ate(async () => (await texto("#erro-senha")).includes("Senha incorreta"), "sem o aviso da senha errada");
    await (await campo()).setValue("usuario");
    await browser.keys(Key.Enter);
    await esperarLivro("pdf-com-senha");
    await ate(
      () => browser.execute(() => document.querySelector("footer input[type=number]")?.max === "2"),
      "o documento não abriu",
    );
  });
});
