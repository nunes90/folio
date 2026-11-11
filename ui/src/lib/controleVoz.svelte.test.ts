import { beforeEach, describe, expect, it, vi } from "vitest";
import { ControleVoz, type AdaptadorVoz, type MotorDoControle } from "./controleVoz.svelte";
import type { EventoVoz } from "./voz";
import { SEM_VOZ } from "./vozNatural.svelte";

/** Um motor de mentira: guarda o que foi falado e deixa o teste mandar os eventos. */
function motorFalso() {
  let aoEvento: (e: EventoVoz) => void = () => {};
  const falado: string[] = [];
  const motor: MotorDoControle & { falhar?: unknown } = {
    falar: vi.fn(async (ssml: string) => {
      if (motor.falhar) throw motor.falhar;
      falado.push(ssml);
    }),
    parar: vi.fn(async () => {}),
    disponivel: vi.fn(async () => true),
    ouvir: vi.fn(async (f) => {
      aoEvento = f;
      return () => {};
    }),
  };
  return { motor, falado, evento: (e: EventoVoz) => aoEvento(e) };
}

/** Um "livro" de três blocos: cada um é falado inteiro, e `seguir` passa ao próximo. */
function livroFalso(blocos = ["um", "dois", "três"]) {
  const chamadas: string[] = [];
  const anuncios: string[] = [];
  let atual = 0;
  let voz!: ControleVoz<number>;
  const falarAtual = async () => {
    const bloco = blocos[atual];
    if (bloco === undefined) voz.acabou("Fim do livro.");
    else await voz.falar(bloco, { idioma: null, velocidade: 0 });
  };
  const adaptador: AdaptadorVoz<number> = {
    comecar: async (desde = 0) => {
      atual = desde;
      await falarAtual();
    },
    aoMarcar: (marca) => chamadas.push(`marca ${marca}`),
    seguir: async () => {
      atual++;
      await falarAtual();
    },
    retomar: async () => {
      chamadas.push("retomar");
      await falarAtual();
    },
    aoParar: () => chamadas.push("parou"),
    mostrarFrase: (frase) => chamadas.push(`frase ${frase.toString()}`),
    blocoDoTrecho: (frases, desde) =>
      frases.length > desde
        ? { ssml: `trecho desde ${desde}`, config: { idioma: null, velocidade: 0 } }
        : null,
    anunciar: (texto) => anuncios.push(texto),
  };
  return { adaptador, chamadas, anuncios, ligar: (v: ControleVoz<number>) => (voz = v) };
}

