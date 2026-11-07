import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, ouvintes } = vi.hoisted(() => ({
  invoke: vi.fn(),
  ouvintes: [] as ((e: { payload: unknown }) => void)[],
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_: string, f: (e: { payload: unknown }) => void) => {
    ouvintes.push(f);
    return Promise.resolve(() => {});
  }),
}));

import { PADRAO, type Preferencias } from "../lib/preferencias.svelte";
import PainelVoz from "./PainelVoz.svelte";

function catalogo(
  instalado: boolean,
  espeak = true,
  baixando: string | null = null,
) {
  return {
    modelos: [
      {
        id: "kokoro",
        nome: "Kokoro",
        licenca: "Apache-2.0",
        tamanho: 152_000_000,
        instalado,
        vozes: [
          {
            id: "af_heart",
            nome: "Heart",
            idioma: "en-US",
            genero: "feminina",
          },
          {
            id: "bm_george",
            nome: "George",
            idioma: "en-GB",
            genero: "masculina",
          },
        ],
      },
    ],
    baixando,
    espeak,
  };
}

let estado = catalogo(false);

beforeEach(() => {
  estado = catalogo(false);
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) =>
    Promise.resolve(cmd === "vozes_naturais" ? estado : undefined),
  );
});

function renderizar(mudancas: Partial<Preferencias> = {}) {
  const onMudar = vi.fn();
  const r = render(PainelVoz, {
    preferencias: { ...PADRAO, ...mudancas },
    onMudar,
  });
  return { ...r, onMudar };
}

const avisoDoCore = (payload: unknown) =>
  ouvintes.forEach((f) => f({ payload }));

