# Alterações locais no foliate-js

Cópia de https://github.com/johnfactotum/foliate-js no commit `78914aef4466eb960965702401634c2cb348e9b1`
(sem `pdf.js` nem `vendor/pdfjs`: o Vite troca `./pdf.js` por um stub, ver `ui/vite.config.ts`).

Cada alteração no código está marcada com `LEITOR:`. Ao atualizar o foliate-js, reaplique ou confirme
que o problema foi resolvido no projeto original.

| Arquivo | Alteração | Motivo |
|---|---|---|
| `paginator.js` (`View.expand`) | retorna cedo se `this.document` for `null` | ao fechar o livro, um `ResizeObserver` já enfileirado chamava `expand()` depois de o iframe ser removido: `TypeError: Cannot destructure property 'documentElement'` |
| `paginator.js` (`Paginator.centerAnchor`) | método novo: rola até o trecho ficar no meio da tela, na rolagem contínua, com duração e curva dadas | a "uma ideia por vez" (M19) mantém o bloco atual no centro; o `scrollToAnchor` só põe o trecho no alto, e a animação do foliate é fixa (300 ms, `animated`) |
| `tts.js` (`TTS`) | propriedade `block`: o Range do último bloco gerado (o que vai ser falado) | a voz lê listas e código mais devagar (M23b) e precisa saber em que bloco está; `current()` refaria as marcas |
