// Provisório até escolhermos o framework: usa a API global do Tauri
// (withGlobalTauri) para mandar um log do frontend ao arquivo de log do app.
const LOG_INFO = 3;

window.__TAURI__?.core
  .invoke("plugin:log|log", {
    level: LOG_INFO,
    message: "ui carregada",
    location: "ui/main.js",
  })
  .catch((e) => console.error("falha ao enviar log", e));
