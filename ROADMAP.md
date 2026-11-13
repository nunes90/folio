# Roadmap do Folio

Cada marco precisa terminar em algo utilizável. (O app se chamava "Leitor" até out/2026.)

- [x] **M0 — Esqueleto**: workspace Cargo (`core` + `app`), Tauri abrindo uma janela, logging com tracing, CI (Ubuntu), cargo deny, pre-commit hook.
- [x] **M1 — Abrir EPUB**: abrir um arquivo, ler com paginação via foliate-js, navegar pelo índice.
- [x] **M2 — Biblioteca**: importar livros, listar com capas, salvar o progresso (SQLite).
- [x] **M3 — PDF**: abrir PDFs com pdf.js, com zoom, busca e texto selecionável.
- [ ] **M4 — Acessibilidade**: fontes (inclusive para dislexia), tamanho, espaçamento de linha e letra, largura de coluna, temas (alto contraste, sépia, escuro), movimento reduzido, TTS, navegação completa por teclado, teste com Orca.
  - [x] M4a — preferências de leitura (fontes, tamanho, espaçamentos, largura, alinhamento)
  - [x] M4b — temas e movimento reduzido
  - [x] M4c — teclado completo, foco e testes com Orca (roteiro em `docs/testes/orca.md`)
  - [x] M4d — leitura em voz alta (TTS) de EPUB via speech-dispatcher (ADR 0007). Atenção à qualidade da voz: o padrão do sistema (espeak-ng via
    speech-dispatcher) é muito robótico; avaliar vozes neurais locais (ex.: Piper, com vozes pt-BR)
- [x] **M5 — Animações e polimento**: virada de página, transições, respeitando `prefers-reduced-motion`.
  Tudo igual para EPUB e PDF (moldura e tokens de animação comuns).
  - [x] M5a — base de animação, moldura comum dos leitores, painéis, diálogos e microinterações
  - [x] M5b — transições entre telas (biblioteca ↔ leitor)
  - [x] M5c — virada de página
  - [x] M5d — janelas estreitas (painéis por cima do livro), estados de carregamento
- [ ] **M6 — Empacotamento**: AppImage (Flatpak depois). M6a na v0.7 (build de teste na CI), M6b na v1.0.

**v0.1.0** (out/2026): M0–M5. Tag `v0.1.0`, Release como pre-release no GitHub.

## v0.2

**v0.2.0** (out/2026): M7 (refinamento visual) e M8 (biblioteca que escala). Tag `v0.2.0`, Release como pre-release.
- [x] **M7 — Refinamento visual**: a parte adaptada do design system proposto (análise em
  `docs/design/redesign.md`). Igual para EPUB e PDF; contraste testado nos 4 temas; medidas em `rem`.
  - [x] M7a — tokens: superfícies (app, painel, card, hover), texto secundário/suave, divisória, sombra, raio e
    destaque no `Cores` de `lib/temas.ts`, com testes de contraste
  - [x] M7b — barras e painéis do leitor: botões de ícone, título centralizado, paginação compacta, barra de
    progresso, índice com item ativo destacado, cabeçalho dos painéis
  - [x] M7c — biblioteca: cards com progresso na capa, selo EPUB/PDF e "% lido", estado vazio, teclas (kbd) no F1
- [x] **M8 — Biblioteca que escala**: cada parte traz seus componentes da análise do redesign.
  - [x] M8a — avisos (toasts): sucesso em `role="status"`, erro em `role="alert"`, pausa sob o ponteiro ou o foco;
    importar avisa quando o livro já estava na biblioteca (`Importado::JaExistia` no core)
  - [x] M8b — situação do livro no core (não iniciado / lendo / concluído)
  - [x] M8c — busca (título e autor) e filtros Todos · Lendo · Concluídos
  - [x] M8d — arrastar arquivos para importar (o botão "Importar livros…" continua)

## v0.3 — navegação da biblioteca

