// Destaques no leitor, iguais no EPUB e no PDF (M16): a lista, a barra sobre a seleção ou
// sobre um destaque, a nota, apagar com Desfazer, exportar e os comandos da paleta. O que
// muda de um formato para o outro (achar a seleção, desenhar, ir até o trecho) vem do
// adaptador que cada leitor passa.
import {
  apagarDestaque,
  criarDestaque,
  definirCorDestaque,
  definirMotivoDestaque,
  definirNotaDestaque,
  escolherDestinoMarkdown,
  exportarDestaques,
  listarDestaques,
  restaurarDestaque,
  type CorDestaque,
  type Destaque,
  type MotivoDestaque,
  type NovoDestaque,
} from "./biblioteca";
import { avisar } from "./avisos.svelte";
import type { Comando } from "./comandos";
import { MOTIVOS, nomeDaCor, nomeDoMotivo, resumo } from "./destaques";
import { log } from "./log";

/** Um trecho selecionado, já com o endereço no livro (falta só a cor e o motivo). */
export type Selecao = Omit<NovoDestaque, "cor" | "nota" | "motivo">;

/** Onde a barra aparece: centro e topo (ou base, com `abaixo`) do trecho, na janela. */
export interface PosicaoBarra {
  x: number;
  y: number;
  abaixo: boolean;
}

/** Alt+↑/↓ (outra frase) e Alt+Shift+↑/↓ (trecho menor ou maior) na barra. */
export type MudancaDeTrecho = "proxima" | "anterior" | "estender" | "encolher";

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
  /** A barra fechou (sem destaque novo ou depois dele): ex.: sair do modo frase. */
  aoFecharBarra?(): void;
}

/** Ordem de leitura, a mesma do core: posição, depois criação. */
function ordenar(lista: Destaque[]): Destaque[] {
  return lista.sort((a, b) => a.posicao - b.posicao || a.criadoEm - b.criadoEm || a.id - b.id);
}

export class ControleDestaques {
  lista = $state<Destaque[]>([]);
  /** A barra aberta: sobre a seleção (`destaque` null) ou sobre um destaque existente. */
  barra = $state<
    (PosicaoBarra & { focar: boolean; destaque: Destaque | null; doLado: boolean }) | null
  >(null);
  /** Destaque cuja nota está sendo editada. */
  notaDe = $state<Destaque | null>(null);
  /**
   * Os destaques fixados ao lado do texto (M25a), pelos ids, na ordem em que foram fixados: os
   * cartões mostram sempre a versão da lista (cor, nota e motivo novos), e o de um destaque
   * apagado some (volta com o Desfazer).
   */
  #fixadosIds = $state<number[]>([]);
  fixados = $derived(
    this.#fixadosIds.flatMap((id) => this.lista.find((d) => d.id === id) ?? []),
  );
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

  /**
   * Abre a barra sobre um trecho selecionado. `focar`: aberta pelo teclado (Ctrl+D). `doLado`: o
   * trecho está no lado novo (M25), onde a barra não oferece a voz, que é só do principal.
   */
  mostrarSelecao(selecao: Selecao, posicao: PosicaoBarra, focar: boolean, doLado = false): void {
    this.#selecao = selecao;
    this.barra = { ...posicao, focar, destaque: null, doLado };
  }

  /** Abre a barra sobre um destaque (clicado). */
  mostrarDestaque(destaque: Destaque, posicao: PosicaoBarra): void {
    this.#selecao = null;
    this.barra = { ...posicao, focar: false, destaque, doLado: false };
  }

  /** Esconde a barra sem mexer no foco (ex.: virou a página, clicou fora). */
  esconder(): void {
    if (!this.barra) return;
    this.barra = null;
    this.#a.aoFecharBarra?.();
  }

  /** Fecha a barra; se ela tinha o foco (teclado), devolve-o ao texto. */
  fecharBarra(): void {
    const tinhaFoco = !!document.activeElement?.closest(".barra-destaque");
    this.barra = null;
    this.#a.aoFecharBarra?.();
    if (tinhaFoco) this.#a.focarTexto();
  }

