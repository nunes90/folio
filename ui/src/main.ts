import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { log } from "./lib/log";

const app = mount(App, { target: document.getElementById("app")! });

log.info("ui carregada");

export default app;
