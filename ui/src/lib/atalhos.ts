// Atalhos de teclado por contexto: fonte do diálogo de ajuda (F1). Ao criar um atalho,
// registre-o aqui. Evite atalhos de uma letra só: leitores de tela usam letras para navegar
// e o WCAG 2.1.4 exige que esses atalhos possam ser desligados.

export type Contexto = "biblioteca" | "epub" | "pdf";

/** Grupos do F1 (M26a), nesta ordem. */
export const GRUPOS = ["Navegação", "Leitura", "Marcar", "Comparar", "Livros", "Geral"] as const;
export type Grupo = (typeof GRUPOS)[number];

export interface Atalho {
  /** Teclas, uma combinação por item (ex.: ["Ctrl", "F"] vira Ctrl + F). */
  teclas: string[][];
  acao: string;
  grupo: Grupo;
}

const GERAIS: Atalho[] = [
  { teclas: [["F1"]], acao: "Mostrar estes atalhos", grupo: "Geral" },
  {
    teclas: [["Ctrl", "K"]],
    acao: "Paleta de comandos: buscar uma ação ou um livro pelo nome",
    grupo: "Geral",
  },
  { teclas: [["Tab"], ["Shift", "Tab"]], acao: "Ir para o próximo ou o anterior controle", grupo: "Geral" },
  { teclas: [["Esc"]], acao: "Fechar o painel ou o diálogo aberto", grupo: "Geral" },
];

/** Leitura, iguais nos dois formatos: modo foco e uma ideia por vez. */
const LEITURA: Atalho[] = [
  { teclas: [["Ctrl", "Shift", "F"]], acao: "Modo foco: só o livro na tela (Esc sai)", grupo: "Leitura" },
  {
    teclas: [["Ctrl", "Shift", "B"]],
    acao: "Uma ideia por vez: o livro passa a rolar e só o bloco atual fica em evidência, no meio da tela (Esc sai)",
    grupo: "Leitura",
  },
  { teclas: [["↑"], ["↓"]], acao: "Com a uma ideia por vez: bloco anterior ou seguinte", grupo: "Leitura" },
];

/** Destacar, igual nos dois formatos. */
const MARCAR: Atalho[] = [
  {
    teclas: [["Ctrl", "D"]],
    acao: "Destacar o trecho selecionado ou, sem seleção, a frase atual (abre a barra de cores; setas escolhem, Enter aplica)",
    grupo: "Marcar",
  },
  {
    teclas: [["Alt", "↑"], ["Alt", "↓"]],
    acao: "Na barra de destaque: frase anterior ou seguinte",
    grupo: "Marcar",
  },
  {
    teclas: [["Alt", "Shift", "↑"], ["Alt", "Shift", "↓"]],
    acao: "Na barra de destaque: encolher ou estender o trecho, uma frase por vez",
    grupo: "Marcar",
  },
];

/** Dois pontos lado a lado (M25), igual nos dois formatos. */
const COMPARAR: Atalho[] = [
  {
    teclas: [["Ctrl", "Shift", "L"]],
    acao: "Abrir ao lado o ponto em que o livro está (no PDF, na paleta: “ao lado 87”) ou fechar o lado",
    grupo: "Comparar",
  },
  { teclas: [["F6"]], acao: "Com o lado aberto: alternar o foco entre os lados", grupo: "Comparar" },
];

export const ATALHOS: Record<Contexto, Atalho[]> = {
  biblioteca: [
    { teclas: [["←"], ["→"], ["↑"], ["↓"]], acao: "Mover entre os livros", grupo: "Navegação" },
    { teclas: [["Home"], ["End"]], acao: "Ir para o primeiro ou o último livro", grupo: "Navegação" },
    { teclas: [["Enter"]], acao: "Abrir o livro selecionado", grupo: "Navegação" },
    { teclas: [["Ctrl", "F"]], acao: "Buscar na biblioteca", grupo: "Navegação" },
    {
      teclas: [["Shift", "F10"], ["Menu"]],
      acao: "Ações do livro selecionado (para ler, lido, lixeira)",
      grupo: "Livros",
    },
    {
      teclas: [["Delete"]],
      acao: "Mover o livro selecionado para a lixeira (na Lixeira: apagar de vez, pede confirmação)",
      grupo: "Livros",
    },
    {
      teclas: [["Ctrl", "O"]],
      acao: "Importar livros (também dá para arrastar os arquivos para a janela)",
      grupo: "Livros",
    },
    ...GERAIS,
  ],
  epub: [
    { teclas: [["←"], ["→"]], acao: "Página à esquerda ou à direita", grupo: "Navegação" },
    { teclas: [["Page Up"], ["Page Down"]], acao: "Página anterior ou seguinte", grupo: "Navegação" },
    ...LEITURA,
    ...MARCAR,
    ...COMPARAR,
    ...GERAIS,
  ],
  pdf: [
    {
      teclas: [["←"], ["→"]],
      acao: "Página anterior ou seguinte (com a página inteira na tela, ↑ e ↓ também)",
      grupo: "Navegação",
    },
    { teclas: [["Page Up"], ["Page Down"]], acao: "Página anterior ou seguinte", grupo: "Navegação" },
    { teclas: [["Ctrl", "F"]], acao: "Buscar no documento", grupo: "Navegação" },
    {
      teclas: [["Enter"], ["Shift", "Enter"]],
      acao: "Na busca: próxima ou anterior ocorrência",
      grupo: "Navegação",
    },
    { teclas: [["Ctrl", "+"], ["Ctrl", "−"]], acao: "Aumentar ou diminuir o zoom", grupo: "Leitura" },
    { teclas: [["Ctrl", "0"]], acao: "Ajustar à largura", grupo: "Leitura" },
    ...LEITURA,
    ...MARCAR,
    ...COMPARAR,
    ...GERAIS,
  ],
};

/** Os atalhos do contexto, por grupo, na ordem de `GRUPOS` (sem grupos vazios). */
export function porGrupo(contexto: Contexto): { grupo: Grupo; atalhos: Atalho[] }[] {
  return GRUPOS.map((grupo) => ({
    grupo,
    atalhos: ATALHOS[contexto].filter((a) => a.grupo === grupo),
  })).filter((g) => g.atalhos.length);
}

export const NOMES_CONTEXTO: Record<Contexto, string> = {
  biblioteca: "Biblioteca",
  epub: "Leitura de EPUB",
  pdf: "Leitura de PDF",
};
