# Alterações locais no foliate-js

Cópia de https://github.com/johnfactotum/foliate-js no commit `78914aef4466eb960965702401634c2cb348e9b1`
(sem `pdf.js` nem `vendor/pdfjs`: o Vite troca `./pdf.js` por um stub, ver `ui/vite.config.ts`).

Cada alteração no código está marcada com `LEITOR:`. Ao atualizar o foliate-js, reaplique ou confirme
que o problema foi resolvido no projeto original.

| Arquivo | Alteração | Motivo |
|---|---|---|
| `paginator.js` (`View.expand`) | retorna cedo se `this.document` for `null` | ao fechar o livro, um `ResizeObserver` já enfileirado chamava `expand()` depois de o iframe ser removido: `TypeError: Cannot destructure property 'documentElement'` |