**v0.3.0** (out/2026): M9 (estantes, lixeira, favoritos, ícones no card), M10 (coleções) e M11 (autores). Tag
`v0.3.0`, Release como pre-release.
Barra lateral com listas e destinos, não abas (8 destinos não cabem em abas, nem no teclado nem em janela estreita).
"Vistas" (Todos, Lendo, Para ler, Lidos) são listas inteligentes; "navegação" (Coleções, Autores, Séries) agrupa;
a Lixeira é outro estado do livro. A busca continua no topo e filtra a vista atual.

- [x] **M9 — Vistas e lixeira**
  - [x] M9a — core: migração 3 com `para_ler`, `lido_em` (lido manual, vence o progresso) e `removido_em`
    (lixeira); marcar para ler / lido, mover para a lixeira, restaurar, apagar de vez, esvaziar. `Situacao`
    considera o lido manual. Abrir um livro tira "Para ler". Importar um livro que está na lixeira o restaura.
  - [x] M9b — barra lateral: Todos · Lendo · Para ler · Lidos, com contagem, setas e `aria-current`
    (substitui os filtros do M8c); painel em janela estreita. A Lixeira entra na barra no M9c, junto com as ações dela
  - [x] M9c — Lixeira na barra lateral e ações do livro: menu "Mais ações" sempre visível (e tecla Menu / Shift+F10) com Para ler, Marcar
    como lido e Mover para a lixeira; vista da lixeira com Restaurar, Apagar de vez e Esvaziar (só esses pedem
    confirmação); aviso com "Desfazer"
  - [x] M9d — ícones no card: ☆ Favorito, 🔖 Para ler e ✓ Lido como botões liga/desliga (aviso a cada ação), ⋯ no
    fim da linha; estante "Favoritos" (migração 4, `favorito_em`); "Favoritar" também no menu (teclado)
  - Decisões: a lixeira nunca se esvazia sozinha; "Para ler" sai ao abrir o livro; a lista se chama "Lidos".
- [x] **M10 — Coleções**
  - [x] M10a — core: migração 5 (`colecoes`, `livros_colecoes`); criar, renomear, apagar (os livros ficam), listar
    com quantidade (fora da lixeira); adicionar e tirar livros; `LivroNaBiblioteca.colecoes`; nomes vazios ou
    repetidos (sem diferenciar maiúsculas, inclusive com acento) recusados. Comandos finos no app.
  - [x] M10b — interface: seção "Coleções" na barra lateral (contagem, "Nova coleção"); na vista da coleção,
    Renomear e Apagar; no menu do livro, "Adicionar à coleção…" (diálogo com caixas de seleção e criar ali mesmo) e
    "Tirar desta coleção"; ícone de pasta "Coleções" na linha de ícones do card
- [x] **M11 — Autores**: item "Autores" na barra lateral abre a lista de autores (com quantos livros cada um tem e a
  busca filtrando); escolher um autor mostra os livros dele. Tudo no frontend (`lib/autores.ts`): grafias que só
  diferem em acentos ou maiúsculas contam como o mesmo autor; livros sem autor em "Autor desconhecido".
- [ ] **Séries** (adiado, decisão de out/2026): ler `calibre:series` (EPUB 2) e `belongs-to-collection` (EPUB 3) no
  core, migração e releitura dos livros já importados. Só se fizer falta: PDFs e muitos EPUBs não trazem série.
- [x] **M12 — Página do PDF**: presets Original (padrão), Creme, Sépia e Noite no painel Aparência do PDF, com
  amostra. Creme e sépia: camada `multiply` (o preto continua preto). Noite: `invert(0.9) hue-rotate(180deg)` aplicado
  nos pixels de cada página desenhada (filtro CSS derrubava a virada para ~30 qps no WebKitGTK; o `ctx.filter` não
  funciona nele). A área ao redor das páginas segue o tema (M7).

**v0.3.1** (out/2026): M12 (cor da página do PDF) e correções (camada de creme/sépia, avisos acima do rodapé, noite sem
clarão). Tag `v0.3.1`, Release como pre-release.

