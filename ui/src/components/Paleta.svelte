<script lang="ts">
  // Paleta de comandos (Ctrl+K): um campo e a lista dos comandos que combinam. Padrão ARIA de
  // combobox com listbox: o foco fica no campo, as setas mudam a opção ativa
  // (aria-activedescendant), Enter executa, Esc fecha. O comando só roda depois de o diálogo
  // fechar e devolver o foco, para que ele possa mover o foco (ex.: abrir outro diálogo).
  import { tick } from "svelte";
  import { filtrarComandos, type Comando } from "../lib/comandos";

  let {
    aberto,
    comandos,
    porTermo,
    textoDoCampo = "Buscar comando ou livro…",
    onFechar,
  }: {
    aberto: boolean;
    comandos: Comando[];
    /** Comandos que dependem do que foi digitado (ex.: "42" → "Ir para a página 42"); vêm primeiro. */
    porTermo?: (termo: string) => Comando[];
    /** Texto de exemplo do campo (placeholder), conforme a tela. */
    textoDoCampo?: string;
    onFechar: () => void;
  } = $props();

  let dialogo: HTMLDialogElement;
  let campo: HTMLInputElement;
  let lista = $state<HTMLUListElement>();
  let termo = $state("");
  let ativo = $state(0);
  /** Escolhido com Enter ou clique: roda quando o diálogo terminar de fechar. */
  let escolhido: Comando | null = null;

  const achados = $derived([...(porTermo?.(termo) ?? []), ...filtrarComandos(comandos, termo)]);
  const idOpcao = (c: Comando) => `comando-${c.id}`;
  const anuncio = $derived(
    achados.length === 0
      ? "Nenhum comando encontrado"
      : achados.length === 1
        ? "1 comando"
        : `${achados.length} comandos`,
  );

  $effect(() => {
    if (aberto && !dialogo.open) {
      termo = "";
      ativo = 0;
      escolhido = null;
      if (dialogo.showModal) dialogo.showModal();
      else dialogo.open = true; // jsdom (testes) não tem showModal
      campo.focus();
    } else if (!aberto && dialogo.open) {
      fechar();
    }
  });

  // Mudou o termo: volta para o primeiro resultado.
  $effect(() => {
    void termo;
    ativo = 0;
  });

  function fechar() {
    if (dialogo.close) dialogo.close();
    else {
      dialogo.open = false;
      dialogo.dispatchEvent(new Event("close"));
    }
  }

  function aoFechar() {
    const comando = escolhido;
    escolhido = null;
    onFechar();
    comando?.executar();
  }

  function escolher(comando: Comando | undefined) {
    if (!comando) return;
    escolhido = comando;
    fechar();
  }

  async function mover(indice: number) {
    if (!achados.length) return;
    ativo = (indice + achados.length) % achados.length;
    await tick();
    lista?.querySelector(`[aria-selected="true"]`)?.scrollIntoView?.({ block: "nearest" });
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === "ArrowDown") mover(ativo + 1);
    else if (e.key === "ArrowUp") mover(ativo - 1);
    else if (e.key === "PageDown") mover(Math.min(ativo + 8, achados.length - 1));
    else if (e.key === "PageUp") mover(Math.max(ativo - 8, 0));
    else if (e.key === "Enter") escolher(achados[ativo]);
    else return;
    e.preventDefault();
  }
</script>

<dialog class="modal paleta" bind:this={dialogo} aria-label="Comandos" onclose={aoFechar}>
  <input
    bind:this={campo}
    bind:value={termo}
    type="text"
    role="combobox"
    aria-label="Buscar comando"
    aria-autocomplete="list"
    aria-expanded="true"
    aria-controls="lista-comandos"
    aria-activedescendant={achados[ativo] ? idOpcao(achados[ativo]) : undefined}
    placeholder={textoDoCampo}
    autocomplete="off"
    spellcheck="false"
    onkeydown={aoTeclar}
  />
  <p class="so-leitor-de-tela" role="status">{aberto ? anuncio : ""}</p>
  <!-- Clique escolhe; o teclado fica no campo (combobox), por isso as opções não têm tecla. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <ul id="lista-comandos" role="listbox" aria-label="Comandos" bind:this={lista}>
    {#each achados as comando, i (comando.id)}
      <li
        id={idOpcao(comando)}
        role="option"
        aria-selected={i === ativo}
        onclick={() => escolher(comando)}
        onpointermove={() => (ativo = i)}
      >
        <span class="titulo">{comando.titulo}</span>
        {#if comando.dica}<span class="dica">{comando.dica}</span>{/if}
        <span class="fim">
          {#each comando.teclas ?? [] as combinacao, j (j)}
            <span class="teclas">
              {#each combinacao as tecla, k (k)}{#if k > 0}+{/if}<kbd>{tecla}</kbd>{/each}
            </span>
          {/each}
          <span class="grupo">{comando.grupo}</span>
        </span>
      </li>
    {/each}
  </ul>
  {#if !achados.length}
    <p class="vazio">Nenhum comando encontrado.</p>
  {/if}
</dialog>

<style>
  /* Aparência e animação comuns em app.css (dialog.modal). No alto, como as paletas de outros
     apps: o diálogo não pula quando a lista encolhe. */
  .paleta {
    width: min(36rem, calc(100vw - 2rem));
    margin-block-start: 12vh;
    padding: 0.5rem;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--borda);
    border-radius: var(--raio);
    background: var(--app);
    color: var(--texto);
    font: inherit;
    font-size: 1.05rem;
  }

  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    max-height: min(24rem, 55vh);
    overflow-y: auto;
  }

  ul:empty {
    display: none;
  }

  li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--raio);
    cursor: pointer;
  }

  /* A opção ativa: fundo e uma barra, não só a cor (como o item atual do índice). */
  li[aria-selected="true"] {
    background: var(--destaque-suave);
    box-shadow: inset 3px 0 0 var(--destaque);
  }

  :global([data-tema="alto-contraste"]) li[aria-selected="true"] {
    outline: 2px solid var(--borda);
    outline-offset: -2px;
  }

  .titulo {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dica {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--suave);
    font-size: 0.875rem;
  }

  .fim {
    display: flex;
    flex: none;
    align-items: baseline;
    gap: 0.5rem;
    margin-inline-start: auto;
    padding-inline-start: 0.5rem;
    color: var(--suave);
    font-size: 0.8125rem;
  }

  kbd {
    display: inline-block;
    min-width: 1.3rem;
    padding: 0 0.3rem;
    border: 1px solid var(--borda);
    border-block-end-width: 2px;
    border-radius: var(--raio-pequeno);
    background: var(--card);
    color: var(--texto);
    font: inherit;
    font-weight: 600;
    text-align: center;
  }

  .vazio {
    margin: 0.75rem;
    color: var(--suave);
  }
</style>
