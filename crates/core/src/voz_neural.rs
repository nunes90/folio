//! Motor de voz neural: implementa `MotorDeVoz` com o Kokoro (`core::kokoro`) e toca o áudio
//! pela saída de som do sistema (`rodio`).
//!
//! O frontend manda o mesmo SSML que manda ao speech-dispatcher (um bloco por vez, com uma
//! `<mark>` antes de cada frase). Aqui o bloco vira uma lista de frases; uma thread gera o áudio
//! de uma frase por vez e o põe na fila de reprodução, precedido de um aviso que emite a marca
//! quando aquele áudio começa a tocar. Como gerar é ~4× mais rápido que falar, a frase seguinte
//! fica pronta enquanto a atual toca. No fim da fila, outro aviso emite `Fim`.
//!
//! Cada `falar` e cada `parar` aumenta a `geracao`: os avisos e frases de uma geração antiga são
//! descartados (o equivalente ao `ignorar` do motor do speech-dispatcher).
//!
//! O modelo (~1 s) e a saída de som só são abertos na primeira fala, e fechados depois de
//! `OCIOSO` sem falar (o modelo ocupa ~300 MB; a saída aberta segura o dispositivo de som).
//! A pasta do modelo e a voz são trocadas com `configurar` (no app, quando o modelo é baixado ou
//! removido, ou a voz escolhida muda); a pasta nova é carregada na fala seguinte.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::Duration;

use quick_xml::Reader;
use quick_xml::events::Event;

use crate::epub::{atributo, texto_da_referencia};
use crate::kokoro::{ErroKokoro, EspeakNg, Kokoro, TAXA};
use crate::voz::{ConfigVoz, ErroVoz, EventoVoz, MotorDeVoz};

// --- partes puras --------------------------------------------------------------------------

/// Uma frase do bloco: a marca que vem antes dela (se houver) e o texto.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Frase {
    pub marca: Option<String>,
    pub texto: String,
}