- [x] **M13 — Aparência: Interface · Página · Texto**: "tema" deixou de significar três coisas. **Interface**
  (claro, escuro, alto contraste, do sistema) só pinta o app; **Página** (automática, original, creme, sépia, noite)
  é o papel do livro, com os mesmos nomes e amostras no EPUB e no PDF; **Texto** é a tipografia (só EPUB). Página
  automática segue a interface (escura → noite); interface em alto contraste força a página do EPUB. Preferências
  antigas migradas no core (tema sépia → interface clara + página sépia; `paginaPdf` → `pagina`).
- [x] **Correções**: capas que sumiram do cache são refeitas ao abrir a biblioteca; o progresso é gravado a cada
  mudança de página (a espera de 1 s perdia a última página ao fechar a janela).
- [x] **Painéis flutuantes**: painéis do leitor e barra de estantes viram cartões com margem, cantos arredondados e
  sombra leve.

**v0.4.0** (out/2026): M13 (Interface · Página · Texto), capas e progresso, painéis flutuantes. Tag `v0.4.0`,
Release como pre-release.

- [x] **M14 — Paleta de comandos** (Ctrl+K): buscar uma ação ou um livro pelo nome.
  - [x] **M14a**: registro de comandos (`lib/comandos.ts`), `Paleta.svelte` (combobox + listbox), comandos da
    biblioteca (importar, buscar, estantes, coleções, lixeira), aparência da interface, atalhos e abrir livro.
  - [x] **M14b**: comandos do leitor: páginas, painéis, capítulos do índice, cor da página e virada (EPUB e PDF);
    texto e voz (EPUB); busca, zoom, exibição e "Ir para a página N" digitando o número (PDF).
- [x] **M15 — Modo foco**: só o livro na tela (botão, Ctrl+Shift+F ou paleta; Esc sai). As barras flutuam por cima
  quando chamadas (ponteiro na borda ou Tab), sem repaginar o livro; progresso discreto no canto. Igual no EPUB e no
  PDF. Não é lembrado entre as sessões.
**v0.5.0** (out/2026): M14 (paleta de comandos) e M15 (modo foco). Tag `v0.5.0`, Release como pre-release.

- [x] **M16 — Destaques e notas**
  - [x] **M16a**: core. Tabela `destaques` (migração 6), criar/listar/cor/nota/apagar/restaurar, contagem no livro,
    exportar em Markdown. Comandos finos e tipos TS.
  - [x] **M16b**: EPUB. Barra sobre a seleção (cores, Nota, Copiar; num destaque, Apagar), Ctrl+D pelo teclado,
    marca-texto do foliate-js com contraste testado em todas as páginas, aba "Destaques" no índice, nota, apagar com
    Desfazer, exportar em Markdown, comandos na paleta.
  - [x] **M16c**: PDF. Mesmos recursos do EPUB (lógica comum em `ControleDestaques`); trecho guardado como página e
    retângulos em frações da página; camada própria sobre cada página do pdf.js. O arquivo do PDF não muda.

**v0.6.0** (out/2026): M16 (destaques e notas no EPUB e no PDF, exportar em Markdown). Tag `v0.6.0`, Release como
pre-release.

## Rumo à v1.0

Princípios que valem para tudo daqui em diante:
- **A leitura inteira operável sem o mouse**: todo recurso novo tem atalho ou comando na paleta (Ctrl+K).
- **Tudo local**: ritmo, sessões e releituras ficam só no computador; tom neutro, sem gamificação.
- **Igual no EPUB e no PDF**, como desde o M5; quando o PDF não permitir, dizer o porquê.

### v0.7 — o texto em blocos e frases
A base de vários recursos: saber onde estão os blocos (parágrafos) e as frases, nos dois formatos.
- [x] **M17a — Blocos e frases no EPUB**: segmentação (o `tts.js` do foliate-js já divide; frases com
  `Intl.Segmenter`). **Destacar a frase atual**: Ctrl+D sem seleção destaca a primeira frase da página (ou a que a
  voz está lendo); Alt+↑/↓ trocam de frase, Alt+Shift+↓ estende; para quem usa só o teclado, sem leitor de tela.
  **Ouvir a partir daqui**: da frase atual, da seleção ou de um destaque.
