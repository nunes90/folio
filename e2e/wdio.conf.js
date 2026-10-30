// Testes de ponta a ponta (M26c), no app compilado, pelo WebdriverIO e o tauri-driver (que repassa
// ao WebKitWebDriver no Linux). Como em docs.tauri.app (develop/tests/webdriver), com duas
// diferenças: o app já vem compilado (o workflow faz `cargo tauri build --debug --no-bundle`)
// e cada sessão usa pastas de dados novas (XDG_*), sem tocar nos dados de ninguém.
//
// Rodar: compilar o app (`cargo tauri build --debug --no-bundle`; com o `cargo tauri dev` aberto,
// use outra pasta e FOLIO_APP) e, nesta pasta, `npm ci` e
// `xvfb-run --auto-servernum dbus-run-session -- npm test`. O xvfb-run abre as janelas numa tela
// virtual: nada aparece na tela de quem está usando o computador.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const aqui = fileURLToPath(new URL(".", import.meta.url));
const raiz = path.resolve(aqui, "..");
const fixture = (nome) => path.join(raiz, "tests/fixtures", nome);

let driver;
let saindo = false;
let pastaDaSessao;

function sessao(spec, livro) {
  return {
    maxInstances: 1,
    specs: [spec],
    "tauri:options": {
      // FOLIO_APP: outro binário (ex.: compilado em outra pasta, para não sobrescrever o de quem
      // está com o `cargo tauri dev` aberto).
      application: process.env.FOLIO_APP ?? path.join(raiz, "target/debug/folio"),
      args: [fixture(livro)],
    },
  };
}

export const config = {
  host: "127.0.0.1",
  port: 4444,
  maxInstances: 1,
  // Uma sessão do app por arquivo de teste: o livro chega como no "Abrir com" do sistema (o app
  // o importa e abre). Pastas de dados novas a cada sessão.
  capabilities: [
    sessao("specs/epub.e2e.js", "dom-casmurro.epub"),
    sessao("specs/pdf.e2e.js", "texto.pdf"),
    sessao("specs/senha.e2e.js", "quebrados/pdf-com-senha.pdf"),
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 60000 },
  waitforTimeout: 10000,

  // Pastas novas a cada sessão (o app herda o ambiente do tauri-driver).
  beforeSession: () => {
    const dados = fs.mkdtempSync(path.join(os.tmpdir(), "folio-e2e-"));
    pastaDaSessao = dados;
    const ambiente = {
      ...process.env,
      XDG_DATA_HOME: path.join(dados, "dados"),
      XDG_CACHE_HOME: path.join(dados, "cache"),
      XDG_STATE_HOME: path.join(dados, "estado"),
    };
    saindo = false;
    driver = spawn(process.env.TAURI_DRIVER ?? path.resolve(os.homedir(), ".cargo/bin/tauri-driver"), [], {
      stdio: [null, process.stdout, process.stderr],
      env: ambiente,
    });
    driver.on("error", (erro) => {
      console.error("tauri-driver:", erro);
      process.exit(1);
    });
    driver.on("exit", (codigo) => {
      if (!saindo) {
        console.error("tauri-driver saiu com o código", codigo);
        process.exit(1);
      }
    });
  },

  afterSession: () => fecharDriver(),

  // O livro ainda abrindo, o pdf.js desenhando: as esperas são longas de propósito.
  connectionRetryTimeout: 120000,
};

function fecharDriver() {
  saindo = true;
  driver?.kill();
  if (pastaDaSessao) fs.rmSync(pastaDaSessao, { recursive: true, force: true });
  pastaDaSessao = undefined;
}

for (const sinal of ["exit", "SIGINT", "SIGTERM", "SIGHUP"]) process.on(sinal, fecharDriver);
