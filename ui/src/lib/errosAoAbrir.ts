// O que o leitor diz quando um livro não abre (M26b): uma frase sobre o que houve, sem o nome
// técnico da exceção ("InvalidPDFException…"). O erro original vai para o log.

const DO_PDF: Record<string, string> = {
  InvalidPDFException: "O PDF está danificado ou incompleto.",
  PasswordException: "Este PDF é protegido por senha.",
  MissingPDFException: "O arquivo do PDF não foi encontrado.",
};

export function mensagemAoAbrir(erro: unknown, formato: "epub" | "pdf"): string {
  const nome = erro instanceof Error ? erro.name : "";
  if (formato === "pdf") return DO_PDF[nome] ?? "Não foi possível abrir o PDF.";
  return "Não foi possível abrir o livro: o arquivo parece danificado.";
}
