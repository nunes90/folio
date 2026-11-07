# 0008 — Voz natural: Kokoro no ONNX Runtime, baixada à parte, com o espeak-ng para a pronúncia

**Status:** aceita

## Contexto
A voz do sistema (espeak-ng pelo speech-dispatcher, ADR 0007) é robótica, e ouvir um livro inteiro nela cansa. O
Folio deveria ter uma voz natural que rode no computador da pessoa, sem conta e sem nuvem, e que não pese em quem não
a usa. Foram testados no app real (out–nov/2026):

- **Kokoro v1.0** (82M parâmetros, Apache-2.0): a melhor voz em inglês entre os modelos locais leves. Gera ~3,5× o
  tempo real neste computador, só na CPU. O int8 (`csukuangfj/kokoro-int8-multi-lang-v1_0`, 114 MB) e o fp32
  (325 MB) do mesmo autor soam praticamente iguais na medição e para o ouvido, e o fp32 é só ~10% mais rápido.
- **sherpa-onnx 2.0** (que também roda o Kokoro): descartado. Não usa o espeak-ng, e as palavras fora do dicionário
  dele eram puladas.
- **O binário do ONNX Runtime que a crate `ort` baixa ao compilar**: exige a glibc 2.38, e o AppImage é feito no
  Ubuntu 22.04 (2.35). O oficial da Microsoft (1.31, MIT) pede a glibc 2.28.
- **O pacote `libespeak-ng` do Ubuntu dentro do AppImage**: puxa o PulseAudio, o libsndfile e mais uma dúzia de
  bibliotecas, só para a saída de som que o Folio não usa.
- **As vozes do catálogo**, ouvidas no mesmo trecho de um livro: a Emma (`bf_emma`) tem um chiado de fundo nos agudos
  que um passa-baixa não limpa. A Isabella (`bf_isabella`) entrou no lugar dela.

## Decisão
- **Motor**: `MotorNeural` implementa o mesmo `MotorDeVoz` do speech-dispatcher (`core::voz_neural`). O SSML com uma
  marca por frase é o mesmo; uma thread sintetiza frase a frase e põe na fila da saída a marca e o áudio, e a marca
  dispara quando o áudio dela começa a tocar. A saída (rodio) abre já a 24 kHz mono, a taxa do modelo: o servidor de
  som converte com qualidade, e o rodio, por interpolação linear, deixava a voz áspera. Frases longas vão em pedaços
  cortadas na pontuação só quando não ficariam prontas antes de a fila acabar (cada pedaço é sintetizado sozinho e o
  modelo fecha a entonação no fim dele: cortar sempre deixava a frase picada). Pelo mesmo motivo, as frases que o
  `Intl.Segmenter` separa sem ser fim de frase (abreviação, fala seguida de minúscula) vão juntas ao modelo. Enquanto
  um bloco toca, o começo do seguinte já é gerado (`preparar`): sem isso, cada parágrafo esperava o modelo.
- **Por idioma**: `MotorPorIdioma` manda o inglês e o português (cada um ligável) à voz natural (se baixada e ligada) e o resto ao sistema. O PDF
  informa o idioma do arquivo (`/Lang`); sem idioma, vai ao sistema.
- **Pronúncia**: o espeak-ng dá os fonemas (só a pronúncia; a voz é a do modelo), carregado durante a execução. Antes
  dele, o inglês é normalizado onde ele erra (moeda, anos, romanos, abreviações; `kokoro::normalizar_ingles`). O
  AppImage leva um espeak-ng próprio, compilado na CI sem nenhuma saída de som, em `usr/lib/folio/espeak-ng` (2,6 MB,
  só os dicionários do inglês e do português); o app o procura ali antes do sistema.
- **Download**: nada da voz vai no app. Na seção Voz, o modelo int8, as vozes, a tabela de fonemas e o ONNX Runtime
  oficial da arquitetura (152 MB no total) são baixados de endereços presos a uma versão (o commit no Hugging Face, a
  Release no GitHub), com tamanho e SHA-256 conferidos enquanto chegam, numa pasta `.parcial` renomeada no fim
  (`core::catalogo_vozes`, `core::baixar`). O ONNX Runtime é carregado durante a execução (`ort` com `load-dynamic`).
- **Recursos**: o modelo (~300 MB de memória) e a saída de som só abrem na primeira fala e fecham depois de 2 min sem
  falar.
- **Catálogo**: cinco vozes em inglês (Heart, Bella e Michael, americanas; Isabella e George, britânicas), a Heart por
  padrão. O catálogo é uma lista de modelos, para outro motor (Piper) entrar como linhas novas.

## Consequências
- Quem não baixa a voz natural não paga nada: o app não cresce, e sem o modelo, o espeak-ng ou o ONNX Runtime ele abre
  normalmente, com a voz do sistema.
- A primeira fala depois de abrir (ou de 2 min parado) demora ~1 s para carregar o modelo; o app mostra
  "Preparando a voz…".
- Inglês e português do Brasil. Das três vozes do Brasil, a Dora (`pf_dora`) e, depois de juntar as frases picadas,
  o Alex (`pm_alex`) soaram bons, os dois com o passa-baixa em 8 kHz; o Santa, não; no português, todo número
  solto é escrito por extenso (`kokoro::normalizar_portugues`): o espeak-ng lia "1869" certo, mas numa palavra só nos
  fonemas, e o modelo tropeçava. Cada idioma tem a sua escolha de voz (`vozNatural` e `vozNaturalPortugues`).
- O Orca continua com a voz do sistema: a voz natural é só da leitura em voz alta.
- O download é a única vez em que o Folio usa a internet, e só quando a pessoa pede.
- Testes reais, fora da CI (precisam do modelo baixado): `FOLIO_KOKORO=<pasta> cargo test -p folio-core --release --
  --ignored kokoro_de_verdade espeak_de_verdade`; o download: `FOLIO_BAIXAR=<pasta> … --ignored kokoro_baixado`.
