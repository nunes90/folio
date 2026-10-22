import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
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

// Definido pelo Tauri CLI ao rodar em dispositivo remoto; no desktop fica vazio.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // svelteTesting: nos testes, usa a build "browser" do Svelte e limpa o DOM após cada teste.
  plugins: [foliateSemPdf, svelte(), svelteTesting()],

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
