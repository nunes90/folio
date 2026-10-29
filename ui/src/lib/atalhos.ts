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
  { teclas: [["Ctrl", "K"]], acao: "Paleta de comandos: buscar uma ação ou um livro pelo nome" },
  { teclas: [["Tab"], ["Shift", "Tab"]], acao: "Ir para o próximo ou o anterior controle" },
  { teclas: [["Esc"]], acao: "Fechar o painel ou o diálogo aberto" },
];

export const ATALHOS: Record<Contexto, Atalho[]> = {
  biblioteca: [
    { teclas: [["←"], ["→"], ["↑"], ["↓"]], acao: "Mover entre os livros" },
    { teclas: [["Home"], ["End"]], acao: "Ir para o primeiro ou o último livro" },
    { teclas: [["Enter"]], acao: "Abrir o livro selecionado" },
    { teclas: [["Shift", "F10"], ["Menu"]], acao: "Ações do livro selecionado (para ler, lido, lixeira)" },
    {
      teclas: [["Delete"]],
      acao: "Mover o livro selecionado para a lixeira (na Lixeira: apagar de vez, pede confirmação)",
    },
    { teclas: [["Ctrl", "F"]], acao: "Buscar na biblioteca" },
    { teclas: [["Ctrl", "O"]], acao: "Importar livros (também dá para arrastar os arquivos para a janela)" },
    ...GERAIS,
  ],
  epub: [
    { teclas: [["←"], ["→"]], acao: "Página à esquerda ou à direita" },
    { teclas: [["Page Up"], ["Page Down"]], acao: "Página anterior ou seguinte" },
    { teclas: [["Ctrl", "Shift", "F"]], acao: "Modo foco: só o livro na tela (Esc sai)" },
    {
      teclas: [["Ctrl", "Shift", "B"]],
      acao: "Uma ideia por vez: o livro passa a rolar e só o bloco atual fica em evidência, no meio da tela (Esc sai)",
    },
    { teclas: [["↑"], ["↓"]], acao: "Com a uma ideia por vez: bloco anterior ou seguinte" },
    {
      teclas: [["Ctrl", "Shift", "L"]],
      acao: "Abrir ao lado o ponto em que o livro está (cada lado anda por conta própria) ou fechar o lado",
    },
    { teclas: [["F6"]], acao: "Com o lado aberto: alternar o foco entre os lados" },
    {
      teclas: [["Ctrl", "D"]],
      acao: "Destacar o trecho selecionado ou, sem seleção, a frase atual (abre a barra de cores; setas escolhem, Enter aplica)",
    },
    {
      teclas: [["Alt", "↑"], ["Alt", "↓"]],
      acao: "Na barra de destaque: frase anterior ou seguinte",
    },
    {
      teclas: [["Alt", "Shift", "↑"], ["Alt", "Shift", "↓"]],
      acao: "Na barra de destaque: encolher ou estender o trecho, uma frase por vez",
    },
    ...GERAIS,
  ],
  pdf: [
    {
      teclas: [["←"], ["→"]],
      acao: "Página anterior ou seguinte (com a página inteira na tela, ↑ e ↓ também)",
    },
    { teclas: [["Ctrl", "F"]], acao: "Buscar no documento" },
    { teclas: [["Enter"], ["Shift", "Enter"]], acao: "Na busca: próxima ou anterior ocorrência" },
    { teclas: [["Ctrl", "+"], ["Ctrl", "−"]], acao: "Aumentar ou diminuir o zoom" },
    { teclas: [["Ctrl", "0"]], acao: "Ajustar à largura" },
    { teclas: [["Ctrl", "Shift", "F"]], acao: "Modo foco: só o livro na tela (Esc sai)" },
    {
      teclas: [["Ctrl", "Shift", "B"]],
      acao: "Uma ideia por vez: o livro passa a rolar e só o bloco atual fica em evidência, no meio da tela (Esc sai)",
    },
    { teclas: [["↑"], ["↓"]], acao: "Com a uma ideia por vez: bloco anterior ou seguinte" },
    ...GERAIS,
  ],
};

export const NOMES_CONTEXTO: Record<Contexto, string> = {
  biblioteca: "Biblioteca",
  epub: "Leitura de EPUB",
  pdf: "Leitura de PDF",
};
