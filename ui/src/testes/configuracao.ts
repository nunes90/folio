// Configuração dos testes (Vitest + jsdom).
//
// O Svelte 5 faz as transições com Web Animations (`element.animate`), que o jsdom não tem.
// Este substituto termina a animação na hora: os testes veem o estado final, sem esperar.
if (!Element.prototype.animate) {
  Element.prototype.animate = function () {
    const animacao = {
      finished: Promise.resolve(),
      onfinish: null as ((e: unknown) => void) | null,
      cancel() {},
      finish() {},
      pause() {},
      play() {},
      currentTime: 0,
    };
    // O Svelte espera o onfinish; dispara no próximo ciclo, como o navegador faria.
    queueMicrotask(() => animacao.onfinish?.({}));
    return animacao as unknown as Animation;
  };
}