function frases(...textos: string[]): Range[] {
  return textos.map((texto) => {
    const p = document.createElement("p");
    p.textContent = texto;
    document.body.append(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    return range;
  });
}

async function montar(blocos?: string[]) {
  const m = motorFalso();
  const livro = livroFalso(blocos);
  const voz = new ControleVoz<number>(livro.adaptador, m.motor);
  livro.ligar(voz);
  voz.ligar();
  voz.conferir();
  await Promise.resolve();
  await Promise.resolve();
  return { voz, ...m, ...livro };
}

describe("ControleVoz", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("lê o livro bloco a bloco e anuncia o fim", async () => {
    const { voz, falado, evento, anuncios, chamadas } = await montar();
    await voz.ler();
    expect(voz.estado).toBe("falando");
    evento({ tipo: "marca", marca: "0" });
    evento({ tipo: "fim" });
    await Promise.resolve();
    evento({ tipo: "fim" });
    await Promise.resolve();
    expect(falado).toEqual(["um", "dois", "três"]);
    evento({ tipo: "fim" });
    await Promise.resolve();
    expect(voz.estado).toBe("parado");
    expect(anuncios).toEqual(["Fim do livro."]);
    expect(chamadas).toEqual(["marca 0", "parou"]);
  });

  it("sem voz, só avisa", async () => {
    const { voz, motor, anuncios } = await montar();
    voz.possivel = false;
    await voz.ler();
    await voz.ouvirTrecho(frases("a"));
    expect(motor.falar).not.toHaveBeenCalled();
    expect(anuncios).toEqual([SEM_VOZ, SEM_VOZ]);
  });

  it("pausar cancela a fala e retomar fala de novo de onde parou", async () => {
    const { voz, motor, chamadas, evento } = await montar();
    await voz.ler();
    const vez = voz.vez;
    await voz.pausarOuRetomar();
    expect(voz.estado).toBe("pausado");
    expect(motor.parar).toHaveBeenCalledTimes(1);
    // Quem esperava com a vez antiga desiste.
    expect(voz.vez).not.toBe(vez);
    // Um evento atrasado da fala cancelada não faz nada.
    evento({ tipo: "fim" });
    expect(motor.falar).toHaveBeenCalledTimes(1);
    await voz.pausarOuRetomar();
    expect(chamadas).toEqual(["retomar"]);
    expect(voz.estado).toBe("falando");
  });

  it("parar limpa tudo e ignora os eventos seguintes", async () => {
    const { voz, motor, chamadas, evento } = await montar();
    await voz.ler();
    voz.fraseLida = frases("lida")[0]!;
    await voz.parar();
    expect(voz.estado).toBe("parado");
    expect(voz.fraseLida).toBe(null);
    expect(chamadas).toEqual(["parou"]);
    evento({ tipo: "marca", marca: "3" });
    evento({ tipo: "fim" });
    expect(chamadas).toEqual(["parou"]);
    expect(motor.falar).toHaveBeenCalledTimes(1);
  });

  it("ler de novo, já lendo, recomeça do ponto pedido", async () => {
    const { voz, motor, falado } = await montar();
    await voz.ler();
    await voz.ler(2);
    expect(motor.parar).toHaveBeenCalledTimes(1);
    expect(falado).toEqual(["um", "três"]);
  });

  it("interrompido pelo motor: a leitura para", async () => {
    const { voz, evento } = await montar();
    await voz.ler();
    evento({ tipo: "interrompido" });
    expect(voz.estado).toBe("parado");
  });

  it("um erro ao falar para a leitura e diz o motivo", async () => {
    const { voz, motor, anuncios, chamadas } = await montar();
    motor.falhar = "não há voz para o idioma es";
    await voz.ler();
    expect(voz.estado).toBe("parado");
    expect(chamadas).toEqual(["parou"]);
    expect(anuncios).toHaveLength(1);
    expect(anuncios[0]).toContain("es");
  });

  describe("Ouvir (só o trecho)", () => {
    it("fala o trecho, realça cada frase e para no fim, sem seguir pelo livro", async () => {
      const { voz, falado, evento, chamadas } = await montar();
      const [a, b] = frases("Primeira.", "Segunda.");
      await voz.ouvirTrecho([a!, b!]);
      expect(falado).toEqual(["trecho desde 0"]);
      evento({ tipo: "marca", marca: "1" });
      expect(chamadas).toEqual(["frase Segunda."]);
      expect(voz.fraseLida).toBe(b);
      evento({ tipo: "fim" });
      await Promise.resolve();
      expect(voz.estado).toBe("parado");
      expect(falado).toEqual(["trecho desde 0"]);
    });

    it("pausado, continua da frase em que parou", async () => {
      const { voz, falado, evento } = await montar();
      await voz.ouvirTrecho(frases("Primeira.", "Segunda.", "Terceira."));
      evento({ tipo: "marca", marca: "1" });
      await voz.pausarOuRetomar();
      await voz.pausarOuRetomar();
      expect(falado).toEqual(["trecho desde 0", "trecho desde 1"]);
      expect(voz.estado).toBe("falando");
    });

    it("lendo o livro, para a leitura antes; sem frases, não faz nada", async () => {
      const { voz, motor, falado } = await montar();
      await voz.ouvirTrecho([]);
      expect(motor.falar).not.toHaveBeenCalled();
      await voz.ler();
      await voz.ouvirTrecho(frases("Só esta."));
      expect(motor.parar).toHaveBeenCalledTimes(1);
      expect(falado).toEqual(["um", "trecho desde 0"]);
    });

    it("depois do trecho, Ler em voz alta volta a ler o livro", async () => {
      const { voz, falado, evento } = await montar();
      await voz.ouvirTrecho(frases("Só esta."));
      await voz.ler(1);
      evento({ tipo: "fim" });
      await Promise.resolve();
      expect(falado).toEqual(["trecho desde 0", "dois", "três"]);
    });
  });

  describe("Ctrl+D com a voz lendo", () => {
    it("pausa, devolve a frase lida e retoma quando a barra fecha", async () => {
      const { voz, chamadas } = await montar();
      await voz.ler();
      const lida = frases("A frase lida.")[0]!;
      voz.fraseLida = lida;
      expect(await voz.pausarParaDestacar()).toBe(lida);
      expect(voz.estado).toBe("pausado");
      expect(voz.retomarDepoisDaBarra()).toBe(true);
      await Promise.resolve();
      expect(chamadas).toEqual(["retomar"]);
      // Só uma vez.
      expect(voz.retomarDepoisDaBarra()).toBe(false);
    });

    it("com a voz parada, não há o que pausar nem retomar", async () => {
      const { voz, motor } = await montar();
      expect(await voz.pausarParaDestacar()).toBe(null);
      expect(voz.retomarDepoisDaBarra()).toBe(false);
      expect(motor.parar).not.toHaveBeenCalled();
    });

    it("o Ouvir da barra cancela a retomada", async () => {
      const { voz, chamadas } = await montar();
      await voz.ler();
      await voz.pausarParaDestacar();
      voz.naoRetomar();
      expect(voz.retomarDepoisDaBarra()).toBe(false);
      expect(chamadas).toEqual([]);
    });
  });

  it("os comandos da paleta seguem o estado", async () => {
    const { voz } = await montar();
    expect(voz.comandos().map((c) => c.id)).toEqual(["voz-ler"]);
    await voz.ler();
    expect(voz.comandos().map((c) => c.id)).toContain("voz-pausar");
  });

  it("desligar para a fala e deixa de ouvir o motor", async () => {
    const m = motorFalso();
    const livro = livroFalso();
    const voz = new ControleVoz<number>(livro.adaptador, m.motor);
    livro.ligar(voz);
    const desligar = voz.ligar();
    voz.possivel = true;
    await voz.ler();
    desligar();
    expect(m.motor.parar).toHaveBeenCalledTimes(1);
  });
});
