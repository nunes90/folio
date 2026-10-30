import { describe, expect, it } from "vitest";
import { mensagemAoAbrir } from "./errosAoAbrir";

const erro = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("mensagemAoAbrir", () => {
  it("PDF: diz o que houve, sem o nome técnico da exceção", () => {
    expect(mensagemAoAbrir(erro("InvalidPDFException", "Invalid PDF structure."), "pdf")).toBe(
      "O PDF está danificado ou incompleto.",
    );
    expect(mensagemAoAbrir(erro("PasswordException", "No password given"), "pdf")).toBe(
      "Este PDF é protegido por senha.",
    );
    expect(mensagemAoAbrir(erro("MissingPDFException"), "pdf")).toBe(
      "O arquivo do PDF não foi encontrado.",
    );
  });

  it("sem causa conhecida: uma frase geral, por formato", () => {
    expect(mensagemAoAbrir(new Error("qualquer coisa"), "pdf")).toBe("Não foi possível abrir o PDF.");
    expect(mensagemAoAbrir("texto", "epub")).toBe(
      "Não foi possível abrir o livro: o arquivo parece danificado.",
    );
  });
});
