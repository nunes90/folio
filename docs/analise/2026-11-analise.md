# Análise do Folio (nov/2026, v1.1.1)

Análise do projeto inteiro, de código e de conceito, feita sobre a `main` em `8fd5aaa`. Cada achado diz
de onde veio: **medido** (rodei e vi o número), **testado** (experimento feito para esta análise),
**lido** (está no código, mas o efeito não foi medido) ou **opinião** (julgamento de produto ou de design).

## 1. Resumo

O Folio está em bom estado para um projeto de três semanas: a arquitetura combinada (core puro, comandos
finos) foi respeitada, há 259 testes em Rust e 537 no frontend, E2E em dois WebKitGTK, e o conteúdo do livro
está bem isolado do app (testado, seção 6). Não achei nenhum defeito grave.

Os problemas são de três tipos:

1. **Um risco de travamento da janela** que o código atual permite: a biblioteca inteira fica atrás de um
   `Mutex`, comandos longos o seguram, e 45 dos 54 comandos rodam na thread principal.
2. **Lacunas de leitor básico** que destoam do resto: não há busca no texto do EPUB, não há "voltar" depois de
   seguir um link ou nota, e links externos não fazem nada. O app tem voz neural e leitura lado a lado, mas
   falta isso.
3. **Dívida de estrutura no frontend**: `Leitor.svelte` e `LeitorPdf.svelte` somam 3.300 linhas, têm 31 funções
   de mesmo nome e nenhum teste de componente.

### O que eu faria primeiro

| # | O quê | Por quê | Tamanho |
|---|-------|---------|---------|
| 1 | Tirar o trabalho pesado de dentro do `Mutex` da biblioteca | Importar ou abrir um livro grande pode congelar a janela | Médio |
| 2 | Busca no EPUB (Ctrl+F) | Recurso básico que falta; o PDF já tem | Médio |
| 3 | Instância única | Dois "Abrir com" seguidos abrem dois apps no mesmo banco | Pequeno |
| 4 | Teste E2E do EPUB hostil | O isolamento depende de uma linha da CSP e hoje nada a protege | Pequeno (já escrito) |
| 5 | Encolher o `CLAUDE.md` | 106 KB lidos em toda sessão | Pequeno |
| 6 | Voltar depois de link e abrir links externos | Notas de rodapé hoje são viagem só de ida | Pequeno/Médio |
| 7 | Extrair o controle da voz dos dois leitores | A maior duplicação do frontend | Grande |

O plano completo, em ordem, está na seção 11.

## 2. Como a análise foi feita

- **Lido por inteiro**: `main.rs`, `comandos.rs`, `piper.rs`, `tauri.conf.json`, os `Cargo.toml`, os três
  workflows, `deny.toml`, `wdio.conf.js`, e a maior parte de `biblioteca.rs`.
- **Lido por amostra** (estrutura, assinaturas, buscas dirigidas): `voz_neural.rs`, `baixar.rs`, `epub.rs`, os
  cinco componentes grandes e o `App.svelte`.
- **Medido**: linhas por arquivo, `npm run build` (tamanho de cada pedaço), contagem de testes, o binário de
  release, a pasta de dados real daqui.
- **Testado**: um EPUB feito para atacar o app (seção 6), aberto no app compilado, numa tela virtual.
- **Não feito**: perfil de CPU ou de memória novo (uso os números já anotados no `CLAUDE.md`), revisão linha a
  linha de `voz_neural.rs`, `destaques.rs`, `sessoes.rs` e `visitas.rs`, e teste de uso com pessoas.

## 3. Retrato

