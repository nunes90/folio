# Leitor de tela (Orca): adiado

Decisão de nov/2026: enquanto a interface ainda muda muito, o suporte específico ao Orca sai do projeto e volta
quando houver uma base estável. Cada mudança de interface exigia testes com o Orca, e o WebKitGTK cai com
facilidade quando um leitor de tela lê a página.

O que continua: teclado completo, F1, paleta, foco gerenciado, ARIA (com os testes do axe no Vitest), `aria-live`
do HTML e a recuperação quando o processo da página cai (`crates/app/src/processo.rs`).

## O que saiu (e onde encontrar)

Tudo está no commit `b3aaf78` (`git show b3aaf78:<caminho>`):

- `crates/app/src/orca.rs` e o comando `anunciar_ao_leitor_de_tela`: mandavam os avisos ao Orca pelo serviço
  D-Bus dele (`PresentMessage`), porque o WebKitGTK quase não entrega as regiões vivas. `ui/src/lib/regioesVivas.ts`
  observava `aria-live`/`status`/`alert` e chamava o comando.
- `e2e/atspi/` (`rodar.sh`, `percorrer.py`) e `e2e/specs/leitor-de-tela*.e2e.js`: um barramento de acessibilidade
  próprio, sem Orca, que percorria cada tela pedindo o que o Orca pede (atributos de texto posição por posição) e
  falhava se o processo da página caísse. Rodava na CI.
- `e2e/orca/`: o Orca de verdade, sem áudio, numa sessão isolada; as falas iam para `orca/falas.tsv`. Roteiros
  `epub`, `pdf`, `senha` e `voz` (este com a voz natural num ALSA nulo, `asound.conf`).
- `docs/testes/orca.md`: o roteiro manual, em 12 partes.

## O que se aprendeu (vale para a volta)

O WebKitGTK (2.54) aborta o `WebKitWebProcess` quando um leitor de tela pede os atributos de texto
(`GetAttributeRun`) de certos objetos. Bug aberto do WebKit, muito provavelmente o 284246 (duplicata do 270354).
Formas conhecidas:

- Contêiner sem texto próprio só com botões da mesma fonte e cor (`li > button`, `div[role=group] > button`).
- Contêiner com um objeto dentro, texto, o último nó sem caixa (âncora do Svelte) e conteúdo depois.
- `<ul><li><div><div><button><svg aria-hidden>` (o card da biblioteca).
- Versos com `<br>` e espaço antes de `</p>` (nos livros).
- Texto que muda dentro de um contêiner enquanto o leitor de tela pode estar nele (o rótulo do download a cada
  150 ms), e um objeto focável por último num contêiner com texto.
- `aria-hidden` não tira o texto do contêiner pai no WebKitGTK.

Outros achados: no modo de navegação, o Orca fica com as setas e percorre a interface (por isso
`<body role="application">`; o texto do livro é iframe ou `role="document"`); ao foco no próprio
`role="document"`, ele não diz nada; não percorre a camada de texto do pdf.js (por isso o texto acessível do PDF);
não lê uma linha de tabela focada.

## Contornos que ficaram no código

Nasceram do Orca, mas não custam nada parados; se algum atrapalhar uma mudança, pode sair junto com ela:
`role="application"` no `<body>` (`ui/index.html`), `.grupo-sem-caixa` e `li { display: contents }` (`app.css`),
`role="img"` no `Icone`, `tirarEspacoAposUltimaQuebra` (`lib/contornosWebkit.ts`), o texto acessível do PDF
(`.texto-acessivel`), o rótulo fixo e os passos de 10% da barra do download e o nome fixo da amostra
(`PainelVoz`), o slider sem balão no teclado (`Posicao`) e os anúncios do F1 (`Atalhos`).
