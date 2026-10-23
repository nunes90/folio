# Redesign: análise do design system proposto

Origem: `leitor-design-system.css` (gerado no Grok, out/2026), com 27 componentes.
Prévia lado a lado e versão completa desta análise: https://claude.ai/artifact/6BbfFVZ1tvfN47PCAhXXF7 (privada).

A direção visual é boa: superfícies em camadas, sombras discretas, botões de ícone na barra e um índice mais claro.
Mas vários valores contrariam regras do projeto. Entra o que respeita essas regras, adaptado (marco **M7**).

## Conflitos gerais (valem para qualquer componente novo)
1. **Contraste abaixo do WCAG.** No tema claro: texto fraco 2,52:1, texto branco sobre o destaque 3,68:1, item
   ativo do índice 3,2:1, bordas de controles 1,2–1,4:1, selos verde/amarelo ~3:1. Mínimos: 4,5:1 para texto e
   3:1 para bordas de controles. O `temas.test.ts` reprovaria esses valores.
2. **Medidas em px.** A escala de texto do sistema é reaplicada via CSS (ADR 0004): o texto cresce e caixas em px
   não, e os botões cortam. Usar `rem`; alturas fixas viram `min-height`.
3. **Animações fora do padrão.** Nada de `ease` e 0,2 s fixos, nem de animar `box-shadow`, `width` ou `all`.
   Usar a mola e as durações de `lib/animacao.ts`, só `transform` e `opacity`, e zerar com movimento reduzido.
4. **Só no hover.** Tudo que aparece no hover precisa aparecer também com o foco do teclado (WCAG 2.1.1, 1.4.13).
5. **Foco escondido.** Sem `outline: none`; vale o `:focus-visible` global (3:1).
6. **Emoji e temas fora de `temas.ts`.** Ícones em SVG (`Icone.svelte`). As cores vêm de `lib/temas.ts`, nos quatro
   temas, inclusive o alto contraste, e não de `[data-theme]` no CSS.

## Tokens adaptados (conferidos: texto ≥ 4,5:1, bordas de controles ≥ 3:1)
| Token | Claro | Escuro | Sépia | Alto contraste |
|---|---|---|---|---|
| fundo do app | `#f6f5f2` | `#121214` | `#efe5cc` | `#000000` |
| painel | `#ffffff` | `#1b1b1e` | `#f6eedb` | `#000000` |
| card | `#ffffff` | `#232327` | `#faf5e8` | `#000000` |
| hover | `#ecebe6` | `#2d2d32` | `#e8dcbf` | `#1a1a1a` |
| texto | `#1c1a17` | `#ecebe8` | `#2e2416` | `#ffffff` |
| texto secundário | `#4f4a44` | `#bdb9b2` | `#5a4730` | `#ffffff` |
| texto suave | `#6a645c` | `#a29e97` | `#6b573c` | `#ffffff` |
| borda de controle | `#8a857e` | `#76767d` | `#8c7a5b` | `#ffffff` |
| divisória (decorativa) | `rgba(28,26,23,.10)` | `rgba(255,255,255,.09)` | `rgba(46,36,22,.12)` | `#ffffff` |
| destaque | `#0b57d0` | `#8ab4f8` | `#7a3a00` | `#ffff00` |
| texto sobre o destaque | `#ffffff` | `#0d1626` | `#ffffff` | `#000000` |
| destaque suave | `#e8effb` | `#1f2b40` | `#efdcc0` | `#000000` |

O destaque é o mesmo azul que o app já usa em links e no foco.

**Como ficou no M7a** (`lib/temas.ts`): as superfícies, a divisória, o destaque (com texto e fundo suave) e a
sombra entraram como campos de `Cores`, com os valores acima. Os textos não ganharam um terceiro nível: o `suave` que
já existia passa de 4,5:1 em todas as superfícies e fica entre o "secundário" e o "suave" da tabela. A borda de
controle continua sendo a `borda` atual. Os raios (`--raio-pequeno`, `--raio`, `--raio-grande`) ficam no `app.css`.

