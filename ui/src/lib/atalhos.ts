// Atalhos de teclado por contexto: fonte do diálogo de ajuda (F1). Ao criar um atalho,
// registre-o aqui. Evite atalhos de uma letra só: leitores de tela usam letras para navegar
// e o WCAG 2.1.4 exige que esses atalhos possam ser desligados.

export type Contexto = "biblioteca" | "epub" | "pdf";

export interface Atalho {
  /** Teclas, uma combinação por item (ex.: ["Ctrl", "F"] vira Ctrl + F). */
  teclas: string[][];
  acao: string;
}

const GERAIS: Atalho[] = [
  { teclas: [["F1"]], acao: "Mostrar estes atalhos" },
  { teclas: [["Tab"], ["Shift", "Tab"]], acao: "Ir para o próximo ou o anterior controle" },
  { teclas: [["Esc"]], acao: "Fechar o painel ou o diálogo aberto" },
];

export const ATALHOS: Record<Contexto, Atalho[]> = {
  biblioteca: [
    { teclas: [["←"], ["→"], ["↑"], ["↓"]], acao: "Mover entre os livros" },
    { teclas: [["Home"], ["End"]], acao: "Ir para o primeiro ou o último livro" },
    { teclas: [["Enter"]], acao: "Abrir o livro selecionado" },
    { teclas: [["Delete"]], acao: "Remover o livro selecionado (pede confirmação)" },
    { teclas: [["Ctrl", "F"]], acao: "Buscar na biblioteca" },
    { teclas: [["Ctrl", "O"]], acao: "Importar livros (também dá para arrastar os arquivos para a janela)" },
    ...GERAIS,
  ],
  epub: [
    { teclas: [["←"], ["→"]], acao: "Página à esquerda ou à direita" },
    { teclas: [["Page Up"], ["Page Down"]], acao: "Página anterior ou seguinte" },
    ...GERAIS,
  ],
  pdf: [
    { teclas: [["←"], ["→"]], acao: "Página anterior ou seguinte" },
    { teclas: [["Ctrl", "F"]], acao: "Buscar no documento" },
    { teclas: [["Enter"], ["Shift", "Enter"]], acao: "Na busca: próxima ou anterior ocorrência" },
    { teclas: [["Ctrl", "+"], ["Ctrl", "−"]], acao: "Aumentar ou diminuir o zoom" },
    { teclas: [["Ctrl", "0"]], acao: "Ajustar à largura" },
    ...GERAIS,
  ],
};

export const NOMES_CONTEXTO: Record<Contexto, string> = {
  biblioteca: "Biblioteca",
  epub: "Leitura de EPUB",
  pdf: "Leitura de PDF",
};
