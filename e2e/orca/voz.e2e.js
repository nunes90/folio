// Parte 9 do docs/testes/orca.md (9.5–9.12): a voz natural com o Orca. Baixa o modelo de verdade
// (~154 MB, da internet) duas vezes (a primeira é cancelada) numa pasta de dados temporária. O som vai
// a um dispositivo ALSA nulo (orca/asound.conf). Abre ingles.epub; importa o Dom Casmurro e o
// espanhol.epub. Na sessão isolada não há speech-dispatcher: o espanhol diz que não há voz.
// Nesta pasta (e2e/): ORCA_SPECS=voz ./virtual.sh npm run orca
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Key, botao, esperarLivro } from "../specs/ajuda.js";
import { estado, falasNovas, nota, passo } from "./roteiro.js";
const k = (...t) => browser.keys(t.length > 1 ? t : t[0]);
const ativo = () => browser.execute(() => document.activeElement?.id ?? "");
const focar = (xpath) =>
  browser.execute((x) => {
    const el = document.evaluate(x, document, null, 9, null).singleNodeValue;
    el?.focus();
    return !!el;
  }, xpath);
const existe = (xpath) =>
  browser.execute((x) => !!document.evaluate(x, document, null, 9, null).singleNodeValue, xpath);
const naPaleta = async (termo) => {
  await k(Key.Ctrl, "k");
  await browser.pause(500);
  await browser.keys(termo);
  await browser.pause(400);
  await k(Key.Enter);
};
const abrirAparencia = async () => {
  await botao("Aparência", "//header").click();
  await browser.pause(1200);
};
const BAIXAR = "//button[starts-with(normalize-space(.), 'Baixar a voz natural')]";
const CANCELAR = "//button[normalize-space(.)='Cancelar o download']";
const REMOVER = "//button[normalize-space(.)='Remover a voz natural…']";

