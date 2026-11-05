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

function catalogo(instalado: boolean, espeak = true, baixando: string | null = null) {
  return {
    modelos: [
      {
        id: "kokoro",
        nome: "Kokoro",
        licenca: "Apache-2.0",
        tamanho: 152_000_000,
        instalado,
        vozes: [
          { id: "af_heart", nome: "Heart", idioma: "en-US", genero: "feminina" },
          { id: "bm_george", nome: "George", idioma: "en-GB", genero: "masculina" },
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
  const r = render(PainelVoz, { preferencias: { ...PADRAO, ...mudancas }, onMudar });
  return { ...r, onMudar };
}

const avisoDoCore = (payload: unknown) => ouvintes.forEach((f) => f({ payload }));

describe("PainelVoz (seção Voz)", () => {
  it("a velocidade fica aqui, nos dois formatos", async () => {
    const { onMudar } = renderizar({ velocidadeVoz: 20 });
    const controle = screen.getByLabelText("Velocidade da leitura em voz alta") as HTMLInputElement;
    expect(controle.value).toBe("20");
    expect(screen.getByText("+20")).toBeTruthy();
    await fireEvent.input(controle, { target: { value: "30" } });
    expect(onMudar).toHaveBeenCalledWith({ velocidadeVoz: 30 });
  });

  it("baixar, acompanhar, cancelar e, no fim, escolher a voz", async () => {
    const { onMudar } = renderizar();
    const baixar = await screen.findByRole("button", { name: "Baixar a voz natural (152 MB)" });
    await fireEvent.click(baixar);
    expect(invoke).toHaveBeenCalledWith("baixar_voz_natural", { modelo: "kokoro" });

    avisoDoCore({ tipo: "progresso", modelo: "kokoro", baixado: 76_000_000, total: 152_000_000 });
    const barra = await screen.findByRole("progressbar");
    expect(barra.getAttribute("value")).toBe("50");
    expect(screen.getByText(/76 MB de 152 MB/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Cancelar o download" }));
    expect(invoke).toHaveBeenCalledWith("cancelar_download_voz");

    estado = catalogo(true);
    avisoDoCore({ tipo: "concluido", modelo: "kokoro" });
    const george = (await screen.findByRole("radio", { name: /George/ })) as HTMLInputElement;
    expect((screen.getByRole("radio", { name: /Heart/ }) as HTMLInputElement).checked).toBe(true);
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
    const status = () => container.querySelector("p[role=status]")?.textContent ?? "";
    await fireEvent.click(await screen.findByRole("button", { name: "Ouvir amostra (George)" }));
    expect(invoke).toHaveBeenCalledWith("ouvir_amostra_voz", { id: "bm_george" });
    // Enquanto o áudio é gerado: o botão diz, e o status anuncia.
    const botao = screen.getByRole("button", { name: "Preparando a voz…" });
    expect(botao.getAttribute("aria-busy")).toBe("true");
    expect(status()).toContain("Preparando a voz…");
    terminarGeracao(30);
    await screen.findByRole("button", { name: "Tocando George…" });
    expect(status()).toContain("Tocando a amostra de George.");
    // Pela duração que o core devolveu, e volta ao normal.
    await screen.findByRole("button", { name: "Ouvir amostra (George)" });

    await fireEvent.click(screen.getByRole("button", { name: "Remover a voz natural…" }));
    await fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(invoke).not.toHaveBeenCalledWith("remover_voz_natural", expect.anything());
    await fireEvent.click(screen.getByRole("button", { name: "Remover a voz natural…" }));
    estado = catalogo(false);
    await fireEvent.click(screen.getByRole("button", { name: "Remover (152 MB)" }));
    expect(invoke).toHaveBeenCalledWith("remover_voz_natural", { modelo: "kokoro" });
    await screen.findByRole("button", { name: "Baixar a voz natural (152 MB)" });
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
    const grupo = await screen.findByRole("group", { name: "Livros em português" });
    expect(grupo.textContent).toContain("Voz: Dora");
    // Sem rádio para a voz única; os do inglês continuam.
    expect(screen.queryByRole("radio", { name: /Dora/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /Heart/ })).toBeTruthy();
    const usar = screen.getByRole("checkbox", { name: "Usar a voz natural em livros em português" });
    await fireEvent.click(usar);
    expect(onMudar).toHaveBeenCalledWith({ vozNaturalEmPortugues: false });
    await fireEvent.click(screen.getByRole("button", { name: "Ouvir amostra (Dora)" }));
    expect(invoke).toHaveBeenCalledWith("ouvir_amostra_voz", { id: "pf_dora" });
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
