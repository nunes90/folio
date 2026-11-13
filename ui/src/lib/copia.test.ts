import { describe, expect, it } from "vitest";
import { nomeSugerido, textoDaCopia, textoDaExportacao, textoDaRestauracao, type Manifesto } from "./copia";

const manifesto = (livros: number, arquivos: number): Manifesto => ({
  formato: 1,
  versaoDoApp: "1.3.0",
  esquema: 11,
  criadaEm: 1_794_500_000,
  livros,
  arquivos,
});

describe("cópia de segurança: textos", () => {
  it("o nome sugerido leva a data local", () => {
    expect(nomeSugerido(new Date(2026, 10, 2, 9, 5))).toBe("Folio 2026-11-02.folio-backup");
  });

  it("o que a cópia traz", () => {
    expect(textoDaCopia(manifesto(12, 12))).toBe("A cópia tem 12 livros, com os arquivos dos livros.");
    expect(textoDaCopia(manifesto(1, 0))).toContain("1 livro, sem os arquivos dos livros");
    expect(textoDaCopia(manifesto(12, 9))).toBe("A cópia tem 12 livros, com os arquivos de 9 deles.");
  });

  it("o aviso depois de exportar", () => {
    expect(textoDaExportacao(manifesto(3, 3))).toBe("Cópia de segurança gravada: 3 livros, com os arquivos.");
    expect(textoDaExportacao(manifesto(3, 0))).toBe("Cópia de segurança gravada: os dados de 3 livros, sem os arquivos.");
  });

  it("o aviso depois de restaurar diz o que falta importar", () => {
    expect(textoDaRestauracao({ livros: 5, semArquivo: 0, anterior: "/x" })).toBe("Biblioteca restaurada: 5 livros.");
    expect(textoDaRestauracao({ livros: 5, semArquivo: 1, anterior: "/x" })).toContain("O arquivo de 1 deles não veio");
    expect(textoDaRestauracao({ livros: 5, semArquivo: 5, anterior: "/x" })).toContain("Os arquivos de 5 deles não vieram");
  });
});
