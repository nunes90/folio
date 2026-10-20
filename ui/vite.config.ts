import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

// Definido pelo Tauri CLI ao rodar em dispositivo remoto; no desktop fica vazio.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  // svelteTesting: nos testes, usa a build "browser" do Svelte e limpa o DOM após cada teste.
  plugins: [svelte(), svelteTesting()],

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
  },
});