describe("PainelVoz (seção Voz)", () => {
  it("a velocidade fica aqui, nos dois formatos", async () => {
    const { onMudar } = renderizar({ velocidadeVoz: 20 });
    const controle = screen.getByLabelText(
      "Velocidade da leitura em voz alta",
    ) as HTMLInputElement;
    expect(controle.value).toBe("20");
    expect(screen.getByText("+20")).toBeTruthy();
    await fireEvent.input(controle, { target: { value: "30" } });
    expect(onMudar).toHaveBeenCalledWith({ velocidadeVoz: 30 });
  });

  it("baixar, acompanhar, cancelar e, no fim, escolher a voz", async () => {
    const { onMudar } = renderizar();
    const baixar = await screen.findByRole("button", {
      name: "Baixar a voz natural (152 MB)",
    });
    await fireEvent.click(baixar);
    expect(invoke).toHaveBeenCalledWith("baixar_voz_natural", {
      modelo: "kokoro",
    });

    // O foco segue para o "Cancelar" (o botão de baixar sumiu).
    const cancelar = await screen.findByRole("button", {
      name: "Cancelar o download",
    });
    await waitFor(() => expect(document.activeElement).toBe(cancelar));

    avisoDoCore({
      tipo: "progresso",
      modelo: "kokoro",
      baixado: 76_000_000,
      total: 152_000_000,
    });
    // O nome da barra não muda durante o download (só o valor): ver o comentário no componente.
    const barra = await screen.findByRole("progressbar", {
      name: "Baixando a voz natural (152 MB)",
    });
    expect(barra.getAttribute("value")).toBe("50");
    expect(barra.getAttribute("aria-valuetext")).toBe("50%");
    // De 10 em 10%: menos anúncios do Orca.
    avisoDoCore({
      tipo: "progresso",
      modelo: "kokoro",
      baixado: 89_000_000,
      total: 152_000_000,
    });
    await waitFor(() => expect(barra.getAttribute("value")).toBe("50"));
    avisoDoCore({
      tipo: "progresso",
      modelo: "kokoro",
      baixado: 92_000_000,
      total: 152_000_000,
    });
    await waitFor(() =>
      expect(barra.getAttribute("aria-valuetext")).toBe("60%"),
    );
    await fireEvent.click(cancelar);
    expect(invoke).toHaveBeenCalledWith("cancelar_download_voz");

    estado = catalogo(true);
    avisoDoCore({ tipo: "concluido", modelo: "kokoro" });
    const george = (await screen.findByRole("radio", {
      name: /George/,
    })) as HTMLInputElement;
    // Concluído: o foco vai à primeira opção da voz, não se perde com o "Cancelar".
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("checkbox", {
          name: "Usar a voz natural em livros em inglês",
        }),
      ),
    );
    expect(
      (screen.getByRole("radio", { name: /Heart/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    await fireEvent.click(george);
    expect(onMudar).toHaveBeenCalledWith({ vozNatural: "bm_george" });

    const emIngles = screen.getByRole("checkbox", {
      name: "Usar a voz natural em livros em inglês",
    }) as HTMLInputElement;
    expect(emIngles.checked).toBe(true);
    await fireEvent.click(emIngles);
    expect(onMudar).toHaveBeenCalledWith({ vozNaturalEmIngles: false });
  });

  it("amostra da voz escolhida e remover com confirmação", async () => {
    estado = catalogo(true);
    let terminarGeracao: (ms: number) => void = () => {};
    invoke.mockImplementation((cmd: string) =>
      cmd === "ouvir_amostra_voz"
        ? new Promise((r) => (terminarGeracao = r))
        : Promise.resolve(cmd === "vozes_naturais" ? estado : undefined),
    );
    const { container } = renderizar({ vozNatural: "bm_george" });
    const status = () =>
      container.querySelector("p[role=status]")?.textContent ?? "";
    const botao = await screen.findByRole("button", {
      name: "Ouvir amostra (George)",
    });
    await fireEvent.click(botao);
    expect(invoke).toHaveBeenCalledWith("ouvir_amostra_voz", {
      id: "bm_george",
    });
    // O nome do botão não muda (o Orca o anunciaria por cima da amostra); só o ícone e o aria-busy.
    expect(botao.getAttribute("aria-busy")).toBe("true");
    expect(botao.textContent?.trim()).toBe("Ouvir amostra (George)");
    // O status só fala se a geração demorar, e nada ao começar a tocar.
    expect(status()).toBe("");
    await waitFor(() => expect(status()).toContain("Preparando a voz…"), {
      timeout: 1000,
    });
    terminarGeracao(30);
    await waitFor(() => expect(botao.getAttribute("aria-busy")).toBe("false"));
    expect(status()).toBe("");
    expect(botao.classList.contains("ativa")).toBe(true);
    // Pela duração que o core devolveu, e volta ao normal.
    await waitFor(() => expect(botao.classList.contains("ativa")).toBe(false));

    // O foco não se perde quando o botão em que ele estava some: vai ao Cancelar (o que não
    // apaga nada), volta ao "Remover…" ao cancelar e vai ao "Baixar" depois de remover.
    await fireEvent.click(
      screen.getByRole("button", { name: "Remover a voz natural…" }),
    );
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    await waitFor(() => expect(document.activeElement).toBe(cancelar));
    await fireEvent.click(cancelar);
    expect(invoke).not.toHaveBeenCalledWith(
      "remover_voz_natural",
      expect.anything(),
    );
    const remover = screen.getByRole("button", {
      name: "Remover a voz natural…",
    });
    await waitFor(() => expect(document.activeElement).toBe(remover));
    await fireEvent.click(remover);
    estado = catalogo(false);
    await fireEvent.click(
      screen.getByRole("button", { name: "Remover (152 MB)" }),
    );
    expect(invoke).toHaveBeenCalledWith("remover_voz_natural", {
      modelo: "kokoro",
    });
    const baixar = await screen.findByRole("button", {
      name: "Baixar a voz natural (152 MB)",
    });
    await waitFor(() => expect(document.activeElement).toBe(baixar));
  });

  it("português: grupo próprio, a voz única e usar em português", async () => {
    estado = catalogo(true);
    estado.modelos[0].vozes.push({
      id: "pf_dora",
      nome: "Dora",
      idioma: "pt-BR",
      genero: "feminina",
    });
    const { onMudar } = renderizar();
    const grupo = await screen.findByRole("group", {
      name: "Livros em português",
    });
    expect(grupo.textContent).toContain("Voz: Dora");
    // Sem rádio para a voz única; os do inglês continuam.
    expect(screen.queryByRole("radio", { name: /Dora/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /Heart/ })).toBeTruthy();
    const usar = screen.getByRole("checkbox", {
      name: "Usar a voz natural em livros em português",
    });
    await fireEvent.click(usar);
    expect(onMudar).toHaveBeenCalledWith({ vozNaturalEmPortugues: false });
    await fireEvent.click(
      screen.getByRole("button", { name: "Ouvir amostra (Dora)" }),
    );
    expect(invoke).toHaveBeenCalledWith("ouvir_amostra_voz", { id: "pf_dora" });
  });

  it("português com duas vozes: rádios próprios, que mudam a voz do português", async () => {
    estado = catalogo(true);
    estado.modelos[0].vozes.push(
      { id: "pf_dora", nome: "Dora", idioma: "pt-BR", genero: "feminina" },
      { id: "pm_alex", nome: "Alex", idioma: "pt-BR", genero: "masculina" },
    );
    const { onMudar } = renderizar({ vozNaturalPortugues: "pm_alex" });
    const grupo = await screen.findByRole("radiogroup", {
      name: "Voz em português",
    });
    const alex = screen.getByRole("radio", {
      name: /Alex/,
    }) as HTMLInputElement;
    expect(grupo.contains(alex)).toBe(true);
    expect(alex.checked).toBe(true);
    await fireEvent.click(screen.getByRole("radio", { name: /Dora/ }));
    expect(onMudar).toHaveBeenCalledWith({ vozNaturalPortugues: "pf_dora" });
    expect(
      screen.getByRole("button", { name: "Ouvir amostra (Alex)" }),
    ).toBeTruthy();
    // A do inglês continua com a sua escolha.
    expect(
      (screen.getByRole("radio", { name: /Heart/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("sem o espeak-ng, diz o que instalar em vez de oferecer o download", async () => {
    estado = catalogo(false, false);
    renderizar();
    await waitFor(() => expect(screen.getByText(/precisa do/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Baixar/ })).toBeNull();
  });

  it("não tem violações de acessibilidade (axe)", async () => {
    estado = catalogo(true);
    const { container } = renderizar();
    await screen.findByRole("radio", { name: /Heart/ });
    const { violations } = await axe.run(container);
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