describe("orca voz", () => { it("roteiro", async () => {
  await esperarLivro("Pride and Prejudice"); await browser.pause(3000);
  const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/fixtures");
  const outros = ["dom-casmurro.epub", "espanhol.epub"].map((f) => path.join(fixtures, f));
  const importacao = await browser.executeAsync((caminhos, feito) => {
    window.__TAURI_INTERNALS__.invoke("importar_livros", { caminhos }).then((r) => feito(JSON.stringify(r).slice(0, 400)), (e) => feito("erro: " + e));
  }, outros);
  if (String(importacao).startsWith("erro")) nota("importação: " + importacao);
  // A lista de livros (e a paleta) só é lida ao iniciar: recarrega para os importados aparecerem.
  await browser.refresh();
  await esperarLivro("Pride and Prejudice"); await browser.pause(3000);
  falasNovas();

  nota("9. Voz natural");
  await abrirAparencia();
  await passo("9.5", "Tab até a velocidade da voz", async () => {
    for (let i = 0; i < 80 && (await ativo()) !== "pref-velocidade-voz"; i++) {
      falasNovas(); await k(Key.Tab); await browser.pause(250);
    }
  }, 300);
  await browser.pause(800);
  nota("foco: " + await estado());
  await passo("9.5b", "Tab (ao botão de baixar)", () => k(Key.Tab), 1200);
  nota("foco: " + await estado());

  await passo("9.7a", "Enter: baixar", () => k(Key.Enter), 2500);
  nota("foco: " + await estado());
  await passo("9.7b", "Tab", () => k(Key.Tab), 1200);
  nota("foco: " + await estado());
  await passo("9.7c", "Cancelar o download", async () => { await focar(CANCELAR); await browser.pause(300); await k(Key.Enter); }, 2500);
  nota("foco: " + await estado());

  await passo("9.6a", "Baixar de novo", async () => { await focar(BAIXAR); await browser.pause(300); await k(Key.Enter); }, 3000);
  await passo("9.6b", "Tab", () => k(Key.Tab), 1200);
  nota("foco: " + await estado());
  await passo("9.6c", "esperar o fim do download", async () => {
    await browser.waitUntil(() => existe(REMOVER), { timeout: 180000, interval: 500, timeoutMsg: "o download não terminou" });
  }, 2500);
  nota("foco: " + await estado());

  await passo("9.8a", "foco na primeira voz em inglês", () => focar("//div[@role='radiogroup']//input"), 1500);
  await passo("9.8b", "↓", () => k(Key.ArrowDown), 1500);
  await passo("9.8c", "↓", () => k(Key.ArrowDown), 1500);
  await passo("9.8d", "↑ ↑ (volta à primeira)", async () => { await k(Key.ArrowUp); await browser.pause(400); await k(Key.ArrowUp); }, 1500);
  await passo("9.8e", "Tab (amostra em inglês)", () => k(Key.Tab), 1200);
  await passo("9.8f", "Tab (grupo do português)", () => k(Key.Tab), 1500);
  await passo("9.8g", "Tab", () => k(Key.Tab), 1200);
  nota("foco: " + await estado());

  await passo("9.9", "Ouvir a amostra em inglês", async () => {
    await focar("(//button[starts-with(normalize-space(.), 'Ouvir amostra')])[1]"); await browser.pause(800); falasNovas();
    await k(Key.Enter);
  }, 9000);
  await passo("9.9b", "Ouvir a amostra em português", async () => {
    await focar("(//button[starts-with(normalize-space(.), 'Ouvir amostra')])[2]"); await browser.pause(800); falasNovas();
    await k(Key.Enter);
  }, 9000);

  await passo("9.12a", "Ctrl+K, 'voz' (instalada)", async () => { await k(Key.Escape); await browser.pause(800); await k(Key.Ctrl, "k"); await browser.pause(500); await browser.keys("voz"); }, 1800);
  await passo("9.12b", "↓ ↓ ↓", async () => { for (let i = 0; i < 3; i++) { await k(Key.ArrowDown); await browser.pause(500); } }, 1000);
  await k(Key.Escape); await browser.pause(800);

  nota("9.10 Ler em voz alta por idioma");
  await passo("9.10a", "inglês: Ler em voz alta", () => naPaleta("ler em voz alta"), 8000);
  await passo("9.10b", "parar", () => naPaleta("parar a leitura"), 1500);
  // Termos sem letras dobradas: o WebDriver às vezes perde a segunda ("Casmuro").
  for (const [id, titulo, termo] of [["9.10c", "Dom Casmurro", "abrir dom casm"], ["9.10e", "Don Quijote", "abrir don quij"]]) {
    await botao("Voltar à biblioteca", "//header").click(); await browser.pause(2000);
    await naPaleta(termo); await esperarLivro(titulo); await browser.pause(4000); falasNovas();
    await passo(id, `${titulo}: Ler em voz alta`, () => naPaleta("ler em voz alta"), 8000);
    nota("tela: " + await browser.execute(() => [document.querySelector("footer")?.innerText, ...[...document.querySelectorAll("[role=status],[role=alert],[aria-live]")].map((e) => e.textContent.trim())].filter(Boolean).join(" ¦ ").replace(/\s+/g, " ").slice(0, 400)));
    await passo(id + "2", "parar", () => naPaleta("parar a leitura"), 1500);
    if (id === "9.10c") {
      // Pelo botão do rodapé: o foco fica no mesmo botão ("Pausar leitura") e volta a ele ao parar.
      const LER = "//footer//button[normalize-space(.)='Ler em voz alta']";
      await passo("9.10d", "rodapé: Ler em voz alta", async () => { await focar(LER); await browser.pause(1200); falasNovas(); await k(Key.Enter); }, 6000);
      nota("foco: " + await estado());
      await passo("9.10d2", "Enter (pausar)", () => k(Key.Enter), 2000);
      await passo("9.10d3", "Enter (continuar)", () => k(Key.Enter), 4000);
      await passo("9.10d4", "Tab, Enter (parar)", async () => { await k(Key.Tab); await browser.pause(800); await k(Key.Enter); }, 2000);
      nota("foco: " + await estado());
    }
    // Sem leitura (sem voz para o idioma), o comando não existe e a paleta fica aberta.
    if (await existe("//dialog[@open]")) { await k(Key.Escape); await browser.pause(800); }
  }

  nota("9.11 Remover");
  await abrirAparencia();
  await passo("9.11a", "Remover a voz natural…", async () => { await focar(REMOVER); await browser.pause(800); falasNovas(); await k(Key.Enter); }, 1500);
  nota("foco: " + await estado());
  await passo("9.11b", "Shift+Tab (Remover)", () => k(Key.Shift, Key.Tab), 1200);
  await passo("9.11c", "Enter", () => k(Key.Enter), 2500);
  nota("foco: " + await estado());
  await passo("9.12c", "Ctrl+K, 'voz' (sem a voz)", async () => { await k(Key.Escape); await browser.pause(800); await k(Key.Ctrl, "k"); await browser.pause(500); await browser.keys("voz"); }, 1800);
  await passo("9.12d", "↓ ↓", async () => { for (let i = 0; i < 2; i++) { await k(Key.ArrowDown); await browser.pause(500); } }, 1000);
  await k(Key.Escape);
}); });
