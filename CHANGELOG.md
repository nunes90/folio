# Mudanças do Folio

O que mudou para quem usa o app, da versão mais nova para a mais antiga. As notas completas de cada versão
estão na [página de versões](https://github.com/nunes90/folio/releases); os detalhes de implementação, em
[`docs/historico.md`](docs/historico.md).

## Em desenvolvimento (1.3)

- **Notas de rodapé num balão** (EPUB): clicar no número da nota a mostra sem sair da página.
- **Voltar para onde você estava** (Alt+←) depois de seguir um link, ir pelo índice, a um destaque ou pela busca.
- Na "uma ideia por vez" do EPUB, o que vem antes do bloco atual também esmaece (em alguns livros, não esmaecia).
- Ctrl+D com a voz lendo: a barra de destaque não fecha mais sozinha a partir do segundo uso.
- O texto da meta da sessão não quebra mais em duas linhas no rodapé.

## 1.2 (sem versão publicada ainda)

- **Busca no texto do EPUB** (Ctrl+F), igual à do PDF: ocorrências contornadas, a atual realçada, Enter e
  Shift+Enter para andar por elas.
- **Uma janela só**: abrir um segundo livro pelo gerenciador de arquivos usa o Folio que já está aberto.
- **A janela não para mais durante a importação** de livros grandes.
- Um livro não consegue rodar código nem acessar a rede, e agora um teste garante isso a cada mudança.
- SQLite 3.54 (corrige o CVE-2026-119375).

## 1.1.1 — nov/2026

- "Ouvir", na barra de destaque, lê só o trecho (a seleção, a frase ou o destaque) e para.
- O log diz por que a barra de destaque não abriu ou fechou logo depois de abrir.

## 1.1.0 — nov/2026

- **Voz natural**, que roda no computador: Kokoro em inglês (Heart, Bella, Michael, Isabella, George) e em
  português do Brasil (Dora, Alex), e as vozes leves do Piper em inglês (Kristin, LJSpeech, Norman, John).
  Números, moedas, romanos e abreviações são lidos por extenso. Sem espera entre parágrafos e capítulos.
- **Slider de posição** no rodapé, nos dois formatos.
- **Aparência em três abas** (Leitura, Voz, Interface) e botões e opções com o mesmo visual em todo o app.
- O leitor e a biblioteca se arrumam em todos os tamanhos de janela.
- O suporte específico ao leitor de tela Orca foi adiado até a interface estabilizar.

## 1.0.0 — nov/2026

- Primeira versão estável. PDF por trechos (um PDF de 86 MB abre em menos de 1 s), texto acessível do PDF,
  recuperação quando o processo da página cai, AppImage testado em Ubuntu, Debian, Fedora e Arch.

## 0.9.0 — out/2026

- Leitura em voz alta no PDF, com a frase lida realçada; listas e código lidos mais devagar.
- Tipografia que reage ao texto no EPUB (código, títulos, largura em caracteres por linha).
- Destaques fixados ao lado do texto e dois pontos do mesmo livro lado a lado, nos dois formatos.

## 0.8.0 — out/2026

- Uma ideia por vez; sessões de leitura e metas; modo foco com hora para sair.
- "Quanto falta" no seu ritmo; trechos revisitados; "onde você parou" ao reabrir um livro.

## 0.7.0 — out/2026

- O app passa a se chamar **Folio**, com ícone próprio; a biblioteca é levada para as pastas novas sozinha.
- Ctrl+D destaca a frase atual, sem o mouse (EPUB e PDF); destaques com motivo (dúvida, citar, revisar).
- Primeiro AppImage.

## 0.6.0 — out/2026

- Destaques e notas no EPUB e no PDF, com cores, cópia, Desfazer e exportação em Markdown.

## 0.5.0 — out/2026

- Paleta de comandos (Ctrl+K) e modo foco.

## 0.4.0 — out/2026

- Aparência em seções iguais nos dois formatos; a cor da página separada do tema da interface.
- Capas que sumiam do cache são refeitas; o progresso é gravado a cada página. Painéis flutuantes.

## 0.3.1 — out/2026

- Cor da página no PDF (creme, sépia, noite).

## 0.3.0 — out/2026

- Estantes (Lendo, Para ler, Lidos, Favoritos), lixeira com Desfazer, coleções e autores.

## 0.2.0 — out/2026

- Novo visual; avisos (toasts); busca e filtros na biblioteca; arrastar arquivos para importar.

## 0.1.0 — out/2026

- Versão inicial: biblioteca, leitura de EPUB e PDF, preferências de leitura, temas, atalhos, leitura em voz
  alta de EPUB e transições animadas.