## Decisão por parte
| # | Parte | Decisão | Motivo |
|---|---|---|---|
| 1 | Variáveis de tema | Adaptar | Estrutura em camadas entra; valores recalculados, em `temas.ts`, com alto contraste. |
| 2 | Cards da biblioteca | Adaptar | Entram progresso na capa, "% lido", autor e sombra. Saem: card que sobe no hover, "×" só no hover, `div role="button"` (a grade com roving tabindex fica) e animação de `width` (usar `scaleX`). |
| 3 | Grade e filtros | Adaptar | Grade em `rem`. Filtros com a feature, com contraste e `aria-pressed`. |
| 4 | Drawer de aparência | Não adotar | `PainelLateral` já faz isso (mola, Esc, foco, véu na janela estreita). O drawer fixo tiraria a prévia ao vivo ao lado do livro. Só o cabeçalho com título e fechar entra. |
| 5 | Barra superior | Adotar | Botões de ícone e título centralizado (`1fr auto 1fr`), em `rem`, com o nome acessível mantido. |
| 6 | Barra inferior | Adaptar | Visual entra; altura fixa vira `min-height`. |
| 7 | Modo imersivo | Com a feature | Precisa de atalho de teclado e de mostrar as barras quando o foco entra nelas. |
| 8 | Índice lateral | Adaptar | Item ativo com fundo e barra lateral, recuo por nível; cor recalculada (3,2 → 5,5:1). |
| 9.1 | Busca | Com a feature | Busca na biblioteca e no EPUB. |
| 9.2 | Breadcrumbs | Com a feature | Só com coleções. |
| 9.3 | Paginação compacta | Adotar | "‹ 2% ›", bom na janela estreita. |
| 9.4 | Barra de progresso | Adotar | Com `scaleX`; decorativa (a % fica no rodapé). |
| 9.5 | Navegação por capítulos | Não adotar | O EPUB é paginado no iframe; o fim do capítulo é uma virada de página e o índice já navega. |
| 9.6 | Botões flutuantes | Não adotar | Só no hover, cobrem o texto, repetem setas e rodapé; pensados para toque. |
| 9.7 | Slider de páginas | Com a feature | Para PDFs longos, com `aria-valuetext` e navegação ao soltar. |
| 9.8 | Paleta de comandos | Com a feature | `dialog` nativo + combobox ARIA; entra no F1. |
| 9.9 | Abas da biblioteca | Com a feature | Depende do estado "concluído"; `tablist` ou `aria-pressed`. |
| 9.10 | Teclas (kbd) | Adotar | No diálogo de atalhos (F1). |
| 10 | Menu de contexto | Com a feature | `role="menu"`, setas, Esc, tecla Menu/Shift+F10; ícones SVG. |
| 11 | Tooltips em CSS | Não adotar | `::after` não é lido, não aparece no foco e some ao tirar o mouse (WCAG 1.4.13). |
| 12 | Spinner e skeleton animados | Não adotar | Movimento contínuo (WCAG 2.2.2, sensibilidade vestibular); o `Carregando.svelte` é sem spinner de propósito. Skeleton estático é aceitável. |
| 13 | Toasts | Com a feature | `role="status"`/`alert`, tempo para ler, entrada com a mola. |
| 14 | Modal com divs | Não adotar | O `<dialog>` nativo prende e devolve o foco; só o visual (cabeçalho, rodapé, cantos) entra. |
| 15 | Estado vazio | Adotar | Com ícone SVG e botão primário com as cores novas. |
| 16 | Selos | Adaptar | EPUB/PDF entram; selos coloridos viram neutros e o estado vem escrito (WCAG 1.4.1). |
| 17 | Arrastar para importar | Com a feature | Drag-and-drop do Tauri, mantendo o botão "Importar livros". |
| 18 | Destaques no texto | Com a feature | Cada cor com outra pista além da cor; contraste do texto destacado nos 4 temas. |

Resumo: 5 adotar, 6 adaptar, 10 com a feature, 6 não adotar.
