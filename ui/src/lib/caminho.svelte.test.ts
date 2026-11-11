import { describe, expect, it, vi } from "vitest";
import { Caminho, ehVoltar } from "./caminho.svelte";

describe("Caminho", () => {
  it("volta pelos saltos, do mais recente ao mais antigo", () => {
    const c = new Caminho<number>();
    c.sair(3);
    c.sair(40);
    expect(c.quantos).toBe(2);
    expect(c.voltar()).toBe(40);
    expect(c.voltar()).toBe(3);
    expect(c.voltar()).toBe(null);
    expect(c.quantos).toBe(0);
  });

  it("ignora ponto vazio e o mesmo ponto duas vezes seguidas", () => {
    const c = new Caminho<string>();
    c.sair(undefined);
    c.sair(null);
    c.sair("a");
    c.sair("a");
    expect(c.quantos).toBe(1);
  });

  it("guarda só os últimos 30", () => {
    const c = new Caminho<number>();
    for (let i = 0; i < 40; i++) c.sair(i);
    expect(c.quantos).toBe(30);
    expect(c.voltar()).toBe(39);
  });

  it("o comando da paleta só existe com para onde voltar", () => {
    const c = new Caminho<number>();
    const voltar = vi.fn();
    expect(c.comandos(voltar)).toEqual([]);
    c.sair(1);
    const [comando] = c.comandos(voltar);
    expect(comando!.titulo).toBe("Voltar para onde eu estava");
    comando!.executar();
    expect(voltar).toHaveBeenCalled();
  });
});

describe("ehVoltar", () => {
  const tecla = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
  it("só Alt+←", () => {
    expect(ehVoltar(tecla({ key: "ArrowLeft", altKey: true }))).toBe(true);
    expect(ehVoltar(tecla({ key: "ArrowLeft" }))).toBe(false);
    expect(ehVoltar(tecla({ key: "ArrowLeft", altKey: true, shiftKey: true }))).toBe(false);
    expect(ehVoltar(tecla({ key: "ArrowRight", altKey: true }))).toBe(false);
  });
});
