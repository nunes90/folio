# 0003 — Frontend em Svelte 5 (Vite + TypeScript, sem SvelteKit)

**Status:** aceita

## Contexto
A interface roda na webview do Tauri e precisa hospedar foliate-js (EPUB) e pdf.js (PDF), ambos JS puro que manipulam o DOM diretamente. Prioridades: acessibilidade e animações fluidas. O frontend segue o modo "Claude escreve, Lucas revisa".

## Decisão
Svelte 5 com Vite e TypeScript, sem SvelteKit. Testes com Vitest + Testing Library + axe-core.

## Motivos
- O compilador do Svelte emite avisos de acessibilidade (alt ausente, handlers sem teclado, roles inválidos) a cada build.
- Transições e animações já vêm no framework (`transition:`, `animate:`, `tweened`/`spring`), fáceis de desligar com `prefers-reduced-motion`.
- Sem virtual DOM: entregar um elemento para foliate-js/pdf.js (`bind:this` + `onMount`) não briga com o framework.
- Componentes próximos de HTML/CSS: fáceis de revisar sem dominar o framework.
- SvelteKit traria SSR e rotas por arquivos, que um app desktop não precisa.

## Alternativas consideradas
- **Solid**: ótima performance, mas JSX, ecossistema menor e sem checagem de a11y no compilador.
- **Leptos / Dioxus-web (100% Rust)**: o trabalho pesado continuaria em JS (foliate-js, pdf.js), atravessando a fronteira WASM↔JS via `wasm-bindgen` a cada interação; build extra e compilação mais lenta. O aprendizado de Rust fica concentrado no `core`.

## Consequências
- `cargo tauri dev` sobe o Vite (porta 5173) e o app. `cargo run` sozinho exige o Vite rodando.
- Componentes sem `<script lang="ts">` são tratados como JS pelo svelte-check; manter o bloco, mesmo vazio.
- TypeScript fixado em 6.x até o svelte-check aceitar o 7.
