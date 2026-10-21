// Copia os recursos que o pdf.js carrega por URL (decodificadores WASM, CMaps de fontes CJK,
// fontes padrão e perfis de cor) para public/pdfjs, que o Vite serve e empacota como estão.
// Roda sozinho antes de `npm run dev` e `npm run build` (scripts predev/prebuild).
import { cpSync, rmSync } from "node:fs";

const origem = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const destino = new URL("../public/pdfjs/", import.meta.url);

rmSync(destino, { recursive: true, force: true });
for (const dir of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
  cpSync(new URL(dir, origem), new URL(dir, destino), { recursive: true });
}
