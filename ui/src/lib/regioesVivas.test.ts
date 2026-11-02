import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observarRegioesVivas } from "./regioesVivas";

describe("observarRegioesVivas", () => {
  let raiz: HTMLElement;
  let falar: ReturnType<typeof vi.fn<(texto: string) => void>>;
  let parar: () => void;

  async function passar(ms = 200) {
    await Promise.resolve(); // o MutationObserver entrega numa microtarefa
    vi.advanceTimersByTime(ms);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    raiz = document.createElement("div");
    raiz.innerHTML = `<p id="viva" aria-live="polite"></p><div id="status" role="status"></div><p id="comum"></p>`;
    document.body.append(raiz);
    falar = vi.fn<(texto: string) => void>();
    parar = observarRegioesVivas(raiz, falar);
  });

  afterEach(() => {
    parar();
    raiz.remove();
    vi.useRealTimers();
  });

  const el = (id: string) => raiz.querySelector<HTMLElement>(`#${id}`)!;

  it("fala o texto novo de uma região viva", async () => {
    el("viva").textContent = "Seção:   Capítulo 3";
    await passar();
    expect(falar).toHaveBeenCalledExactlyOnceWith("Seção: Capítulo 3");
  });

  it("ignora o que não é região viva e o texto apagado", async () => {
    el("comum").textContent = "nada";
    el("viva").textContent = "";
    await passar();
    expect(falar).not.toHaveBeenCalled();
  });

  it("enquanto o texto muda depressa, fala só o último", async () => {
    el("status").textContent = "3 comandos";
    await passar(50);
    el("status").textContent = "1 comando";
    await passar();
    expect(falar).toHaveBeenCalledExactlyOnceWith("1 comando");
  });

  it("o mesmo texto volta a ser falado depois de apagado", async () => {
    el("viva").textContent = "Modo foco";
    await passar();
    el("viva").textContent = "";
    await passar();
    el("viva").textContent = "Modo foco";
    await passar();
    expect(falar).toHaveBeenCalledTimes(2);
  });

  it("com vários avisos, fala só o que entrou e cala o que saiu", async () => {
    el("status").innerHTML = "<p>Um</p>";
    await passar();
    el("status").insertAdjacentHTML("beforeend", "<p>Dois</p>");
    await passar();
    el("status").firstElementChild!.remove();
    await passar();
    expect(falar.mock.calls.map(([t]) => t)).toEqual(["Um", "Dois"]);
  });

  it("alerta ou status que entra na página com texto é falado; aria-live não", async () => {
    raiz.insertAdjacentHTML("beforeend", `<div><p role="alert">Senha incorreta</p></div>`);
    raiz.insertAdjacentHTML("beforeend", `<output aria-live="polite">100%</output>`);
    await passar();
    expect(falar).toHaveBeenCalledExactlyOnceWith("Senha incorreta");
  });
});
