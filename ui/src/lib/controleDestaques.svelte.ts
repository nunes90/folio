// Destaques no leitor, iguais no EPUB e no PDF (M16): a lista, a barra sobre a seleção ou
// sobre um destaque, a nota, apagar com Desfazer, exportar e os comandos da paleta. O que
// muda de um formato para o outro (achar a seleção, desenhar, ir até o trecho) vem do
// adaptador que cada leitor passa.
import {
  apagarDestaque,
  criarDestaque,
  definirCorDestaque,
  definirNotaDestaque,
  escolherDestinoMarkdown,
  exportarDestaques,
  listarDestaques,
  restaurarDestaque,
  type CorDestaque,
  type Destaque,
  type NovoDestaque,
} from "./biblioteca";
import { avisar } from "./avisos.svelte";
import type { Comando } from "./comandos";
import { nomeDaCor, resumo } from "./destaques";
import { log } from "./log";

/** Um trecho selecionado, já com o endereço no livro (falta só a cor). */
export type Selecao = Omit<NovoDestaque, "cor" | "nota">;

/** Onde a barra aparece: centro e topo (ou base, com `abaixo`) do trecho, na janela. */
export interface PosicaoBarra {
  x: number;
  y: number;
  abaixo: boolean;
}

/** O que cada formato faz do seu jeito. */
export interface AdaptadorDestaques {
  livroId: string;
  /** Título do livro (nome sugerido ao exportar). */
  titulo(): string;
  /** Desenha (ou redesenha, com a cor nova) o destaque, se a página dele estiver na tela. */
  desenhar(destaque: Destaque): void;
  apagarDesenho(destaque: Destaque): void;
  irPara(destaque: Destaque): Promise<void>;
  /** Devolve o foco ao texto do livro. */
  focarTexto(): void;
  limparSelecao(): void;
  /** Texto para o leitor de tela (região aria-live do leitor). */
  anunciar(texto: string): void;
  /** Abre o painel na aba Destaques. */
  mostrarLista(): Promise<void>;
}

/** Ordem de leitura, a mesma do core: posição, depois criação. */
function ordenar(lista: Destaque[]): Destaque[] {
  return lista.sort((a, b) => a.posicao - b.posicao || a.criadoEm - b.criadoEm || a.id - b.id);
}

export class ControleDestaques {
  lista = $state<Destaque[]>([]);
  /** A barra aberta: sobre a seleção (`destaque` null) ou sobre um destaque existente. */
  barra = $state<(PosicaoBarra & { focar: boolean; destaque: Destaque | null }) | null>(null);
  /** Destaque cuja nota está sendo editada. */
  notaDe = $state<Destaque | null>(null);
  #selecao: Selecao | null = null;
  #a: AdaptadorDestaques;

  constructor(adaptador: AdaptadorDestaques) {
    this.#a = adaptador;
  }

  async carregar(): Promise<void> {
    try {
      this.lista = await listarDestaques(this.#a.livroId);
    } catch (erro) {
      log.warn(`destaques indisponíveis: ${erro}`);
    }
  }

  porLocal(local: string): Destaque | undefined {
    return this.lista.find((d) => d.local === local);
  }

  /** Abre a barra sobre um trecho selecionado. `focar`: aberta pelo teclado (Ctrl+D). */
  mostrarSelecao(selecao: Selecao, posicao: PosicaoBarra, focar: boolean): void {
    this.#selecao = selecao;
    this.barra = { ...posicao, focar, destaque: null };
  }

  /** Abre a barra sobre um destaque (clicado). */
  mostrarDestaque(destaque: Destaque, posicao: PosicaoBarra): void {
    this.#selecao = null;
    this.barra = { ...posicao, focar: false, destaque };
  }

  /** Esconde a barra sem mexer no foco (ex.: virou a página, clicou fora). */
  esconder(): void {
    this.barra = null;
  }

  /** Fecha a barra; se ela tinha o foco (teclado), devolve-o ao texto. */
  fecharBarra(): void {
    const tinhaFoco = !!document.activeElement?.closest(".barra-destaque");
    this.barra = null;
    if (tinhaFoco) this.#a.focarTexto();
  }

  #guardar(d: Destaque): void {
    this.lista = ordenar([...this.lista.filter((x) => x.id !== d.id), d]);
  }

  async #criar(cor: CorDestaque): Promise<Destaque | undefined> {
    const selecao = this.#selecao;
    if (!selecao) return;
    try {
      const d = await criarDestaque(this.#a.livroId, { ...selecao, cor });
      this.#selecao = null;
      this.#guardar(d);
      this.#a.desenhar(d);
      this.#a.limparSelecao();
      this.#a.anunciar(`Destaque ${nomeDaCor(cor).toLowerCase()} criado.`);
      return d;
    } catch (erro) {
      avisar(`Não foi possível criar o destaque: ${erro}`, "erro");
    }
  }

