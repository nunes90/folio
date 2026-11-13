// O que a paleta de comandos oferece, conforme a tela (M34d; antes, dentro do App.svelte): na
// biblioteca, importar, buscar, as estantes, as coleções e "Abrir <livro>"; no leitor, voltar e os
// comandos que o leitor publica; nas duas, a interface, as animações, os atalhos e o Sobre.
import type { Colecao, Livro } from "./biblioteca";
import type { Comando } from "./comandos";
import type { Filtro } from "./filtro";
import type { Movimento, Preferencias } from "./preferencias.svelte";
import type { TemaEscolhido } from "./temas";

const NOMES_TEMA: [TemaEscolhido, string][] = [
  ["sistema", "do sistema"],
  ["claro", "claro"],
  ["escuro", "escuro"],
  ["alto-contraste", "alto contraste"],
];
const NOMES_MOVIMENTO: [Movimento, string][] = [
  ["sistema", "seguir o sistema"],
  ["reduzido", "sempre reduzir"],
];
const ESTANTES: [Filtro, string][] = [
  ["todos", "Todos"],
  ["favoritos", "Favoritos"],
  ["lendo", "Lendo"],
  ["para-ler", "Para ler"],
  ["lidos", "Lidos"],
  ["autores", "Autores"],
  ["lixeira", "Lixeira"],
];

/** O que o app mostra agora. */
export interface EstadoDoApp {
  /** Um livro está aberto (a tela é o leitor, não a biblioteca). */
  lendo: boolean;
  importando: boolean;
  livros: Livro[];
  colecoes: Colecao[];
  /** Há livros na lixeira ("Esvaziar lixeira…" só aparece se houver). */
  lixeiraComLivros: boolean;
  preferencias: Pick<Preferencias, "tema" | "movimento">;
  /** Os comandos que o leitor aberto publica. */
  doLeitor: Comando[];
}

/** O que cada comando faz (o App liga às telas e aos diálogos). */
export interface AcoesDoApp {
  importar(): void;
  buscarNaBiblioteca(): void;
  mostrar(filtro: Filtro): void;
  novaColecao(): void;
  esvaziarLixeira(): void;
  /** Cópia de segurança (M38): exportar (com ou sem os arquivos dos livros) e restaurar. */
  exportarBiblioteca(comLivros: boolean): void;
  restaurarCopia(): void;
  voltarABiblioteca(): void;
  mudarPreferencias(mudancas: Partial<Preferencias>): void;
  mostrarAtalhos(): void;
  mostrarSobre(): void;
  abrir(livro: Livro): void;
}

export function comandosDoApp(estado: EstadoDoApp, acoes: AcoesDoApp): Comando[] {
  const lista: Comando[] = [];
  if (!estado.lendo) {
    if (!estado.importando)
      lista.push({
        id: "importar",
        titulo: "Importar livros…",
        grupo: "Biblioteca",
        teclas: [["Ctrl", "O"]],
        executar: acoes.importar,
      });
    lista.push({
      id: "buscar",
      titulo: "Buscar na biblioteca",
      grupo: "Biblioteca",
      teclas: [["Ctrl", "F"]],
      executar: acoes.buscarNaBiblioteca,
    });
    for (const [filtro, nome] of ESTANTES)
      lista.push({
        id: `estante-${filtro}`,
        titulo: `Estante: ${nome}`,
        grupo: "Estantes",
        executar: () => acoes.mostrar(filtro),
      });
    for (const colecao of estado.colecoes)
      lista.push({
        id: `colecao-${colecao.id}`,
        titulo: `Coleção: ${colecao.nome}`,
        grupo: "Coleções",
        executar: () => acoes.mostrar(`colecao:${colecao.id}`),
      });
    lista.push({
      id: "nova-colecao",
      titulo: "Nova coleção…",
      grupo: "Coleções",
      executar: acoes.novaColecao,
    });
    if (estado.lixeiraComLivros)
      lista.push({
        id: "esvaziar",
        titulo: "Esvaziar lixeira…",
        grupo: "Lixeira",
        executar: acoes.esvaziarLixeira,
      });
    lista.push({
      id: "restaurar-copia",
      titulo: "Restaurar uma cópia de segurança…",
      grupo: "Cópia de segurança",
      palavras: "backup importar recuperar",
      executar: acoes.restaurarCopia,
    });
  } else {
    lista.push({
      id: "voltar",
      titulo: "Voltar à biblioteca",
      grupo: "Leitura",
      executar: acoes.voltarABiblioteca,
    });
    lista.push(...estado.doLeitor);
  }
  for (const [tema, nome] of NOMES_TEMA)
    lista.push({
      id: `tema-${tema}`,
      titulo: `Interface: ${nome}`,
      grupo: "Aparência",
      dica: estado.preferencias.tema === tema ? "atual" : undefined,
      palavras: "tema cores",
      executar: () => acoes.mudarPreferencias({ tema }),
    });
  for (const [movimento, nome] of NOMES_MOVIMENTO)
    lista.push({
      id: `movimento-${movimento}`,
      titulo: `Animações: ${nome}`,
      grupo: "Aparência",
      dica: estado.preferencias.movimento === movimento ? "atual" : undefined,
      palavras: "movimento reduzir",
      executar: () => acoes.mudarPreferencias({ movimento }),
    });
  // Exportar não mexe em nada: vale também com um livro aberto. Restaurar troca a biblioteca
  // inteira, então só na biblioteca.
  lista.push(
    {
      id: "exportar-dados",
      titulo: "Exportar a biblioteca: só os dados…",
      grupo: "Cópia de segurança",
      dica: "progresso, destaques, coleções e preferências",
      palavras: "backup cópia de segurança salvar",
      executar: () => acoes.exportarBiblioteca(false),
    },
    {
      id: "exportar-tudo",
      titulo: "Exportar a biblioteca: com os livros…",
      grupo: "Cópia de segurança",
      dica: "os dados e os arquivos dos livros",
      palavras: "backup cópia de segurança salvar",
      executar: () => acoes.exportarBiblioteca(true),
    },
  );
  lista.push({
    id: "atalhos",
    titulo: "Mostrar atalhos de teclado",
    grupo: "Ajuda",
    teclas: [["F1"]],
    executar: acoes.mostrarAtalhos,
  });
  lista.push({
    id: "sobre",
    titulo: "Sobre o Folio",
    grupo: "Ajuda",
    palavras: "versão licença",
    executar: acoes.mostrarSobre,
  });
  // Livros por último: são muitos, e o nome do comando costuma ser o que se procura.
  if (!estado.lendo)
    for (const livro of estado.livros)
      lista.push({
        id: `livro-${livro.id}`,
        titulo: `Abrir ${livro.titulo}`,
        grupo: livro.formato.toUpperCase(),
        dica: livro.autores.join(", ") || undefined,
        executar: () => acoes.abrir(livro),
      });
  return lista;
}