| | |
|---|---|
| Rust | 12.403 linhas; 259 testes (10 ignorados, que são ferramentas); 7 arquivos com `proptest` |
| Frontend | 12.116 linhas em 41 componentes; 5.645 em `lib/`; 537 testes em 66 arquivos |
| Maiores arquivos | `LeitorPdf.svelte` 1.831, `biblioteca.rs` 1.678, `voz_neural.rs` 1.663, `Leitor.svelte` 1.467, `MolduraLeitor.svelte` 1.168 |
| Comandos Tauri | 54 (45 na thread principal, 9 `async`) |
| `unsafe` | 11 usos, todos em `kokoro/fonemas.rs` (FFI do espeak-ng), mais o `set_var` do DMABUF |
| Página compilada | 7,5 MB (4,1 MB são recursos do pdf.js; 1,3 MB o worker dele) |
| Binário de release | 26,9 MB |
| Histórico | 271 commits desde 20/out/2026 |
| TODO/FIXME | nenhum; 6 `@ts-expect-error`/`any` fora dos testes |

## 4. Conceito e produto

### O que está bem resolvido

- **Paridade entre EPUB e PDF** como regra. Destaques, voz, modo frase, lado a lado e metas funcionam igual nos
  dois. Poucos leitores fazem isso, e é o que mais distingue o Folio.
- **Operável sem mouse**: paleta, F1 por grupo, atalho para tudo. A regra foi seguida de verdade.
- **Decisões registradas com o motivo**: os ADRs e as notas sobre o WebKitGTK (zoom, View Transitions, `filter`
  no canvas) evitam repetir erros caros.
- **Honestidade nos números**: sem ritmo medido, sem estimativa; folhear não conta como leitura. Isso é raro e
  dá confiança no que o app mostra.

### Lacunas de leitor básico

Estas faltam e são esperadas em qualquer leitor. Todas **lidas** no código.

1. **Busca no texto do EPUB.** O `Ctrl+F` do leitor só existe no PDF (`atalhos.ts:189`). O `search.js` do
   foliate-js já está no bundle (2,3 kB) e não é usado. É a lacuna mais visível.
2. **Voltar depois de um link.** Clicar numa nota de rodapé ou numa referência cruzada leva ao destino e não há
   como voltar ao ponto de origem (nenhum histórico em `Leitor.svelte`). O PDF tem o mesmo problema com o
   sumário e os destaques. Proposta: uma pilha de "de onde vim", com `Alt+←` e um aviso "Voltar para onde eu
   estava" por alguns segundos.
