import { Key } from "../specs/ajuda.js";
import { estado, falasNovas, nota, passo } from "./roteiro.js";
const k = (...t) => browser.keys(t.length > 1 ? t : t[0]);
describe("orca senha", () => { it("roteiro", async () => {
  nota("12. PDF com senha");
  await passo("12.1", "abrir", async () => { await $('dialog input[type="password"]').waitForDisplayed({ timeout: 20000 }); }, 2500);
  nota("foco: " + await estado());
  await passo("12.2", "senha errada e Enter", async () => { await browser.keys("errada"); await k(Key.Enter); }, 2000);
  nota("foco: " + await estado());
  await passo("12.3", "Esc", () => k(Key.Escape), 2000);
  nota("foco: " + await estado());
}); });