- [x] **M17b — Blocos e frases no PDF**: linhas da camada de texto do pdf.js agrupadas em blocos (espaço entre
  linhas e tamanho da letra) e divididas em frases; destacar a frase atual no PDF. "Ouvir daqui" no PDF vem com a
  voz no PDF (M23).
- [x] **M6a — AppImage de teste**: a CI gera o AppImage (`cargo tauri build --bundles appimage`) a cada tag `v*`
  e o anexa à Release como pre-release, com o nome provisório. Serve para achar cedo os problemas de empacotamento
  (WebKitGTK embutido, NVIDIA/Wayland, associação a EPUB e PDF) testando numa distribuição limpa.
- [x] **M18 — Destaques que servem para reler**: motivo do destaque (dúvida, citar, revisar), independente da
  cor (migração 7); filtro na aba Destaques; exportar só "para citar" em Markdown; tudo também na paleta.

**v0.7.0** (out/2026): M17a, M17b, M6a, M18 e o nome **Folio** (com ícone). Tag `v0.7.0`, Release como
pre-release, com o AppImage anexado pela CI.

### v0.8 — o ritmo de quem lê
- [x] **M19 — Uma ideia por vez**: opcional (Ctrl+Shift+B, botão da lâmpada, paleta; Esc sai; não é lembrado).
  Só o bloco atual em evidência, o resto esmaecido (só visual: o leitor de tela lê tudo). Enquanto ligado, o
  livro rola em vez de paginar: ↑/↓ passam de bloco e o texto rola até ele ficar no meio da tela; clicar num
  parágrafo o escolhe. Respeita o movimento reduzido. No PDF, os blocos seguem a ordem de leitura (recorte XY) e
  só o texto principal entra (figuras, legendas, margem, cabeçalho e rodapé ficam esmaecidos).
- [x] **M20 — Sessões e metas** (em três partes: M20a sessões no core, M20b meta da sessão, M20c saída
  planejada do modo foco e barras só pelo teclado; meta em minutos nos dois formatos, "até o fim do capítulo" no EPUB e páginas só no
  PDF, onde são fixas): sessões de leitura no core (migração 8: início, fim, de onde a onde). Meta da
  sessão ("20 min" ou "15 páginas") com barra discreta e, ao fim, uma pausa suave e um resumo ("você parou em…"),
  sem sequência de dias nem ranking. Modo foco com saída planejada ("sair em 1 página / 5 min") e opção de
  revelar as barras só pelo teclado.
- [x] **M21 — Progresso honesto** (M21a ritmo e estimativas, M21b trechos revisitados): ritmo real de quem lê (das sessões) para estimar "~40 min neste capítulo";
  "você voltou várias vezes a este trecho" (visitas guardadas no core). Dados só locais, tom neutro.
- [x] **M22 — Continuação ao reabrir**: "Da última vez você estava em <capítulo>" e as 2–3 frases anteriores ao
  ponto em que parou, tiradas do próprio texto (sem resumo gerado, sem IA).

**v0.8.0** (out/2026): M19 (uma ideia por vez), M20 (sessões, meta da sessão, foco planejado), M21 (ritmo e
trechos revisitados) e M22 (onde você parou). Tag `v0.8.0`, Release como pre-release, com o AppImage.

### v0.9 — voz, tipografia e comparação
- [x] **M23 — Voz com acompanhamento** (M23a voz no PDF, M23b frase realçada e velocidade por trecho): destaque da frase estável (pendência do M4d), velocidade por trecho (mais
  devagar em listas e código; o SSIP permite por mensagem), voz no PDF com o mesmo modelo do EPUB.
- [x] **M24 — Tipografia que reage ao texto** (EPUB): `pre`/`code` sempre em monoespaçada, títulos com mais ar,
  largura de coluna que respeita o livro e a preferência (em caracteres por linha: cresce com a letra).
- [x] **M25 — Comparar trechos** (M25a destaques fixados ao lado, M25b lado a lado no EPUB, M25c no PDF): dois pontos do mesmo livro lado a lado (a moldura dividida, cada lado com a
  sua posição), e um destaque ou nota fixado ao lado do texto. EPUB e PDF. Atenção ao custo de dois leitores no
  WebKitGTK (medir memória e quadros por segundo).

