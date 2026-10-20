// Logs do frontend vão para o mesmo arquivo do Rust (via tauri-plugin-log).
// Fora do Tauri (testes, navegador comum) caem no console.
import { isTauri } from "@tauri-apps/api/core";
import * as plugin from "@tauri-apps/plugin-log";

type Nivel = "trace" | "debug" | "info" | "warn" | "error";

function enviar(nivel: Nivel, mensagem: string): void {
  if (!isTauri()) {
    console[nivel === "trace" ? "debug" : nivel](mensagem);
    return;
  }
  plugin[nivel](mensagem).catch((e) => console.error("falha ao enviar log", e));
}

export const log = {
  trace: (m: string) => enviar("trace", m),
  debug: (m: string) => enviar("debug", m),
  info: (m: string) => enviar("info", m),
  warn: (m: string) => enviar("warn", m),
  error: (m: string) => enviar("error", m),
};
