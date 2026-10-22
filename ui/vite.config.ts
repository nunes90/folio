import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Troca o `./pdf.js` do foliate-js por um stub (ver src/lib/foliate-sem-pdf.js).
const foliateSemPdf: Plugin = {
  name: "foliate-sem-pdf",
  enforce: "pre",
  resolveId(fonte, importador) {
    if (fonte === "./pdf.js" && importador?.includes("/vendor/foliate-js/")) {
      return fileURLToPath(new URL("./src/lib/foliate-sem-pdf.js", import.meta.url));
    }
  },
};

// Só no `cargo tauri dev`: a página vem de http://localhost:5173, e o WebKitGTK não carrega
// imagens do esquema asset:// (usado pelas capas) numa página http://. Aqui as capas são
// servidas pelo próprio Vite em /__capas/<arquivo> (ver urlDaCapa). Na build de produção a
// página vem de tauri:// e as capas continuam pelo asset://.
const DIR_CAPAS = join(
  process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
  "io.github.nunes90.leitor",
  "capas",
);
const TIPOS_IMAGEM: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const capasNoDev: Plugin = {
  name: "capas-no-dev",
  apply: "serve",
  configureServer(servidor) {
    servidor.middlewares.use("/__capas/", async (req, res) => {
      const nome = decodeURIComponent((req.url ?? "").slice(1));
      // Só nomes de capa (hash do livro + extensão): nada de caminhos arbitrários.
      const encontrado = /^[0-9a-f]{64}\.([a-z]+)$/.exec(nome);
      const tipo = encontrado && TIPOS_IMAGEM[encontrado[1]!];
      try {
        if (!tipo) throw new Error("nome inválido");
        const bytes = await readFile(join(DIR_CAPAS, nome));
        res.setHeader("Content-Type", tipo);
        res.end(bytes);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
  },
};

// Definido pelo Tauri CLI ao rodar em dispositivo remoto; no desktop fica vazio.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // svelteTesting: nos testes, usa a build "browser" do Svelte e limpa o DOM após cada teste.
  plugins: [foliateSemPdf, capasNoDev, svelte(), svelteTesting()],

  // Não apagar a saída do Rust no terminal do `cargo tauri dev`.
  clearScreen: false,
  server: {
    port: 5173,
    // O tauri.conf.json aponta para esta porta; se estiver ocupada, falhar em vez de trocar.
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5174 } : undefined,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // WebKitGTK/WKWebView no Linux/macOS; WebView2 (Chromium) no Windows.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/testes/configuracao.ts"],
  },
});
