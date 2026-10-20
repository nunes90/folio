# 0004 — Escala de texto via CSS; zoom da webview fixo em 1

**Status:** aceita

## Contexto
No Linux, o WebKitGTK converte a escala de texto do sistema (`gtk-xft-dpi`, ex.: GNOME com 1,36) em zoom da página. Dentro de iframes esse zoom é aplicado duas vezes: com escala 1,3636, uma página definida com `522px` aparece com 382,88 px medida dentro do iframe (razão exata de 1,3636). O foliate-js mostra cada capítulo num iframe e mistura medidas de dentro e de fora dele, então as páginas saíam cortadas e desalinhadas. O mesmo valeria para qualquer zoom (ex.: Ctrl+/−).

Aumentar o texto é justamente o que fazem pessoas com baixa visão: o leitor precisa funcionar com escala diferente de 1.

## Decisão
- O zoom da webview fica sempre em 1. No Linux, o app lê `gtk-xft-dpi` e chama `set_zoom(1 / fator)`, que anula o zoom do WebKitGTK. Também acompanha mudanças feitas com o app aberto.
- O fator vai ao frontend (comando `escala_texto` + evento `escala-texto`), que o aplica via CSS: `font-size` da raiz da interface (que usa `rem`) e do livro (pelo `setStyles` do foliate-js).
- No macOS não há zoom implícito: o fator é 1.

## Alternativas consideradas
- **Corrigir o paginador do foliate-js**: exigiria converter unidades em cada medição (layout, âncoras, área visível, overlayer). É invasivo num código de terceiros, e o defeito está no WebKitGTK.
- **Aceitar o bug até o M4**: a leitura sairia quebrada para quem usa escala de texto.

## Consequências
- Zoom do usuário (Ctrl+/−, tamanho de fonte do M4) deve ser implementado por CSS, nunca pelo zoom da webview.
- A interface deve usar `rem`, não `px`, para tamanhos de texto e espaçamentos ligados ao texto.
- CSS de livros com tamanhos absolutos (`px`) não escala; o M4 deve sobrescrever.
- Vale reportar o comportamento dos iframes ao WebKit.