**v0.9.0** (out/2026): M23 (voz no PDF, frase lida realçada, velocidade por trecho), M24 (tipografia do EPUB) e
M25 (destaques fixados ao lado, dois pontos do livro lado a lado no EPUB e no PDF). Tag `v0.9.0`, Release como
pre-release, com o AppImage.

### v1.0 — pronto para distribuir
- [x] **M26 — Acabamento** (M26a densidade do leitor ✓, M26b arquivos problemáticos e roteiro de desempenho ✓, M26c E2E na CI ✓,
  M26d modo frase no lado e roteiro do Orca reescrito ✓, M26e licença, README e guia ✓, queda com o Orca corrigida e
  recuperação da página ✓, partes principais do roteiro do Orca com voz real ✓).
- [x] **M6b — Empacotamento final**: AppImage com o nome e o ícone definitivos, `.desktop` e associação a EPUB e PDF
  conferidos, teste em Ubuntu, Debian, Fedora e Arch na CI; "Abrir com" pelo menu do sistema e AppImage em NVIDIA/Wayland
  conferidos à mão. Flatpak (Flathub) depois da 1.0.

**v1.0.0-rc.1** (out/2026): M26 e M6b, sem o roteiro do Orca. Tag `v1.0.0-rc.1`, Release como pre-release, com o
AppImage. A `v1.0.0` estável vem depois de executar o roteiro.

**v1.0.0-rc.2** (nov/2026): correções do Orca (interface como aplicativo, avisos pelo serviço D-Bus dele), PDF por trechos,
animações mais curtas e virada padrão "nenhuma". Roteiro do Orca em parte: falta repetir, com voz real, o F1, a leitura do PDF
com as setas e o modo de navegação depois da paleta.

**v1.0.0** (nov/2026): versão estável. Desde a rc.2: texto do PDF em parágrafos para o leitor de tela, queda do card da
biblioteca corrigida, anúncio do F1 e fração NaN. Limitação conhecida: no modo de navegação do Orca dentro da interface,
o WebKitGTK ainda pode abortar a página (o Folio recarrega e avisa).

## Depois da 1.0

- [ ] **M27 — Voz neural local** (inglês primeiro, pt-BR depois): Kokoro v1.0 (Apache-2.0) no ONNX Runtime
  (`ort`), modelo int8 baixado sob demanda (~142 MB), pronúncia pelo espeak-ng. Escolhido depois de ouvir
  Piper e Kokoro lado a lado (out/2026): o Kokoro soou melhor; o int8 soa igual ao completo e gera ~4× mais
  rápido que o tempo real (Ryzen 7 3800X). A sherpa-onnx 2.0 foi descartada: tirou o espeak-ng e pula as
  palavras fora do dicionário.
  - [x] M27a — síntese no core (`core::kokoro`): fonemas (espeak-ng) e ONNX Runtime oficial, as duas
    bibliotecas carregadas durante a execução (a do ONNX Runtime vem com a voz); tokens, vozes, modelo
  - [x] M27b — `MotorNeural` (implementa `MotorDeVoz`): gera a frase seguinte enquanto a atual toca,
    marcas no início de cada frase, saída de áudio (rodio); escolha do motor pelo idioma do livro
    (`MotorPorIdioma`). Por enquanto ligado por `FOLIO_VOZ_NEURAL=<pasta>` (até o M27c). Pendentes para o M27c:
    o PDF não manda idioma (vai ao sistema); a saída de som e o modelo ficam abertos depois da primeira fala
  - [x] M27c — catálogo de vozes, download e escolha da voz
    - [x] M27c-1 — core e comandos: catálogo (`catalogo_vozes`: modelo, arquivos com URL fixa, SHA-256 e tamanho,
      o ONNX Runtime da arquitetura, as vozes; pronto para outros modelos), download conferido e atômico (`baixar`),
      voz e "usar em inglês" nas preferências, motor neural reconfigurável, amostra, modelo e saída de som fechados
      depois de 2 min sem falar, idioma do PDF (`/Lang`) na escolha da voz
    - [x] M27c-2 — seção "Voz" no painel Aparência dos dois formatos (modelo, baixar com progresso, cancelar,
      remover, voz com amostra, usar em livros em inglês, velocidade, que sai de Texto e Página), aviso sem o
      espeak-ng, paleta, "Preparando a voz…"
  - [x] M27d-1 — normalização do texto em inglês (moeda, anos, décadas, romanos, abreviações) e frases longas
    faladas em pedaços cortados na pontuação. (O chiado era a voz Emma, trocada pela Isabella: `fix/voz-isabella`.)
  - [x] M27d-2 — AppImage com a libespeak-ng e os dados dela (compilada na CI, sem dependências de som)
  - [x] M27d-3 — ADR 0008 (voz neural), guia e roteiro do Orca (falta executar 9.5–9.12 com o Orca)
  - [x] M27e — Piper como segundo modelo (nov/2026): vozes leves em inglês (Kristin, LJSpeech, Norman, John), ~10×
    mais rápidas que o Kokoro, uma por download. Nenhuma voz do Piper em português tem licença limpa (todas vêm de
    vozes de licença só para pesquisa ou não comercial); o português segue com Dora e Alex
  - [x] pt-BR com o Kokoro: a Dora (o Alex e o Santa não soaram bem), normalização do português (números por
    extenso, moeda, romanos, abreviações, horas) e uma voz por idioma no motor
  - [x] Alex, a voz masculina do português (nov/2026), com o filtro da Dora e escolha de voz no português