/// As frases do SSML que o frontend manda (`<speak><s><mark name="0"/>Frase.</s>…</speak>`).
/// Espaços repetidos viram um só; frases sem texto e sem marca saem. SSML inválido = nada.
pub(crate) fn frases_do_ssml(ssml: &str) -> Vec<Frase> {
    let mut leitor = Reader::from_str(ssml);
    let mut frases = vec![Frase {
        marca: None,
        texto: String::new(),
    }];
    loop {
        match leitor.read_event() {
            Ok(Event::Empty(e) | Event::Start(e)) if e.local_name().as_ref() == "mark" => {
                frases.push(Frase {
                    marca: atributo(&e, "name"),
                    texto: String::new(),
                });
            }
            Ok(Event::Text(t)) => {
                if let Some(atual) = frases.last_mut() {
                    atual.texto.push_str(&t.xml10_content());
                }
            }
            Ok(Event::GeneralRef(r)) => {
                if let (Some(atual), Some(parte)) = (frases.last_mut(), texto_da_referencia(&r)) {
                    atual.texto.push_str(&parte);
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return Vec::new(),
            Ok(_) => {}
        }
    }
    for frase in &mut frases {
        frase.texto = frase.texto.split_whitespace().collect::<Vec<_>>().join(" ");
    }
    frases.retain(|f| f.marca.is_some() || !f.texto.is_empty());
    frases
}

/// A velocidade do speech-dispatcher (-100 a 100, 0 = normal) como fator do Kokoro: -100 é a
/// metade, 100 o dobro.
pub(crate) fn fator_de_velocidade(velocidade: i8) -> f32 {
    2f32.powf(f32::from(velocidade.clamp(-100, 100)) / 100.0)
}

// --- motor ---------------------------------------------------------------------------------

/// Gera o áudio de uma frase (amostras de -1 a 1, a `TAXA`).
pub(crate) trait Sintetizador: Send {
    fn sintetizar(
        &mut self,
        frase: &str,
        voz: &str,
        velocidade: f32,
    ) -> Result<Vec<f32>, ErroKokoro>;
}

/// O que vai para a fila de reprodução.
pub(crate) enum Item {
    /// Roda quando a reprodução chega a este ponto (antes do áudio que vem depois).
    Aviso(Box<dyn FnOnce() + Send>),
    Audio(Vec<f32>),
}

/// A fila de reprodução. `limpar` descarta o que ainda não tocou (inclusive os avisos).
pub(crate) trait Saida: Send + Sync {
    fn tocar(&self, item: Item);
    fn limpar(&self);
    fn pausar(&self);
    fn retomar(&self);
}

/// Quanto tempo sem falar até fechar o modelo e a saída de som.
const OCIOSO: Duration = Duration::from_secs(120);

/// Cria o sintetizador com o modelo de uma pasta.
type FabricaSintetizador = Box<dyn FnMut(&Path) -> Result<Box<dyn Sintetizador>, String> + Send>;
type FabricaSaida = Box<dyn FnMut() -> Result<Arc<dyn Saida>, String> + Send>;

struct Trabalho {
    geracao: u64,
    frases: Vec<Frase>,
    velocidade: f32,
    config: ConfigNeural,
    /// Emitir as marcas e o fim (a amostra de uma voz não emite nada).
    avisar: bool,
    /// Recebe quanto tempo de áudio foi para a fila (a amostra espera por ele); se nada falar, o
    /// canal se fecha sem resposta.
    pronto: Option<mpsc::Sender<Duration>>,
}

struct Compartilhado {
    geracao: AtomicU64,
    falando: AtomicBool,
    saida: Mutex<Option<Arc<dyn Saida>>>,
    config: Mutex<Option<ConfigNeural>>,
    eventos: mpsc::Sender<EventoVoz>,
}

impl Compartilhado {
    fn atual(&self, geracao: u64) -> bool {
        self.geracao.load(Ordering::SeqCst) == geracao
    }

    fn saida(&self) -> Option<Arc<dyn Saida>> {
        self.saida.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn emitir(&self, evento: EventoVoz) {
        let _ = self.eventos.send(evento);
    }

    fn config(&self) -> Option<ConfigNeural> {
        self.config
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Descarta o que estava sendo gerado ou tocado. Avisa `Interrompido` se estava falando.
    fn interromper(&self) {
        self.geracao.fetch_add(1, Ordering::SeqCst);
        if let Some(saida) = self.saida() {
            saida.limpar();
            saida.retomar();
        }
        if self.falando.swap(false, Ordering::SeqCst) {
            self.emitir(EventoVoz::Interrompido);
        }
    }

    fn enviar(&self, trabalhos: &mpsc::Sender<Trabalho>, mut t: Trabalho) -> Result<(), ErroVoz> {
        t.geracao = self.geracao.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(saida) = self.saida() {
            saida.limpar();
            saida.retomar();
        }
        trabalhos.send(t).map_err(|_| ErroVoz::Encerrado)
    }
}

/// O motor de voz neural. Os comandos são rápidos: o trabalho pesado fica na thread dele.
pub struct MotorNeural {
    comum: Arc<Compartilhado>,
    trabalhos: mpsc::Sender<Trabalho>,
}

/// Onde estão os arquivos da voz e qual voz usar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigNeural {
    /// A pasta com o modelo, as vozes, os tokens e a `libonnxruntime.so`.
    pub pasta: PathBuf,
    /// Nome da voz (ex.: "af_heart").
    pub voz: String,
}

impl MotorNeural {
    /// Cria o motor com o Kokoro e a saída de som do sistema, ainda sem modelo (ver
    /// `configurar`). Nada é carregado ainda.
    pub fn novo(ao_evento: impl Fn(EventoVoz) + Send + 'static) -> Self {
        let sintetizador: FabricaSintetizador = Box::new(|pasta| {
            let espeak = EspeakNg::carregar(None).map_err(|e| cadeia(&e))?;
            let kokoro = Kokoro::carregar(pasta, Box::new(espeak)).map_err(|e| cadeia(&e))?;
            Ok(Box::new(kokoro) as Box<dyn Sintetizador>)
        });
        let saida: FabricaSaida =
            Box::new(|| SaidaRodio::abrir().map(|s| Arc::new(s) as Arc<dyn Saida>));
        Self::com(sintetizador, saida, OCIOSO, ao_evento)
    }

    /// O modelo e a voz a usar; `None` = sem voz neural (o modelo foi removido). Vale a partir
    /// da fala seguinte.
    pub fn configurar(&self, config: Option<ConfigNeural>) {
        *self.comum.config.lock().unwrap_or_else(|e| e.into_inner()) = config;
    }

    pub fn configurado(&self) -> bool {
        self.comum.config().is_some()
    }

    /// Fala `texto` com `voz` (a amostra de uma voz no painel), sem eventos. Interrompe o que
    /// estava sendo falado. Espera o áudio ficar pronto (na primeira vez, o modelo carrega) e
    /// devolve quanto ele dura: o painel mostra "Tocando…" por esse tempo.
    pub fn amostra(&self, texto: &str, voz: &str) -> Result<Duration, ErroVoz> {
        let mut config = self.comum.config().ok_or(ErroVoz::SemVozNeural)?;
        config.voz = voz.to_string();
        self.comum.interromper();
        let (pronto, resposta) = mpsc::channel();
        self.comum.enviar(
            &self.trabalhos,
            Trabalho {
                geracao: 0,
                frases: vec![Frase {
                    marca: None,
                    texto: texto.to_string(),
                }],
                velocidade: 1.0,
                config,
                avisar: false,
                pronto: Some(pronto),
            },
        )?;
        resposta
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| ErroVoz::NaoFalou)
    }

    pub(crate) fn com(
        sintetizador: FabricaSintetizador,
        saida: FabricaSaida,
        ocioso: Duration,
        ao_evento: impl Fn(EventoVoz) + Send + 'static,
    ) -> Self {
        let (eventos, recebidos) = mpsc::channel();
        // Os avisos rodam na thread de áudio: só mandam o evento por um canal, e outra thread
        // o entrega (`ao_evento` pode demorar: no app, ele passa pelo Tauri).
        thread::Builder::new()
            .name("voz-neural-eventos".into())
            .spawn(move || {
                for evento in recebidos {
                    ao_evento(evento);
                }
            })
            .expect("criar a thread de eventos da voz neural");
        let comum = Arc::new(Compartilhado {
            geracao: AtomicU64::new(0),
            falando: AtomicBool::new(false),
            saida: Mutex::new(None),
            config: Mutex::new(None),
            eventos,
        });
        let (trabalhos, fila) = mpsc::channel();
        let c = Arc::clone(&comum);
        thread::Builder::new()
            .name("voz-neural".into())
            .spawn(move || laco(c, fila, sintetizador, saida, ocioso))
            .expect("criar a thread da voz neural");
        Self { comum, trabalhos }
    }
}

impl MotorDeVoz for MotorNeural {
    fn falar(&self, ssml: String, config: ConfigVoz) -> Result<(), ErroVoz> {
        let neural = self.comum.config().ok_or(ErroVoz::SemVozNeural)?;
        self.comum.falando.store(true, Ordering::SeqCst);
        self.comum.enviar(
            &self.trabalhos,
            Trabalho {
                geracao: 0,
                frases: frases_do_ssml(&ssml),
                velocidade: fator_de_velocidade(config.velocidade),
                config: neural,
                avisar: true,
                pronto: None,
            },
        )
    }

    fn disponivel(&self) -> bool {
        self.configurado()
    }

    fn pausar(&self) -> Result<(), ErroVoz> {
        if self.comum.falando.load(Ordering::SeqCst)
            && let Some(saida) = self.comum.saida()
        {
            saida.pausar();
        }
        Ok(())
    }

    fn retomar(&self) -> Result<(), ErroVoz> {
        if let Some(saida) = self.comum.saida() {
            saida.retomar();
        }
        Ok(())
    }

    fn parar(&self) -> Result<(), ErroVoz> {
        if self.comum.falando.load(Ordering::SeqCst) {
            self.comum.interromper();
        }
        Ok(())
    }
}

fn laco(
    comum: Arc<Compartilhado>,
    fila: mpsc::Receiver<Trabalho>,
    mut criar_sintetizador: FabricaSintetizador,
    mut criar_saida: FabricaSaida,
    ocioso: Duration,
) {
    // O sintetizador e a pasta de onde ele veio.
    let mut carregado: Option<(PathBuf, Box<dyn Sintetizador>)> = None;
    loop {
        let trabalho = match fila.recv_timeout(ocioso) {
            Ok(t) => t,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // Pausado conta como falando: o modelo e a saída ficam.
                if !comum.falando.load(Ordering::SeqCst) {
                    let saida = comum.saida.lock().unwrap_or_else(|e| e.into_inner()).take();
                    if carregado.take().is_some() || saida.is_some() {
                        tracing::info!("voz neural ociosa: modelo e saída de som fechados");
                    }
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        let g = trabalho.geracao;
        if !comum.atual(g) {
            continue;
        }
        // Abre o modelo (de novo, se a pasta mudou) e a saída; se falhar, tenta na próxima.
        let pasta = &trabalho.config.pasta;
        let prontos = (|| {
            if carregado.as_ref().is_none_or(|(p, _)| p != pasta) {
                carregado = None;
                carregado = Some((pasta.clone(), criar_sintetizador(pasta)?));
            }
            if comum.saida().is_none() {
                let saida = criar_saida()?;
                *comum.saida.lock().unwrap_or_else(|e| e.into_inner()) = Some(saida);
            }
            Ok::<_, String>(())
        })();
        let (Ok(()), Some((_, sint)), Some(saida)) = (prontos, carregado.as_mut(), comum.saida())
        else {
            tracing::warn!("voz neural indisponível");
            if comum.atual(g) && comum.falando.swap(false, Ordering::SeqCst) {
                comum.emitir(EventoVoz::Interrompido);
            }
            continue;
        };
        let voz = &trabalho.config.voz;
        // Uma frase que falha é pulada (sem som), mas um bloco em que nenhuma falou para a
        // leitura: senão o frontend recebia as marcas e o fim na hora e passava de bloco em bloco
        // pelo livro todo, mudo (aconteceu com a voz do espeak-ng errada para o inglês britânico).
        let (mut falou, mut falhou) = (false, false);
        let mut duracao = Duration::ZERO;
        let mut desistir = false;
        for frase in trabalho.frases {
            if !comum.atual(g) {
                break;
            }
            let audio = if frase.texto.is_empty() {
                None
            } else {
                let mut resultado = sint.sintetizar(&frase.texto, voz, trabalho.velocidade);
                // Uma falha dentro do ONNX Runtime ("GetElementType is not implemented") apareceu
                // uma vez no app numa frase que, repetida depois, sempre saiu: tenta outra vez.
                if let Err(erro) = &resultado
                    && !matches!(
                        erro,
                        ErroKokoro::VozDesconhecida(_) | ErroKokoro::IdiomaDesconhecido(_)
                    )
                {
                    tracing::warn!(
                        erro = cadeia(erro),
                        "frase não sintetizada; tentando de novo"
                    );
                    resultado = sint.sintetizar(&frase.texto, voz, trabalho.velocidade);
                }
                match resultado {
                    Ok(audio) => {
                        falou = true;
                        Some(audio)
                    }
                    Err(erro) => {
                        tracing::warn!(
                            erro = cadeia(&erro),
                            frase = frase.texto,
                            "frase não sintetizada"
                        );
                        falhou = true;
                        // A voz ou o idioma não existem: nenhuma frase vai falar.
                        if matches!(
                            erro,
                            ErroKokoro::VozDesconhecida(_) | ErroKokoro::IdiomaDesconhecido(_)
                        ) {
                            desistir = true;
                            break;
                        }
                        None
                    }
                }
            };
            if !comum.atual(g) {
                break;
            }
            // A marca de uma frase que falhou antes de qualquer outra falar não sai: se o bloco
            // todo falhar, o frontend só recebe o `Interrompido`.
            let sem_som = audio.is_none() && !frase.texto.is_empty();
            if let Some(marca) = frase
                .marca
                .filter(|_| trabalho.avisar && !(sem_som && !falou))
            {
                let c = Arc::clone(&comum);
                saida.tocar(Item::Aviso(Box::new(move || {
                    if c.atual(g) {
                        c.emitir(EventoVoz::Marca(marca));
                    }
                })));
            }
            if let Some(audio) = audio {
                duracao += Duration::from_secs_f64(audio.len() as f64 / f64::from(TAXA));
                saida.tocar(Item::Audio(audio));
            }
        }
        if comum.atual(g) && (desistir || (falhou && !falou)) {
            tracing::warn!("voz neural: nada no bloco pôde ser falado; leitura interrompida");
            if comum.falando.swap(false, Ordering::SeqCst) {
                saida.limpar();
                comum.emitir(EventoVoz::Interrompido);
            }
            continue;
        }
        if let Some(pronto) = trabalho.pronto.filter(|_| falou && comum.atual(g)) {
            let _ = pronto.send(duracao);
        }
        if comum.atual(g) && trabalho.avisar {
            let c = Arc::clone(&comum);
            saida.tocar(Item::Aviso(Box::new(move || {
                if c.atual(g) && c.falando.swap(false, Ordering::SeqCst) {
                    c.emitir(EventoVoz::Fim);
                }
            })));
        }
    }
}

/// O erro com as causas, numa linha (para o log).
fn cadeia(erro: &dyn std::error::Error) -> String {
    let mut texto = erro.to_string();
    let mut causa = erro.source();
    while let Some(c) = causa {
        texto.push_str(": ");
        texto.push_str(&c.to_string());
        causa = c.source();
    }
    texto
}

impl Sintetizador for Kokoro {
    fn sintetizar(
        &mut self,
        frase: &str,
        voz: &str,
        velocidade: f32,
    ) -> Result<Vec<f32>, ErroKokoro> {
        Kokoro::sintetizar(self, frase, voz, velocidade)
    }
}

// --- saída de som (rodio) ------------------------------------------------------------------

const MONO: std::num::NonZero<u16> = std::num::NonZero::new(1).unwrap();
const TAXA_NZ: std::num::NonZero<u32> = std::num::NonZero::new(TAXA).unwrap();

struct SaidaRodio {
    player: rodio::Player,
    /// Mantém a saída de som aberta enquanto o player existir.
    _dispositivo: rodio::MixerDeviceSink,
}

impl SaidaRodio {
    /// Abre a saída já na taxa do modelo (24 kHz, mono): quem converte para a taxa da placa é o
    /// servidor de som (PipeWire, PulseAudio), com um reamostrador de qualidade. Na taxa padrão
    /// do dispositivo (48 kHz), o rodio convertia por interpolação linear, que deixa réplicas do
    /// som acima de 12 kHz: a voz soava áspera, "de baixa qualidade". Se o dispositivo recusar
    /// 24 kHz, fica a configuração padrão.
    fn abrir() -> Result<Self, String> {
        let no_modelo = rodio::DeviceSinkBuilder::from_default_device().and_then(|b| {
            b.with_sample_rate(TAXA_NZ)
                .with_channels(MONO)
                .open_stream()
        });
        let mut dispositivo = match no_modelo {
            Ok(d) => d,
            Err(erro) => {
                tracing::info!(%erro, "saída de som a 24 kHz recusada; usando a padrão");
                rodio::DeviceSinkBuilder::open_default_sink()
                    .map_err(|e| format!("saída de som: {e}"))?
            }
        };
        tracing::info!(
            taxa = dispositivo.config().sample_rate().get(),
            canais = dispositivo.config().channel_count().get(),
            "saída de som aberta"
        );
        dispositivo.log_on_drop(false);
        let player = rodio::Player::connect_new(dispositivo.mixer());
        Ok(Self {
            player,
            _dispositivo: dispositivo,
        })
    }
}

impl Saida for SaidaRodio {
    fn tocar(&self, item: Item) {
        match item {
            Item::Aviso(aviso) => {
                // O `EmptyCallback` pede um `Fn`: o aviso roda uma vez só.
                let aviso = Mutex::new(Some(aviso));
                self.player
                    .append(rodio::source::EmptyCallback::new(Box::new(move || {
                        if let Some(a) = aviso.lock().unwrap_or_else(|e| e.into_inner()).take() {
                            a();
                        }
                    })));
            }
            Item::Audio(amostras) => {
                self.player
                    .append(rodio::buffer::SamplesBuffer::new(MONO, TAXA_NZ, amostras));
            }
        }
    }

    fn limpar(&self) {
        self.player.clear();
    }

    fn pausar(&self) {
        self.player.pause();
    }

    fn retomar(&self) {
        self.player.play();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn frases_e_marcas_do_ssml() {
        let ssml = r#"<speak><s><mark name="0"/>It was the best
            of times.</s> <s><mark name="1"/>Fish &amp; chips.</s></speak>"#;
        assert_eq!(
            frases_do_ssml(ssml),
            vec![
                Frase {
                    marca: Some("0".into()),
                    texto: "It was the best of times.".into()
                },
                Frase {
                    marca: Some("1".into()),
                    texto: "Fish & chips.".into()
                },
            ]
        );
    }

    #[test]
    fn texto_antes_da_primeira_marca_e_marca_sem_texto() {
        let ssml = r#"<speak>Title. <s><mark name="a"/></s></speak>"#;
        assert_eq!(
            frases_do_ssml(ssml),
            vec![
                Frase {
                    marca: None,
                    texto: "Title.".into()
                },
                Frase {
                    marca: Some("a".into()),
                    texto: String::new()
                },
            ]
        );
    }

    #[test]
    fn ssml_invalido_nao_fala_nada() {
        assert!(frases_do_ssml("<speak></s>").is_empty());
    }

    #[test]
    fn velocidade_vira_fator() {
        assert_eq!(fator_de_velocidade(0), 1.0);
        assert_eq!(fator_de_velocidade(100), 2.0);
        assert_eq!(fator_de_velocidade(-100), 0.5);
        assert_eq!(fator_de_velocidade(-128), 0.5);
    }

    // --- o motor com peças falsas ---

    /// Gera "áudio" de uma amostra e anota a voz; antes, espera a liberação, se houver trava.
    struct Falso {
        trava: Option<Arc<Mutex<mpsc::Receiver<()>>>>,
        vozes: Arc<Mutex<Vec<String>>>,
        /// As frases "instáveis" que já falharam uma vez.
        falharam: Vec<String>,
    }
    impl Sintetizador for Falso {
        fn sintetizar(&mut self, frase: &str, voz: &str, _: f32) -> Result<Vec<f32>, ErroKokoro> {
            if let Some(t) = &self.trava {
                let _ = t.lock().unwrap().recv_timeout(Duration::from_secs(5));
            }
            // "xx": voz que não existe; frases com "ruim": falham por outro motivo.
            if voz == "xx" {
                return Err(ErroKokoro::IdiomaDesconhecido("xx".into()));
            }
            if frase.contains("ruim") {
                return Err(ErroKokoro::ArquivoInvalido("teste".into()));
            }
            // "instável": o modelo falha na primeira tentativa.
            if frase.contains("instável") && !self.falharam.iter().any(|f| f == frase) {
                self.falharam.push(frase.to_string());
                return Err(ErroKokoro::ArquivoInvalido("instável".into()));
            }
            self.vozes.lock().unwrap().push(voz.to_string());
            Ok(vec![frase.len() as f32])
        }
    }

    /// "Toca" na hora: roda os avisos e guarda o áudio.
    #[derive(Default)]
    struct SaidaFalsa {
        tocado: Mutex<Vec<f32>>,
    }
    impl Saida for SaidaFalsa {
        fn tocar(&self, item: Item) {
            match item {
                Item::Aviso(a) => a(),
                Item::Audio(a) => self.tocado.lock().unwrap().extend(a),
            }
        }
        fn limpar(&self) {
            self.tocado.lock().unwrap().clear();
        }
        fn pausar(&self) {}
        fn retomar(&self) {}
    }

    /// O que o motor falso registra: as pastas carregadas, as vozes usadas, as saídas abertas.
    #[derive(Default, Clone)]
    struct Registro {
        pastas: Arc<Mutex<Vec<PathBuf>>>,
        vozes: Arc<Mutex<Vec<String>>>,
        saidas: Arc<Mutex<usize>>,
    }

    fn config(pasta: &str, voz: &str) -> Option<ConfigNeural> {
        Some(ConfigNeural {
            pasta: pasta.into(),
            voz: voz.into(),
        })
    }

    fn motor_com(
        trava: Option<mpsc::Receiver<()>>,
        ocioso: Duration,
    ) -> (
        MotorNeural,
        mpsc::Receiver<EventoVoz>,
        Arc<SaidaFalsa>,
        Registro,
    ) {
        let saida = Arc::new(SaidaFalsa::default());
        let s = Arc::clone(&saida);
        let trava = trava.map(|t| Arc::new(Mutex::new(t)));
        let registro = Registro::default();
        let (r1, r2) = (registro.clone(), registro.clone());
        let (tx, rx) = mpsc::channel();
        let m = MotorNeural::com(
            Box::new(move |pasta| {
                r1.pastas.lock().unwrap().push(pasta.to_path_buf());
                Ok(Box::new(Falso {
                    trava: trava.clone(),
                    vozes: Arc::clone(&r1.vozes),
                    falharam: Vec::new(),
                }) as Box<dyn Sintetizador>)
            }),
            Box::new(move || {
                *r2.saidas.lock().unwrap() += 1;
                Ok(Arc::clone(&s) as Arc<dyn Saida>)
            }),
            ocioso,
            move |e| tx.send(e).unwrap(),
        );
        m.configurar(config("/m", "af_heart"));
        (m, rx, saida, registro)
    }

    fn motor(
        trava: Option<mpsc::Receiver<()>>,
    ) -> (MotorNeural, mpsc::Receiver<EventoVoz>, Arc<SaidaFalsa>) {
        let (m, rx, saida, _) = motor_com(trava, OCIOSO);
        (m, rx, saida)
    }

    fn proximo(rx: &mpsc::Receiver<EventoVoz>) -> EventoVoz {
        rx.recv_timeout(Duration::from_secs(5)).expect("evento")
    }

    fn ssml(marcas: &[&str]) -> String {
        let corpo: String = marcas
            .iter()
            .map(|m| format!(r#"<s><mark name="{m}"/>Frase {m}.</s>"#))
            .collect();
        format!("<speak>{corpo}</speak>")
    }

    #[test]
    fn marca_antes_de_cada_frase_e_fim_no_fim() {
        let (m, rx, saida) = motor(None);
        m.falar(ssml(&["0", "1"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Marca("1".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        assert_eq!(saida.tocado.lock().unwrap().len(), 2);
        // Parar depois do fim não avisa nada.
        m.parar().unwrap();
        assert!(rx.recv_timeout(Duration::from_millis(100)).is_err());
    }

    #[test]
    fn falar_de_novo_descarta_o_bloco_antigo() {
        let (libera, trava) = mpsc::channel();
        let (m, rx, _) = motor(Some(trava));
        m.falar(ssml(&["a0", "a1"]), ConfigVoz::default()).unwrap();
        m.falar(ssml(&["b0"]), ConfigVoz::default()).unwrap();
        for _ in 0..3 {
            libera.send(()).unwrap();
        }
        assert_eq!(proximo(&rx), EventoVoz::Marca("b0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
    }

    #[test]
    fn parar_no_meio_avisa_interrompido_e_nada_mais() {
        let (libera, trava) = mpsc::channel();
        let (m, rx, _) = motor(Some(trava));
        m.falar(ssml(&["0", "1"]), ConfigVoz::default()).unwrap();
        m.parar().unwrap();
        for _ in 0..2 {
            let _ = libera.send(());
        }
        assert_eq!(proximo(&rx), EventoVoz::Interrompido);
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
    }

    #[test]
    fn sem_modelo_a_fala_e_interrompida() {
        let (tx, rx) = mpsc::channel();
        let m = MotorNeural::com(
            Box::new(|_| Err("sem modelo".into())),
            Box::new(|| Ok(Arc::new(SaidaFalsa::default()) as Arc<dyn Saida>)),
            OCIOSO,
            move |e| tx.send(e).unwrap(),
        );
        m.configurar(config("/m", "af_heart"));
        m.falar(ssml(&["0"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Interrompido);
    }

    #[test]
    fn voz_que_nao_existe_interrompe_em_vez_de_passar_pelo_livro_mudo() {
        let (m, rx, saida, _) = motor_com(None, OCIOSO);
        m.configurar(config("/m", "xx"));
        m.falar(ssml(&["0", "1"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Interrompido);
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
        assert!(saida.tocado.lock().unwrap().is_empty());
    }

    #[test]
    fn uma_frase_ruim_e_pulada_mas_um_bloco_todo_ruim_para() {
        let (m, rx, _, _) = motor_com(None, OCIOSO);
        let bloco = |frases: &[&str]| {
            let corpo: String = frases
                .iter()
                .enumerate()
                .map(|(i, f)| format!(r#"<s><mark name="{i}"/>{f}</s>"#))
                .collect();
            format!("<speak>{corpo}</speak>")
        };
        m.falar(bloco(&["Boa.", "Frase ruim."]), ConfigVoz::default())
            .unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Marca("1".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        m.falar(bloco(&["ruim 1.", "ruim 2."]), ConfigVoz::default())
            .unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Interrompido);
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
    }

    #[test]
    fn falha_do_modelo_tenta_a_frase_de_novo() {
        let (m, rx, saida, _) = motor_com(None, OCIOSO);
        m.falar(
            r#"<speak><s><mark name="0"/>Frase instável.</s></speak>"#.into(),
            ConfigVoz::default(),
        )
        .unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        // O falso devolve o tamanho da frase como "áudio": ela tocou.
        assert_eq!(
            *saida.tocado.lock().unwrap(),
            ["Frase instável.".len() as f32]
        );
    }

    /// Abre a saída de som de verdade (sem tocar nada): `cargo test -p folio-core -- --ignored
    /// saida_de_som_na_taxa_do_modelo`.
    #[test]
    #[ignore = "precisa de uma saída de som"]
    fn saida_de_som_na_taxa_do_modelo() {
        let saida = SaidaRodio::abrir().unwrap();
        assert_eq!(saida._dispositivo.config().sample_rate().get(), TAXA);
    }

    /// Toca uma frase de verdade pela saída do app (para gravar e comparar com o que o modelo
    /// gera): `FOLIO_KOKORO=<pasta> [FOLIO_KOKORO_VOZ=af_heart] [FOLIO_KOKORO_TEXTO=…] cargo test
    /// -p folio-core --release -- --ignored tocar_de_verdade`.
    #[test]
    #[ignore = "precisa do modelo baixado (FOLIO_KOKORO), da libespeak-ng e de uma saída de som"]
    fn tocar_de_verdade() {
        let pasta = std::env::var("FOLIO_KOKORO").expect("FOLIO_KOKORO=<pasta do modelo>");
        let voz = std::env::var("FOLIO_KOKORO_VOZ").unwrap_or_else(|_| "af_heart".into());
        let texto = std::env::var("FOLIO_KOKORO_TEXTO")
            .unwrap_or_else(|_| "She sells seashells by the seashore, she said.".into());
        let espeak = crate::kokoro::EspeakNg::carregar(None).unwrap();
        let mut kokoro = Kokoro::carregar(Path::new(&pasta), Box::new(espeak)).unwrap();
        let audio = kokoro.sintetizar(&texto, &voz, 1.0).unwrap();
        let dura = Duration::from_secs_f64(audio.len() as f64 / f64::from(TAXA));
        let saida = SaidaRodio::abrir().unwrap();
        saida.tocar(Item::Audio(audio));
        thread::sleep(dura + Duration::from_millis(300));
    }

    #[test]
    fn sem_configuracao_nao_ha_voz_neural() {
        let (m, _, _) = motor(None);
        assert!(m.disponivel());
        m.configurar(None);
        assert!(!m.disponivel());
        assert!(matches!(
            m.falar(ssml(&["0"]), ConfigVoz::default()),
            Err(ErroVoz::SemVozNeural)
        ));
        assert!(matches!(
            m.amostra("Hi.", "am_michael"),
            Err(ErroVoz::SemVozNeural)
        ));
        m.configurar(config("/m", "af_heart"));
        assert!(matches!(m.amostra("Hi.", "xx"), Err(ErroVoz::NaoFalou)));
    }

    #[test]
    fn trocar_a_voz_nao_recarrega_e_trocar_a_pasta_recarrega() {
        let (m, rx, _, registro) = motor_com(None, OCIOSO);
        m.falar(ssml(&["0"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        m.configurar(config("/m", "bf_isabella"));
        m.falar(ssml(&["1"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("1".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        m.configurar(config("/outra", "bf_isabella"));
        m.falar(ssml(&["2"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("2".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        assert_eq!(
            *registro.vozes.lock().unwrap(),
            ["af_heart", "bf_isabella", "bf_isabella"]
        );
        assert_eq!(
            *registro.pastas.lock().unwrap(),
            [PathBuf::from("/m"), PathBuf::from("/outra")]
        );
    }

    #[test]
    fn amostra_usa_a_voz_pedida_sem_eventos_e_interrompe_a_leitura() {
        let (libera, trava) = mpsc::channel();
        let (m, rx, saida, registro) = motor_com(Some(trava), OCIOSO);
        m.falar(ssml(&["0", "1"]), ConfigVoz::default()).unwrap();
        // A amostra espera o áudio: libera as frases de outra thread.
        let liberar = thread::spawn(move || {
            for _ in 0..3 {
                let _ = libera.send(());
            }
        });
        // O falso gera uma amostra de áudio por frase (a 24 kHz).
        let dura = m.amostra("Hello there.", "bm_george").unwrap();
        assert_eq!(dura, Duration::from_secs_f64(1.0 / f64::from(TAXA)));
        liberar.join().unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Interrompido);
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
        assert_eq!(registro.vozes.lock().unwrap().last().unwrap(), "bm_george");
        assert_eq!(*saida.tocado.lock().unwrap().last().unwrap(), 12.0);
    }

    #[test]
    fn ocioso_fecha_o_modelo_e_a_saida_e_a_fala_seguinte_reabre() {
        let (m, rx, _, registro) = motor_com(None, Duration::from_millis(50));
        m.falar(ssml(&["0"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        thread::sleep(Duration::from_millis(200));
        assert!(m.comum.saida().is_none());
        m.falar(ssml(&["1"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("1".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        assert_eq!(registro.pastas.lock().unwrap().len(), 2);
        assert_eq!(*registro.saidas.lock().unwrap(), 2);
    }
}