  /** Cor escolhida na barra: cria o destaque da seleção ou muda a do destaque. */
  async escolherCor(cor: CorDestaque): Promise<void> {
    const existente = this.barra?.destaque;
    this.fecharBarra();
    if (!existente) {
      await this.#criar(cor);
      return;
    }
    try {
      const d = await definirCorDestaque(existente.id, cor);
      this.#guardar(d);
      this.#a.desenhar(d);
      this.#a.anunciar(`Destaque agora ${nomeDaCor(cor).toLowerCase()}.`);
    } catch (erro) {
      avisar(`Não foi possível mudar a cor: ${erro}`, "erro");
    }
  }

  /** Nota na barra: num destaque, edita; numa seleção, cria o destaque (amarelo) e abre a nota. */
  async pedirNota(): Promise<void> {
    const existente = this.barra?.destaque ?? null;
    this.fecharBarra();
    this.notaDe = existente ?? (await this.#criar("amarelo")) ?? null;
  }

  editarNota(destaque: Destaque): void {
    this.notaDe = destaque;
  }

  async salvarNota(nota: string): Promise<void> {
    const d = this.notaDe;
    this.notaDe = null;
    if (!d) return;
    try {
      this.#guardar(await definirNotaDestaque(d.id, nota));
      this.#a.anunciar(nota.trim() ? "Nota salva." : "Nota apagada.");
    } catch (erro) {
      avisar(`Não foi possível salvar a nota: ${erro}`, "erro");
    }
    this.#a.focarTexto();
  }

  cancelarNota(): void {
    this.notaDe = null;
    this.#a.focarTexto();
  }

  async copiar(): Promise<void> {
    const texto = this.barra?.destaque?.trecho ?? this.#selecao?.trecho ?? "";
    this.fecharBarra();
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Trecho copiado.");
    } catch (erro) {
      avisar(`Não foi possível copiar: ${erro}`, "erro");
    }
  }

  async apagar(destaque: Destaque): Promise<void> {
    if (this.barra) this.fecharBarra();
    try {
      const apagado = await apagarDestaque(destaque.id);
      this.lista = this.lista.filter((x) => x.id !== apagado.id);
      this.#a.apagarDesenho(apagado);
      avisar("Destaque apagado.", "sucesso", {
        rotulo: "Desfazer",
        executar: () => void this.restaurar(apagado),
      });
    } catch (erro) {
      avisar(`Não foi possível apagar o destaque: ${erro}`, "erro");
    }
  }

  async restaurar(destaque: Destaque): Promise<void> {
    try {
      const d = await restaurarDestaque(destaque);
      this.#guardar(d);
      this.#a.desenhar(d);
      avisar("Destaque restaurado.");
    } catch (erro) {
      avisar(`Não foi possível restaurar o destaque: ${erro}`, "erro");
    }
  }

  async exportar(): Promise<void> {
    const nome = `${this.#a.titulo() || "Livro"} — destaques.md`.replace(/[/\\]/g, "-");
    const caminho = await escolherDestinoMarkdown(nome);
    if (!caminho) return;
    try {
      const n = await exportarDestaques(this.#a.livroId, caminho);
      avisar(n === 1 ? "1 destaque exportado." : `${n} destaques exportados.`);
    } catch (erro) {
      avisar(`Não foi possível exportar: ${erro}`, "erro");
    }
  }

  /** Comandos da paleta; `destacarSelecao` é o Ctrl+D do leitor. */
  comandos(destacarSelecao: () => void): Comando[] {
    const lista: Comando[] = [
      {
        id: "destacar",
        titulo: "Destacar a seleção",
        grupo: "Destaques",
        teclas: [["Ctrl", "D"]],
        palavras: "marca-texto grifar",
        executar: destacarSelecao,
      },
      {
        id: "mostrar-destaques",
        titulo: "Mostrar os destaques",
        grupo: "Destaques",
        palavras: "notas",
        executar: () => void this.#a.mostrarLista(),
      },
    ];
    if (this.lista.length)
      lista.push({
        id: "exportar-destaques",
        titulo: "Exportar os destaques…",
        grupo: "Destaques",
        palavras: "markdown notas",
        executar: () => void this.exportar(),
      });
    for (const d of this.lista)
      lista.push({
        id: `destaque-${d.id}`,
        titulo: `Ir para destaque: ${resumo(d.trecho, 60)}`,
        grupo: "Destaques",
        dica: nomeDaCor(d.cor),
        palavras: d.nota ?? "",
        executar: () => void this.#a.irPara(d),
      });
    return lista;
  }
}