- [x] **Slider de posição** (nov/2026): arrastar para qualquer ponto do livro, igual nos dois formatos e nos dois
  lados; teclado (passo, um décimo, as pontas) e leitor de tela (a porcentagem ou a página e o capítulo); "37%" na
  paleta do EPUB.

- [x] **Orca adiado** (nov/2026): o suporte específico ao leitor de tela sai até a interface estabilizar
  (`docs/leitor-de-tela.md`).

- [x] **M28 — Clareza** (nov/2026): revisão de design, sem recursos novos.
  - [x] M28a — botões em três variantes (padrão, primário, discreto) e grupos de opções sem caixa, comuns a tudo;
    alvos de 44 px no toque; capturas das telas em seis larguras (`e2e/specs/capturas.e2e.js`)
  - [x] M28b — Aparência em três abas (Leitura, Voz, Interface), com escolhas compactas (segmentado, amostras)
  - [x] M28c — o leitor em todos os tamanhos (índice aberto só em janela larga, rodapé compacto, lupa no PDF)
  - [x] M28d — a biblioteca em todos os tamanhos (grade que acompanha a janela, card só com a estrela e o ⋯)

**v1.1.0** (nov/2026): voz natural (Kokoro, com Dora e Alex no português, e as vozes leves do Piper), voz sem espera
entre parágrafos, slider de posição, M28 (clareza: componentes, Aparência em abas, todos os tamanhos de tela) e o
Orca adiado. Tag `v1.1.0` e Release, com o AppImage da CI.

**v1.1.1** (nov/2026): "Ouvir" lê só o trecho; o log diz por que a barra de destaque não abriu; E2E também no WebKitGTK do
AppImage (Ubuntu 22.04). Tag `v1.1.1` e Release, com o AppImage da CI.

## Depois da análise (nov/2026)

Plano para implementar o que a análise apontou (`docs/analise/2026-11-analise.md`; o número entre parênteses é a
seção dela). Um PR por item, todos com base na `main`. Três versões: a primeira sem risco para os dados e quase sem
interface nova; a segunda paga a dívida dos leitores; a terceira é acabamento e produto.

### v1.2 — base firme e busca

