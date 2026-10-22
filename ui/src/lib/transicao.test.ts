import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preferencias } from "./preferencias.svelte";
import {
  aguardarTransicao,
  ATRIBUTO_AREA,
  ATRIBUTO_CAPA,
  ATRIBUTO_TELA,
  transformParaArea,
  transicionar,
} from "./transicao";

/** Elemento com um retângulo fixo (o jsdom não calcula layout). */
function comRetangulo(el: HTMLElement, x: number, y: number, w: number, h: number) {
  el.getBoundingClientRect = () => new DOMRect(x, y, w, h);
  return el;
}

function biblioteca() {
  document.body.innerHTML = "";
  const tela = document.createElement("main");
  tela.setAttribute(ATRIBUTO_TELA, "");
  const capa = comRetangulo(document.createElement("img"), 10, 20, 100, 150);
  capa.setAttribute(ATRIBUTO_CAPA, "livro-1");
  tela.append(capa);
  document.body.append(tela);
}

function leitor() {
  document.body.innerHTML = "";
  const tela = document.createElement("div");
  tela.setAttribute(ATRIBUTO_TELA, "");
  const area = comRetangulo(document.createElement("div"), 0, 50, 800, 600);
  area.setAttribute(ATRIBUTO_AREA, "");
  tela.append(area);
  document.body.append(tela);
}

let animar: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  animar = vi.spyOn(Element.prototype, "animate");
});
afterEach(() => {
  animar.mockRestore();
  preferencias.movimento = "sistema";
  document.body.innerHTML = "";
});

const quadros = (chamada: number) => animar.mock.calls[chamada]![0] as Keyframe[];

describe("transformParaArea", () => {
  it("escala a capa sem distorcer até a altura da área, centralizada", () => {
    // Capa 100×150 em (10,20); área 800×600 em (0,50): escala 4, largura 400, centro em 200.
    expect(transformParaArea(new DOMRect(10, 20, 100, 150), new DOMRect(0, 50, 800, 600))).toBe(
      "translate(190px, 30px) scale(4)",
    );
  });
});

describe("transicionar", () => {
  it("ao abrir, só transform e opacity: a capa cresce até a área e se dissolve", async () => {
    biblioteca();
    await transicionar("livro-1", "abrir", leitor);
    expect(quadros(0)).toEqual([
      { transform: "translate(0px, 0px) scale(1)" },
      { transform: "translate(190px, 30px) scale(4)" },
    ]);
    expect(quadros(1)).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(quadros(2)).toEqual([{ opacity: 0 }, { opacity: 1 }]); // a tela nova aparece
    for (const [q] of animar.mock.calls) {
      for (const quadro of q as Keyframe[]) {
        expect(Object.keys(quadro).every((k) => k === "transform" || k === "opacity")).toBe(true);
      }
    }
    expect(document.querySelector("[aria-hidden]")).toBeNull(); // o fantasma foi removido
  });

  it("ao fechar, o caminho inverso, com a capa real escondida até o fantasma pousar", async () => {
    leitor();
    let visibilidadeDurante = "";
    animar.mockImplementationOnce(function () {
      visibilidadeDurante = document.querySelector<HTMLElement>(`[${ATRIBUTO_CAPA}]`)!.style
        .visibility;
      return { finished: Promise.resolve() } as unknown as Animation;
    });
    await transicionar("livro-1", "fechar", biblioteca);
    expect(quadros(0)).toEqual([
      { transform: "translate(190px, 30px) scale(4)" },
      { transform: "translate(0px, 0px) scale(1)" },
    ]);
    expect(visibilidadeDurante).toBe("hidden");
    expect(document.querySelector<HTMLElement>(`[${ATRIBUTO_CAPA}]`)!.style.visibility).toBe("");
  });

  it("aguardarTransicao só resolve quando a animação termina", async () => {
    biblioteca();
    let liberar!: () => void;
    animar.mockImplementationOnce(
      () => ({ finished: new Promise<void>((r) => (liberar = r)) }) as unknown as Animation,
    );
    let esperou = false;
    const transicao = transicionar("livro-1", "abrir", () => {
      leitor();
      aguardarTransicao().then(() => (esperou = true));
    });
    await new Promise((r) => setTimeout(r));
    expect(esperou).toBe(false);
    liberar();
    await transicao;
    await Promise.resolve();
    expect(esperou).toBe(true);
  });

  it("com movimento reduzido, só troca a tela", async () => {
    preferencias.movimento = "reduzido";
    biblioteca();
    const atualizar = vi.fn(leitor);
    await transicionar("livro-1", "abrir", atualizar);
    expect(atualizar).toHaveBeenCalledOnce();
    expect(animar).not.toHaveBeenCalled();
    await expect(aguardarTransicao()).resolves.toBeUndefined();
  });

  it("sem a capa na tela (ex.: livro aberto pela linha de comando), só troca", async () => {
    document.body.innerHTML = "";
    const atualizar = vi.fn(leitor);
    await transicionar("livro-1", "abrir", atualizar);
    expect(atualizar).toHaveBeenCalledOnce();
    expect(animar).not.toHaveBeenCalled();
  });
});
