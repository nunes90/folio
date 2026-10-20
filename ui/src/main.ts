import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { iniciarEscala } from "./lib/escala.svelte";
import { log } from "./lib/log";

// Erros da webview não aparecem em lugar nenhum se não forem para o log.
window.addEventListener("error", (e) => log.error(`erro não tratado: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => log.error(`promise rejeitada: ${e.reason}`));
document.addEventListener("securitypolicyviolation", (e) =>
  log.warn(`CSP bloqueou ${e.blockedURI || "inline"} (${e.violatedDirective})`),
);

await iniciarEscala();

const app = mount(App, { target: document.getElementById("app")! });

log.info("ui carregada");

export default app;
