import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Carregando from "./Carregando.svelte";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Carregando", () => {
  it("só aparece se demorar: aberturas rápidas não piscam um aviso", async () => {
    render(Carregando, { texto: "Abrindo o livro…" });
    expect(screen.queryByText("Abrindo o livro…")).toBeNull();
    vi.advanceTimersByTime(400);
    await tick();
    expect(screen.getByRole("status").textContent).toContain("Abrindo o livro…");
  });
});
