import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  // Habilita <script lang="ts"> nos componentes.
  preprocess: vitePreprocess(),
};