3. **Links externos não fazem nada.** O foliate-js chama `window.open`, que o Tauri ignora (testado: nenhuma
   janela, nenhum pedido de rede). Hoje é um clique morto. Proposta: confirmar ("Abrir example.com no
   navegador?") e abrir pelo `tauri-plugin-opener`.
4. **Notas de rodapé em balão.** O `footnotes.js` do foliate-js mostra a nota sem sair da página; está no
   vendor, sem uso. Resolve o caso mais comum do item 2.
5. **Marcadores.** Só existem destaques. Um marcador de página sem trecho é mais leve e muito usado no PDF.

### Lacunas de produto

- **Cópia de segurança.** Destaques, notas, sessões e progresso vivem num SQLite local, e a única saída é o
  Markdown por livro. Um "Exportar a biblioteca…" (o banco e, opcionalmente, os livros num arquivo) protege o
  que o usuário mais valoriza. Importar de volta fecha o ciclo.
- **Aviso de versão nova.** O AppImage não se atualiza e o app não avisa. Uma consulta opcional às Releases do
  GitHub, desligável, bastaria. Hoje o app só usa a internet para baixar vozes; isso mudaria e precisa estar
  no guia.
- **Idioma da interface.** Tudo está em português, direto no código. O app tem vozes em inglês e detecta cinco
  idiomas de livro, mas quem não lê português não usa a interface. Não é urgente; decidir cedo se haverá
  tradução evita espalhar mais texto pelos componentes.
- **Descoberta dos recursos.** Meta da sessão, foco com hora para sair, "quanto falta", trechos revisitados e
  boa parte do lado a lado só existem na paleta, e a paleta não tem botão: só `Ctrl+K` e o F1. Quem não conhece
  o atalho nunca chega lá. Proposta mínima: um botão "Comandos (Ctrl+K)" nas duas barras e um item no menu ⋯.

### Coerência do conceito (opinião)

- **Acessibilidade.** O `CLAUDE.md` e o README põem "acessibilidade ampla" como prioridade, e o leitor de tela
  foi adiado. A decisão foi sensata, mas o README deveria dizer claramente o que funciona hoje (teclado,
  contraste, fontes, voz) e o que não (Orca), para não prometer mais do que entrega.
- **Largura do escopo.** Em três semanas entraram voz neural com dois motores, lado a lado, metas, ritmo,
  revisitas e continuação. Cada um tem custo de manutenção num app que depende de um WebKitGTK frágil. Antes de
  recursos novos, eu fecharia as lacunas básicas acima e pagaria a dívida da seção 7.
- **Recursos sem evidência de uso.** "Trechos revisitados" e a "meta de capítulo" são engenhosos, mas não há como
  saber se servem a alguém. Sem telemetria (e está certo não ter), vale a pena você anotar por um mês quais
  usa de fato e cortar o que não usar.

## 5. Backend (Rust)

### Pontos fortes

- O `core` não conhece o Tauri, e os comandos são de fato finos. Tudo que importa tem teste sem janela.
- Erros tipados no core, migrações numeradas com transação, gravação por arquivo `.parcial` e `rename`.
- O download de vozes confere tamanho e SHA-256 enquanto chega, com URLs presas a um commit.
- Limites na leitura do EPUB (4 MB por XML, 20 MB por capa): um zip malicioso não estoura a memória.
- `proptest` nos parsers; fixtures de arquivos quebrados.

### Problemas

**5.1 O `Mutex` da biblioteca e a thread principal (lido; o mais importante).**
`EstadoBiblioteca` é um `Mutex<Biblioteca>`. `importar_livros` (`comandos.rs:56`) segura a trava durante o
laço inteiro: ler o arquivo, calcular o SHA-256, interpretar o PDF, copiar. `abrir_livro` (`:81`) lê o arquivo
inteiro com a trava. São `async`, então rodam fora da thread principal. Mas os outros 45 comandos rodam nela, e
qualquer um que peça a trava nesse intervalo (`salvar_progresso`, `registrar_sessao`, `listar_livros`) **para a
thread principal** até a importação terminar. Com a janela parada, o compositor pode oferecer "forçar
fechamento". Importar dez PDFs grandes com um livro aberto é o caso.

O `trecho_livro` já faz certo: trava só para achar o caminho e lê depois. Proposta, em dois passos:

1. No `importar`, fazer o trabalho de disco e de CPU sem a trava (ler, hash, metadados) e travar só para a
   consulta "já existe?" e o `INSERT`. O mesmo no `abrir_livro`: achar o caminho com a trava, ler sem ela.
2. Marcar como `async` todo comando que toca o banco. Assim a thread principal nunca espera por trava nenhuma.
   O custo é pequeno (uma troca de thread por chamada).

**5.2 `lock().unwrap()` em 41 lugares (lido).** Se um comando entrar em pânico com a trava, ela fica
envenenada e todos os comandos seguintes entram em pânico também: o app continua aberto e nada funciona. Um
auxiliar `fn biblioteca(&State) -> MutexGuard` com `unwrap_or_else(PoisonError::into_inner)` resolve num lugar
só. O SQLite continua íntegro depois de um pânico, então recuperar a trava é seguro aqui.

**5.3 Sem instância única (lido).** Não há `tauri-plugin-single-instance`. Abrir um segundo arquivo pelo
gerenciador de arquivos inicia outro processo sobre o mesmo banco: duas sessões de leitura, duas vozes, e
escritas concorrentes sem `busy_timeout` (o segundo `INSERT` falha com "database is locked" em vez de esperar).
O plugin passa o arquivo para a janela que já existe. Enquanto isso, um `PRAGMA busy_timeout = 5000` evita o
erro.

**5.4 Importação não é atômica (lido).** A ordem é: gravar a cópia do livro, gravar a capa, `INSERT`
(`biblioteca.rs:414–424`). Se o `INSERT` falhar, o arquivo fica órfão em `livros/`. Não perde dado, só ocupa
disco. Dá para inverter (inserir numa transação, gravar, confirmar) ou varrer órfãos em `conferir_capas`.

**5.5 Ajustes do SQLite (lido; parte medida).**
- `synchronous` fica no padrão (`FULL`): em WAL, cada gravação faz `fsync`. O progresso é gravado a cada página
  virada, na thread principal. Em SSD não se nota; em disco mecânico, sim. `synchronous = NORMAL` em WAL não
  corrompe o banco e só arrisca as últimas gravações numa queda de energia.
- Aqui, o banco tem 143 KB e o `-wal` tem 4,1 MB, com o app fechado (medido). A conexão não é fechada ao sair,
  então o WAL nunca é incorporado nem encolhido. Não há risco para os dados, mas um
  `PRAGMA wal_checkpoint(TRUNCATE)` ao encerrar e um `journal_size_limit` deixam a pasta limpa.
- `prepare_cached` no lugar de `prepare` nas consultas repetidas (progresso, sessão) poupa o parse do SQL.

**5.6 `conferir_capas` roda na abertura, dentro do `setup` (lido).** Faz um `stat` por capa e, se faltar, lê o
EPUB inteiro de novo, antes de a janela aparecer. Com 10 livros é nada; com 2.000, atrasa o início. Mover para
uma thread depois de a janela abrir.

**5.7 Capas no tamanho original (medido).** A capa do EPUB é gravada como vem: aqui há uma de 1,29 MB e uma de
472 KB, para um cartão de ~200 px. Cada uma é decodificada inteira na grade. As de PDF já são geradas com 400 px.
Reduzir as de EPUB ao importar (no frontend, com canvas, como já se faz no PDF, para não trazer um crate de
imagem) corta memória e tempo de rolagem numa biblioteca grande.

**5.8 Comandos repetitivos e erros como texto (lido).** `comandos.rs` tem ~50 funções quase iguais
(`lock`, chamar, `map_err(registrar)`), e todo erro chega ao frontend como `String`. Duas melhorias:
- um `enum ErroDoComando` serializável (`{ tipo, mensagem }`), para o frontend distinguir "coleção já existe" de
  "disco cheio" sem comparar texto;
- uma macro ou um auxiliar `com_biblioteca(|b| …)` que concentre a trava e o registro do erro.

**5.9 `exportar_destaques` aceita qualquer caminho (lido).** O caminho vem do diálogo de salvar, então o uso
normal é seguro, e a página não roda código de fora (seção 6). Fica como defesa em profundidade: se um dia a
página for comprometida, esse comando escreve onde quiser. Baixa prioridade.

**5.10 Compilação de release sem ajuste (lido).** Não há `[profile.release]`. Com `lto = "thin"`,
`codegen-units = 1` e `strip = true`, o binário de 26,9 MB deve cair bastante e a síntese de voz pode ganhar um
pouco. É uma mudança de quatro linhas; medir antes e depois. Eu não usaria `panic = "abort"`: com ele, um
pânico em qualquer thread (um comando, a síntese de voz) derruba o app inteiro em vez de falhar só ali.

**5.11 Dependências a vigiar (lido).**
- `ort = "=2.0.0-rc.15"`: versão candidata fixada. Trocar pela estável quando sair.
- `ureq` com a feature `_ring`: o sublinhado indica feature interna, que pode mudar sem aviso numa versão menor.
- O modelo ONNX é lido para a memória e passado ao `commit_from_memory` (`kokoro/modelo.rs:51`,
  `piper.rs:132`): o arquivo existe duas vezes na RAM durante a carga. `commit_from_file` evita.

**5.12 `voz_neural.rs` com 1.663 linhas.** Motor, fila, saída de som, preparo do bloco seguinte e os testes num
arquivo só. Funciona e tem testes, mas é o arquivo mais difícil de mudar com segurança. Separar em `motor`,
`saida` e `fila` quando for mexer nele de novo, não antes.

## 6. Segurança

### O teste do EPUB hostil (testado)

O foliate-js mostra cada capítulo num iframe com `sandbox="allow-same-origin allow-scripts"` (o WebKit exige
isso para os eventos). Com isso, a única barreira entre um script dentro de um EPUB e os comandos do app é a
CSP (`script-src 'self' 'wasm-unsafe-eval'`). Se ela falhasse, um livro poderia chamar
`parent.__TAURI_INTERNALS__.invoke("apagar_livro", …)`.

Montei um EPUB com: `<script>` embutido, `<script src>` de dentro do livro, `onerror` numa imagem, link
`javascript:`, imagem, CSS `@import`, fonte, iframe, `<object>` e áudio apontando para um servidor local, e um
link externo. Abri no app compilado (WebKitGTK 2.54) e conferi o documento e o registro do servidor.

| Tentativa | Resultado |
|---|---|
| Script embutido, script de arquivo, `onerror`, `javascript:` | Nenhum rodou |
| Acesso a `parent.__TAURI_INTERNALS__` e ao DOM do app | Não aconteceu |
| Imagem, CSS, fonte, iframe, objeto e áudio remotos | Nenhum pedido chegou ao servidor |
| Clique no link externo | Nada: nenhuma janela, nenhum pedido |

O servidor foi conferido à parte (respondeu a um pedido de controle). **O isolamento funciona**: um livro não
executa código nem "liga para casa" (um rastreador de leitura embutido num EPUB não funciona no Folio).

Limites do teste: uma versão do WebKitGTK, build de depuração, um formato de ataque por tipo. Não cobre falhas
do próprio WebKit nem dos decodificadores de imagem e fonte.

### Recomendações

1. **Transformar esse teste em E2E permanente.** A proteção inteira depende de uma linha do `tauri.conf.json`;
   alguém afrouxando a CSP para resolver outro problema (por exemplo, `blob:` em `script-src`) abriria o app
   sem perceber. O EPUB e o spec estão prontos; falta levá-los para `tests/fixtures/` e `e2e/specs/`.
2. **No `cargo tauri dev` a CSP não vale** (a página vem do Vite). Não abrir livros de origem duvidosa em modo
   de desenvolvimento. Vale uma linha no `CLAUDE.md`.
3. `cargo deny` já roda na CI. Falta o equivalente do frontend: `npm audit --omit=dev` como passo informativo.
4. O PDF: confirmar que o pdf.js está com `enableScripting` desligado (é o padrão do `PDFViewer` sem
   `scriptingManager`, e nenhum é passado em `LeitorPdf.svelte:404`; lido, não testado).

## 7. Frontend

### Pontos fortes

- Lógica pura em `lib/`, com teste; componentes pequenos em sua maioria (37 dos 41 têm menos de 500 linhas).
- `ControleDestaques` com um adaptador por formato é o padrão certo, e deveria se repetir.
- Cores só em `temas.ts` (um único hexadecimal solto em todos os componentes), contraste testado, `rem`.
- 28 dos 41 componentes têm teste, com axe-core.

### Problemas

**7.1 Os dois leitores (medido).**

| | Linhas | Script | `$state` | Funções |
|---|---|---|---|---|
| `LeitorPdf.svelte` | 1.831 | 1.574 | 26 | 57 |
| `Leitor.svelte` | 1.467 | 1.275 | 22 | 47 |

Os dois têm **31 funções com o mesmo nome** (`lerEmVozAlta`, `aoEventoVoz`, `pausarOuRetomar`, `falarTrecho`,
`prepararSeguinte`, `ligarIdeia`, `andarIdeia`, `montarContinuacao`, `abrirAoLado`…). É o mesmo fluxo escrito
duas vezes, e todo ajuste (o "Ouvir só o trecho" da v1.1.1, por exemplo) precisa ser feito nos dois, com o
risco de divergirem. E **nenhum dos dois tem teste de componente**: só os E2E os exercitam.

Proposta, na ordem do retorno:

1. **`ControleVoz`** (`lib/controleVoz.svelte.ts`), nos moldes do `ControleDestaques`: estado (parado, lendo,
   pausado, trecho ouvido), pausar e retomar, o aviso de preparo, o preparo do bloco seguinte e o tratamento
   dos eventos. O adaptador de cada formato responde "qual é o próximo bloco", "mostre a frase lida" e "vá
   para a página seguinte". É a maior fatia da duplicação e a parte que mais mudou nas últimas versões.
2. **`ControleLado`**: abrir, fechar, alternar e os comandos da paleta.
3. **`ControleIdeia`** (uma ideia por vez) e **continuação**.

Cada extração vem com testes de unidade com um adaptador falso, o que resolve também a falta de testes. Meta
realista: os dois componentes abaixo de 700 linhas, só com o que é próprio do formato.

**7.2 `App.svelte` (733 linhas, 16 `$state`).** Monta a lista de comandos da paleta, cuida de sessão, meta,
importação e avisos. A montagem dos comandos por tela sai inteira para `lib/` (função pura, testável). O estado
da tela atual (biblioteca ou leitor, livro aberto) cabe num módulo de runes, como já são `vozNatural` e
`aparencia`.

**7.3 `MolduraLeitor.svelte` (1.168 linhas, 467 de CSS).** Faz grid, painéis, modo foco, meta, continuação,
densidade do rodapé e lado a lado. O CSS mostra o acúmulo: regras para estreita, compacta, com lado, com foco
e as combinações. Separar o rodapé (`RodapeLeitor`) e o modo foco tira metade. É a peça que mais quebra em
tamanhos de tela incomuns, então vale ter as capturas do M28 rodando na CI como artefato a cada PR de layout.

**7.4 Grade da biblioteca sem janela de rolagem (lido).** Todos os cartões vão para o DOM. O filtro custa
7,7 ms com 5.000 livros (medido antes), mas desenhar 5.000 cartões não foi medido. As imagens já usam
`loading="lazy"`. O remédio mais barato é CSS: `content-visibility: auto` com `contain-intrinsic-size` em cada
cartão, sem mudar o código. Conferir no WebKitGTK 2.50 do AppImage antes de confiar.

**7.5 O que vai no pacote (medido).**
- `LeitorPdf.css` tem **233 KB**: é o `pdf_viewer.css` inteiro, com o editor de anotações, formulários e
  assinatura, que o Folio não usa. Importar só as regras de página, camada de texto e busca reduz a uma fração.
- Formatos que o app não abre entram no pacote: `mobi.js` (23 kB), `fb2.js` (7 kB), `comic-book.js`,
  `fixed-layout.js`. São carregados sob demanda, então não pesam ao abrir, mas ou se assume o suporte (MOBI e
  FB2 quase de graça no leitor, faltando o core reconhecer o formato) ou se tira.
- Quatro arquivos `.woff` (192 KB) acompanham os `.woff2`: vêm do CSS do Fontsource e o WebKitGTK nunca os
  pede. Declarar os `@font-face` à mão, só com `.woff2`, os elimina.
- As fontes são só do subconjunto `latin`. Português, inglês, espanhol, francês e alemão estão cobertos;
  polonês, tcheco, turco, grego e cirílico caem na fonte do sistema no meio da palavra. Incluir `latin-ext` é
  barato e evita a mistura.

**7.6 Detalhes.**
- `z-index` solto (valores 1, 2, 3, 4, 5, 10, 20 em arquivos diferentes). Uma escala nomeada no `app.css`
  (`--camada-painel`, `--camada-barra`, `--camada-aviso`, `--camada-dialogo`) evita a corrida de números.
- Janela sem tamanho mínimo (`tauri.conf.json`). O layout foi conferido até 360 px; abaixo disso, quebra.
  `minWidth: 360, minHeight: 400`. Em compositor tiling a regra é ignorada, mas vale nos demais.
- 14 `svelte-ignore`: revisar se cada um ainda é necessário.

## 8. Desempenho

O que já foi medido e está bom (do `CLAUDE.md`): virada de página a ~60 qps no EPUB; PDF de 86 MB abre em
~740 ms por trechos; importação a 0,1 s; filtro de 5.000 livros em 7,7 ms.

Onde ainda há ganho, por ordem de impacto esperado:

| Item | Ganho esperado | Evidência |
|---|---|---|
| Trabalho pesado fora do `Mutex` (5.1) | Fim dos congelamentos ao importar | Lido |
| Memória do PDF (~350 MB anônimos, ~180 MB sem explicação) | O maior consumo do app | Medido antes; causa em aberto |
| Miniaturas das capas (5.7) | Memória e rolagem da biblioteca | Medido (capa de 1,29 MB) |
| `content-visibility` na grade (7.4) | Bibliotecas grandes | Não medido |
| `synchronous = NORMAL` (5.5) | Virada de página em disco lento | Lido |
| `conferir_capas` fora do `setup` (5.6) | Início com muitos livros | Lido |
| CSS do pdf.js enxuto (7.5) | Abertura do primeiro PDF | Medido (233 KB) |
| Perfil de release (5.10) | Tamanho do binário | Não medido |

Sobre a memória do PDF: os ~180 MB sem dono merecem uma sessão com o inspetor do WebKit (linha do tempo de
memória) ou com `heaptrack` no `WebKitWebProcess`. Hipóteses a testar, do mais para o menos provável: o cache
de páginas do `PDFViewer` (10 páginas de canvas em escala alta; `maxCanvasPixels` e o tamanho do buffer são
configuráveis), as fontes decodificadas pelo worker, e os dois canvas da inversão no tema noite.

Falta um **orçamento de desempenho na CI**. O `medir-pdf.e2e.js` já mede; rodá-lo num PDF fixo e falhar se
abrir passar de um limite folgado pega regressões sem ninguém precisar lembrar de medir.

## 9. Design e experiência (opinião, salvo indicação)

O M28 resolveu o grosso: três variantes de botão, a Aparência em abas, o leitor e a biblioteca de 360 a 2.560
px. O que eu ainda mexeria:

1. **A paleta precisa de uma porta visível** (seção 4). É o melhor recurso de navegação do app e está
   escondido atrás de um atalho.
2. **Primeiro uso.** A biblioteca vazia mostra um botão de importar. Faltam duas frases que digam o que o app
   tem de diferente e como chegar lá ("Ctrl+K abre todos os comandos", "F1 mostra os atalhos"). Sem tutorial.
3. **Rodapé do leitor.** Com voz, posição, zoom, estimativa e meta, é a área mais densa da tela. A estimativa
   e a meta poderiam ir para o canto do cabeçalho ou só aparecer no modo foco, deixando o rodapé para navegar.
4. **Estado da voz.** Pelo que li, durante a leitura em voz alta a única indicação fora do rodapé é a frase
   realçada, que continua igual na pausa. No modo foco, com o rodapé escondido, não dá para saber se a voz está
   lendo ou pausada (não conferi no app). Um indicador pequeno no canto, junto da porcentagem, resolveria.
5. **Lixeira sem prazo.** Os livros ficam na lixeira para sempre, com a cópia do arquivo em disco. Mostrar o
   espaço que ela ocupa e oferecer "esvaziar itens com mais de 30 dias".
6. **Destaques entre livros.** Há a aba Destaques por livro, mas não uma vista "todos os meus destaques", com
   busca e filtro por motivo. Para quem estuda, é o passo natural depois do M18.
7. **Ícones.** O ícone do app foi marcado como definitivo, mas o conjunto de ícones da interface foi crescendo
   recurso a recurso. Uma passada só para igualar peso de traço e tamanho óptico dá acabamento com pouco custo.

## 10. Testes, CI e processo

### Testes

- Bom: 796 testes de unidade, snapshots, `proptest`, fixtures quebradas, E2E em dois WebKitGTK.
- Falta: teste de componente dos leitores (7.1); o E2E de segurança (6); um teste de migração com um banco de
  cada versão publicada (v0.1 a v1.1), que é onde um erro custa os dados do usuário; cobertura medida
  (`cargo llvm-cov` e `vitest --coverage`, só como informação).

### CI

- As actions estão em `@v4` (`checkout`, `setup-node`, `upload-artifact`, `download-artifact`), que rodam em
  Node 20, já em fim de vida nos runners. Atualizar de uma vez.
- `ubuntu-latest` vai mudar de versão por baixo. O `e2e.yml` já fixa o 22.04 num dos lados; fixar também o
  outro (`ubuntu-24.04`) torna a troca uma decisão, não uma surpresa.
- `node-version: lts/*` tem o mesmo problema: fixar com `.nvmrc`.
- Falta um Dependabot ou Renovate (cargo, npm, actions), com PRs agrupados por semana.
- As actions de terceiros (`Swatinem/rust-cache`, `EmbarkStudios/cargo-deny-action`, `dtolnay/rust-toolchain`)
  são referenciadas por tag. Fixar por SHA do commit é a prática recomendada para quem publica binários.
- O AppImage não tem assinatura nem soma de verificação publicada. Um `SHA256SUMS` anexado à Release é o
  mínimo; atestação de proveniência do GitHub (`attest-build-provenance`) é quase de graça.

### Documentação e processo

- **O `CLAUDE.md` tem 106 KB** (medido). É lido inteiro em cada sessão, e a maior parte é histórico de marcos
  já entregues. Isso gasta contexto e esconde as regras que importam. Proposta:
  - `CLAUDE.md` com visão, stack, arquitetura, convenções e armadilhas do WebKitGTK (umas 150 linhas);
  - `docs/historico.md` com a seção "Estado atual", marco a marco, consultado quando preciso;
  - as armadilhas que hoje estão enterradas nos marcos (o `#locked` do foliate, um ambiente ONNX por processo,
    `untrack` nos efeitos, contêiner só de botões) reunidas numa seção "Armadilhas conhecidas".
- Faltam `CHANGELOG.md` para quem usa o app (as notas das Releases já existem; é só reuni-las) e
  `CONTRIBUTING.md` (como compilar, rodar os testes, o padrão de commit).
- O `CLAUDE.md` ainda descreve três modos de trabalho com você escrevendo o core; na prática o modo é um só
  (eu escrevo, você revisa). Atualizar para o que é verdade.
- Na pasta de dados daqui há dois arquivos vazios que não são do app: `biblioteca.db` e um chamado literalmente
  `*.db` (medido). Devem ser sobra de comandos manuais de sessões anteriores; pode apagar.

## 11. Plano sugerido

**Agora (uma versão 1.1.2 ou 1.2, sem recursos novos além da busca):**

1. Trabalho pesado fora do `Mutex`; comandos do banco como `async`; trava que se recupera de pânico (5.1, 5.2).
2. Instância única e `busy_timeout` (5.3).
3. E2E do EPUB hostil (6).
4. Busca no EPUB (4).
5. `CLAUDE.md` enxuto e histórico separado (10).
6. CI: actions atualizadas, versões fixadas, `SHA256SUMS` na Release (10).

**Depois (1.3):**

7. `ControleVoz` com testes; em seguida `ControleLado` (7.1).
8. Voltar depois de link, notas em balão, links externos com confirmação (4).
9. Miniaturas das capas, `content-visibility`, ajustes do SQLite, `conferir_capas` em segundo plano (5, 7.4).
10. Botão da paleta e texto de primeiro uso (9).
11. Cópia de segurança da biblioteca (4).

**Quando der:**

12. Investigar os ~180 MB do PDF (8).
13. Erros tipados nos comandos (5.8), perfil de release (5.10), CSS do pdf.js enxuto (7.5).
14. Marcadores, destaques entre livros, aviso de versão nova, `latin-ext` nas fontes.
15. Decidir sobre tradução da interface, MOBI/FB2 e Flatpak.

## 12. O que esta análise não cobre

- Nenhuma correção foi feita; o repositório só ganhou este arquivo.
- Os efeitos dos itens marcados como **lido** não foram medidos. O 5.1 em particular merece uma reprodução
  (importar vários PDFs grandes com um livro aberto e virar páginas) antes de virar prioridade número um.
- Não revisei linha a linha o motor de voz, os destaques, as sessões nem as visitas.
- As opiniões de design são minhas, sem teste com usuários.