- [x] **M29 — Biblioteca sem travar a janela** (5.1–5.5): medido (um comando leve esperava 443 ms durante a importação
  de 4 PDFs de 86 MB; agora, 23 ms no pior caso); importar e abrir fazem disco e CPU sem a trava, e a importação não
  deixa arquivo órfão; `travar` recupera a trava de um pânico; SQLite com `busy_timeout`, `synchronous = NORMAL` e
  `journal_size_limit`. Os comandos curtos seguem sem `async` (rodam na ordem das chamadas) e o `conferir_capas`
  ficou na abertura.
- [x] **M30 — Instância única** (5.3): `tauri-plugin-single-instance`; o segundo "Abrir com" entrega o arquivo à
  janela que já existe (e a traz para a frente). Desligada nas compilações de depuração.
- [x] **M31 — E2E do EPUB hostil** (6): `hostil.epub` e `specs/seguranca.e2e.js` (nenhum script roda, o app não é
  alcançado, nenhum pedido sai; conferido que falha com a CSP afrouxada); a CSP não vale no `tauri dev`; `npm audit`
  informativo na CI; pdf.js com `isEvalSupported: false`.
- [x] **M32 — Busca no EPUB** (4): Ctrl+F nos dois formatos com a mesma barra (`BuscaPdf` virou `Busca`); `search.js`
  do foliate-js; ocorrências contornadas e a atual realçada, próxima/anterior, contagem, paleta, F1. Só no documento
  principal, como no PDF (a busca no lado fica para depois, nos dois formatos).
- [x] **M33 — Documentação e CI** (10)
  - [x] M33a — `CLAUDE.md` enxuto (visão, stack, arquitetura, convenções, "Armadilhas conhecidas", modo de trabalho
    real) e o histórico em `docs/historico.md`; `CHANGELOG.md` e `CONTRIBUTING.md`; README dizendo o que a
    acessibilidade cobre hoje
  - [x] M33b — actions atualizadas e fixadas por SHA; `ubuntu-26.04` e `.nvmrc` no lugar de `latest`/`lts`;
    Dependabot semanal agrupado; `SHA256SUMS` e atestação de proveniência na Release
  - [x] M33c — teste de migração com um banco de cada versão publicada (v0.1 a v1.1) nas fixtures

### v1.3 — os leitores em ordem

- [x] **M34 — Controles comuns aos dois leitores** (7.1–7.3). Cada um nos moldes do `ControleDestaques` (classe com
  runes + adaptador por formato), com testes de unidade com adaptador falso; sem mudança de comportamento (os E2E
  são a rede)
  - [x] M34a — `ControleVoz` (estado, pausar/retomar, trecho ouvido, aviso de preparo, bloco seguinte, eventos)
  - [~] M34b — `ControleLado`: **não feito, de propósito.** Olhando o código, o que os dois leitores têm em comum no
    lado a lado são quatro funções curtas (~30 linhas em cada); o resto é do formato (o EPUB espera os dois lados
    assentarem e acerta o CFI; o PDF guarda o zoom). Um controle com adaptador ficaria maior do que o que substitui.
  - [~] M34c — `ControleIdeia` e a continuação: **não feito, pelo mesmo motivo.** As funções têm o mesmo nome, mas o
    corpo é de cada formato (o EPUB esmaece nós do documento e rola o foliate-js; o PDF move um véu sobre a página); o
    que era comum já está em `lib/umaIdeia.ts`, `lib/continuacao.ts` e `lib/piscar.ts`.
  - [x] M34d — `App.svelte`: os comandos da paleta por tela em `lib/comandosDoApp.ts` (puro, com testes); 733 → 657
    linhas. O estado da tela ficou no `App` (um módulo de runes só mudaria as variáveis de lugar).
  - [x] M34e — `MolduraLeitor`: a estimativa e a meta do rodapé num componente próprio (`InfoDoRodape`; 1.168 → 1.094
    linhas); as capturas do M28 como artefato da CI nos PRs de layout (`capturas.yml`). O rodapé inteiro e o modo foco
    ficaram na moldura: o CSS deles depende do estado dela (foco, lado, compacto), e separá-los só trocaria regras
    locais por `:global`.
  - A meta de ~700 linhas por leitor não se sustenta: a análise contou 31 funções de mesmo nome como duplicação, e só
    as da voz eram. Os leitores ficam em ~1.470 e ~1.735 linhas; o ganho que resta é testá-los, não encolhê-los.
