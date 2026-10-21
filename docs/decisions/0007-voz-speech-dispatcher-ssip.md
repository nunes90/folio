# 0007 — Leitura em voz alta: speech-dispatcher por SSIP próprio, motor trocável

**Status:** aceita

## Contexto
O M4d precisava de leitura em voz alta no Linux. Foram testadas, no app real (WebKitGTK 2.54, speech-dispatcher 0.12):
- **`speechSynthesis` da webview**: não existe no WebKitGTK sem a `libspiel`, que não vem nas distribuições.
- **crate `tts`** (via `libspeechd`): funciona, mas exige `bindgen`/`libclang` para compilar e liga o app à `libspeechd` (sem ela, o app nem abre).
- **crate `ssip-client`** (Rust puro, protocolo SSIP): na 0.10.2 perde marcas de índice (bug de índice em `receive_event`; `receive()` recusa a resposta com `TooManyLines`), nem sempre trata o tempo limite de leitura como "nada chegou" e descarta linhas lidas quando o tempo limite cai no meio de uma resposta.

Também se descobriu que o módulo espeak-ng do speech-dispatcher só emite **a primeira** marca de um SSML com marcas soltas no texto; com cada frase dentro de `<s>`, emite todas.

## Decisão
- Cliente SSIP próprio e mínimo (`crates/core/src/ssip.rs`): socket Unix, decodificador que guarda respostas incompletas entre leituras, testado com um transcript real.
- `MotorDeVoz` (trait em `crates/core/src/voz.rs`), com a implementação `SpeechDispatcher`. A lógica é uma máquina de estados pura (`Estado`), testada sem socket; uma thread só executa as ações dela.
- Um bloco (parágrafo) por mensagem, em SSML com uma marca por frase dentro de `<s>`. O frontend converte o SSML do `tts.js` do foliate-js para esse formato (`ui/src/lib/voz.ts`). A marca alcançada destaca a frase (`tts.setMark`); o fim do bloco pede o próximo, inclusive no capítulo seguinte.
- Cancelar, pausar e retomar usam o escopo `self`: só as falas do Leitor, nunca as do Orca.
- A voz é opcional: sem o speech-dispatcher, o app abre e só a leitura em voz alta fica indisponível.

## Consequências
- Nenhuma dependência nova (o SSIP é texto num socket).
- A qualidade da voz é a do sistema (espeak-ng por padrão, bem robótica). Vozes melhores dependem de configurar o speech-dispatcher (ex.: Piper) ou de um motor neural local no futuro, implementando o mesmo trait.
- Só EPUB por enquanto; PDF (pela camada de texto do pdf.js) fica para depois.
- `cargo test -p leitor-core -- --ignored fala_de_verdade` testa com o speech-dispatcher real (fala em voz alta; não roda na CI).
