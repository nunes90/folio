import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const { abrirLinkConfirmado, cancelarLink, confirmacaoDeLink, linkExterno, pedirParaAbrir } = await import(
  "./linkExterno.svelte"
);
const { avisos } = await import("./avisos.svelte");

describe("linkExterno", () => {
  it("http e https, com o host", () => {
    expect(linkExterno(" https://Example.org/a b ")).toEqual({ url: "https://example.org/a%20b", host: "example.org" });
    expect(linkExterno("http://127.0.0.1:8080/x")?.host).toBe("127.0.0.1");
  });

  it("outros esquemas, endereços do livro e usuário embutido: não", () => {
    for (const href of ["file:///etc/passwd", "javascript:alert(1)", "mailto:a@b.c", "notas.xhtml#n1", "https://banco.com@golpe.example/"])
      expect(linkExterno(href), href).toBe(null);
  });
});

describe("pedirParaAbrir", () => {
  beforeEach(() => {
    invoke.mockReset();
    cancelarLink();
    avisos.splice(0);
  });

  it("pede confirmação e só então manda abrir", async () => {
    pedirParaAbrir("https://example.org/");
    expect(confirmacaoDeLink.pedido?.host).toBe("example.org");
    expect(invoke).not.toHaveBeenCalled();
    await abrirLinkConfirmado();
    expect(invoke).toHaveBeenCalledWith("abrir_no_navegador", { url: "https://example.org/" });
    expect(confirmacaoDeLink.pedido).toBe(null);
  });

  it("cancelar não abre nada", async () => {
    pedirParaAbrir("https://example.org/");
    cancelarLink();
    await abrirLinkConfirmado();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("um mailto não abre, e o aviso diz por quê", () => {
    pedirParaAbrir("mailto:alguem@example.org");
    expect(confirmacaoDeLink.pedido).toBe(null);
    expect(avisos.at(-1)?.texto).toContain("só endereços da web");
  });

  it("se o Rust recusar ou o navegador não abrir, o aviso mostra a mensagem", async () => {
    invoke.mockRejectedValueOnce("Não foi possível abrir o navegador.");
    pedirParaAbrir("https://example.org/");
    await abrirLinkConfirmado();
    expect(avisos.at(-1)?.texto).toBe("Não foi possível abrir o navegador.");
  });
});