- [x] **M35 — Links e notas** (4)
  - [x] M35a — "de onde vim" nos dois formatos: os saltos (link, índice, destaque, slider, campo da página, busca)
    guardam o ponto de partida; Alt+← volta, e depois de um link um aviso oferece "Voltar"; paleta e F1
  - [x] M35b — notas de rodapé em balão no EPUB, sem sair da página (as regras do `footnotes.js`; o balão é nosso);
    "Ir até a nota" com Alt+← de volta. Só no documento principal, não no lado
  - [x] M35c — link externo com confirmação, nos dois formatos, aberto no navegador pelo `tauri-plugin-opener` (só
    `http`/`https`, decidido no core); os outros esquemas não abrem, com aviso
- [x] **M36 — Biblioteca grande** (5.7, 7.4): toda capa gravada vira uma miniatura (JPEG de até 480 px, no core, com o
  crate `image`), e as grandes que já estavam no cache são reduzidas uma vez, em segundo plano. A grade é desenhada
  em lotes de 120 cartões, conforme a rolagem. Medido com 5.000 livros: voltar do leitor à biblioteca, de 3,5 s para
  0,55 s. O `content-visibility` foi medido e descartado (só reduzia o layout pela metade, e corta o que sai do cartão).
- [x] **M37 — Descoberta** (9): a paleta ganhou porta visível (botão "Comandos" na biblioteca; "Todos os comandos…"
  no menu ⋯ do leitor, e não na barra, pela regra de densidade); a biblioteca vazia ensina Ctrl+K e F1; no modo foco,
  o canto diz se a voz está lendo ou pausada.
- [ ] **M38 — Cópia de segurança** (4): "Exportar a biblioteca…" (banco e preferências, com ou sem os livros) e
  "Restaurar…" com confirmação; formato versionado

### v1.4 — acabamento e produto

- [ ] **M39 — Memória do PDF** (8): achar os ~180 MB sem dono (inspetor do WebKit ou `heaptrack`); testar o cache de
  páginas e `maxCanvasPixels`; orçamento de tempo de abertura na CI (`medir-pdf` num PDF fixo)
- [ ] **M40 — Pacote e código** (5.8–5.12, 7.5, 7.6)
  - [ ] M40a — erros tipados nos comandos (`{ tipo, mensagem }`) e o frontend sem comparar texto
  - [ ] M40b — `[profile.release]` (LTO thin, `codegen-units = 1`, `strip`), medido; `commit_from_file` nos modelos;
    `ort` estável quando sair; a feature `_ring` do `ureq`
  - [ ] M40c — só as regras do `pdf_viewer.css` que o app usa; `@font-face` só com `.woff2` e `latin-ext`; módulos
    do foliate-js sem uso fora do pacote (ou assumir MOBI/FB2: decidir)
  - [ ] M40d — escala de `z-index` nomeada, tamanho mínimo da janela, revisão dos `svelte-ignore`, `exportar_destaques`
    só para o caminho que o diálogo devolveu
- [ ] **M41 — Rodapé e ícones** (9): estimativa e meta fora do rodapé (proposta com capturas antes); ícones com o
  mesmo peso de traço
- [ ] **M42 — Marcadores e destaques da biblioteca** (4, 9): marcador de página sem trecho (migração nova, os dois
  formatos); vista "Todos os destaques" com busca e filtro por motivo
- [ ] **M43 — Lixeira com prazo e aviso de versão** (4, 9): espaço ocupado e "esvaziar itens antigos"; consulta
  opcional às Releases, desligável e descrita no guia
- Em aberto, a decidir: tradução da interface, Séries, Flatpak, cortar recursos pouco usados (anotar o uso por um mês)

## Futuro
- **macOS** (adiado, ADR 0006): voltar com o job na CI, `.dmg` no empacotamento e testes com o VoiceOver.
  O código já trata o macOS em alguns pontos (diretório de logs, escala de texto) e deve continuar compilando.
- **Windows**.