  #guardar(d: Destaque): void {
    this.lista = ordenar([...this.lista.filter((x) => x.id !== d.id), d]);
  }

  async #criar(
    cor: CorDestaque,
    motivo: MotivoDestaque | null = null,
  ): Promise<Destaque | undefined> {
    const selecao = this.#selecao;
    if (!selecao) return;
    try {
      const d = await criarDestaque(this.#a.livroId, { ...selecao, cor, motivo });
      this.#selecao = null;
      this.#guardar(d);
      this.#a.desenhar(d);
      this.#a.limparSelecao();
      const comMotivo = motivo ? ` (${nomeDoMotivo(motivo).toLowerCase()})` : "";
      this.#a.anunciar(`Destaque ${nomeDaCor(cor).toLowerCase()}${comMotivo} criado.`);
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

  /**
   * Motivo na barra: numa seleção, cria o destaque (amarelo) com ele; num destaque, liga ou
   * desliga (o mesmo motivo de novo o tira).
   */
  async escolherMotivo(motivo: MotivoDestaque): Promise<void> {
    const existente = this.barra?.destaque;
    this.fecharBarra();
    if (!existente) {
      await this.#criar("amarelo", motivo);
      return;
    }
    await this.definirMotivo(existente, existente.motivo === motivo ? null : motivo);
  }

  /** Define (ou tira, com null) o motivo de um destaque: barra e aba Destaques. */
  async definirMotivo(destaque: Destaque, motivo: MotivoDestaque | null): Promise<void> {
    try {
      this.#guardar(await definirMotivoDestaque(destaque.id, motivo));
      this.#a.anunciar(motivo ? `Motivo: ${nomeDoMotivo(motivo).toLowerCase()}.` : "Sem motivo.");
    } catch (erro) {
      avisar(`Não foi possível mudar o motivo: ${erro}`, "erro");
    }
  }

  estaFixado(destaque: Destaque): boolean {
    return this.#fixadosIds.includes(destaque.id);
  }

  /** Fixa o destaque ao lado do texto (depois dos já fixados). */
  fixar(destaque: Destaque): void {
    if (!this.estaFixado(destaque)) this.#fixadosIds = [...this.#fixadosIds, destaque.id];
    this.#a.anunciar("Destaque fixado ao lado.");
  }

  /** Tira o cartão; se o foco estava nos cartões (o botão some), devolve-o ao texto. */
  desafixar(destaque: Destaque): void {
    if (!this.estaFixado(destaque)) return;
    this.#tirarFixados(this.#fixadosIds.filter((id) => id !== destaque.id));
    this.#a.anunciar("Destaque desafixado.");
  }

  desafixarTodos(): void {
    this.#tirarFixados([]);
    this.#a.anunciar("Destaques desafixados.");
  }

  #tirarFixados(ficam: number[]): void {
    const tinhaFoco = !!document.activeElement?.closest(".area-fixado");
    this.#fixadosIds = ficam;
    if (tinhaFoco) this.#a.focarTexto();
  }

  /** O botão "Fixar ao lado" da aba Destaques: fixa ou desafixa. */
  alternarFixado(destaque: Destaque): void {
    if (this.estaFixado(destaque)) this.desafixar(destaque);
    else this.fixar(destaque);
  }

  /** "Fixar ao lado" na barra: num destaque, fixa (ou desafixa); numa seleção, cria e fixa. */
  async fixarDaBarra(): Promise<void> {
    const existente = this.barra?.destaque ?? null;
    this.fecharBarra();
    if (existente) {
      this.alternarFixado(existente);
      return;
    }
    const d = await this.#criar("amarelo");
    if (d) this.fixar(d);
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

  /** Exporta em Markdown todos os destaques ou, com `motivo`, só os dele. */
  async exportar(motivo: MotivoDestaque | null = null): Promise<void> {
    const sufixo = motivo ? `destaques (${nomeDoMotivo(motivo).toLowerCase()})` : "destaques";
    const nome = `${this.#a.titulo() || "Livro"} — ${sufixo}.md`.replace(/[/\\]/g, "-");
    const caminho = await escolherDestinoMarkdown(nome);
    if (!caminho) return;
    try {
      const n = await exportarDestaques(this.#a.livroId, caminho, motivo);
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
        titulo: "Destacar a seleção ou a frase atual",
        grupo: "Destaques",
        teclas: [["Ctrl", "D"]],
        palavras: "marca-texto grifar frase",
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
    for (const m of MOTIVOS)
      if (this.lista.some((d) => d.motivo === m.valor))
        lista.push({
          id: `exportar-${m.valor}`,
          titulo: `Exportar só ${m.exportar}…`,
          grupo: "Destaques",
          palavras: "markdown motivo",
          executar: () => void this.exportar(m.valor),
        });
    for (const d of this.fixados)
      lista.push(
        {
          id: `ir-ao-fixado-${d.id}`,
          titulo: `Ir ao fixado: ${resumo(d.trecho, 60)}`,
          grupo: "Destaques",
          palavras: "fixar lado comparar",
          executar: () => void this.#a.irPara(d),
        },
        {
          id: `desafixar-${d.id}`,
          titulo: `Desafixar: ${resumo(d.trecho, 60)}`,
          grupo: "Destaques",
          palavras: "fixar lado fechar cartão",
          executar: () => this.desafixar(d),
        },
      );
    if (this.fixados.length > 1)
      lista.push({
        id: "desafixar-todos",
        titulo: "Desafixar todos",
        grupo: "Destaques",
        palavras: "fixar lado fechar cartões destaques",
        executar: () => this.desafixarTodos(),
      });
    for (const d of this.lista) {
      const dica = d.motivo ? `${nomeDaCor(d.cor)} · ${nomeDoMotivo(d.motivo)}` : nomeDaCor(d.cor);
      lista.push({
        id: `destaque-${d.id}`,
        titulo: `Ir para destaque: ${resumo(d.trecho, 60)}`,
        grupo: "Destaques",
        dica,
        palavras: d.nota ?? "",
        executar: () => void this.#a.irPara(d),
      });
      if (!this.estaFixado(d))
        lista.push({
          id: `fixar-${d.id}`,
          titulo: `Fixar ao lado: ${resumo(d.trecho, 60)}`,
          grupo: "Destaques",
          dica,
          palavras: `comparar ${d.nota ?? ""}`,
          executar: () => this.fixar(d),
        });
    }
    return lista;
  }
}
