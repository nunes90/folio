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
//! O modelo (~1 s) e a saída de som só são abertos na primeira fala.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

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

/// Gera o áudio de uma frase (amostras de -1 a 1, a `TAXA`). A voz é escolhida ao criar.
pub(crate) trait Sintetizador: Send {
    fn sintetizar(&mut self, frase: &str, velocidade: f32) -> Result<Vec<f32>, ErroKokoro>;
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

type Fabrica<T> = Box<dyn FnMut() -> Result<T, String> + Send>;

struct Trabalho {
    geracao: u64,
    frases: Vec<Frase>,
    velocidade: f32,
}

struct Compartilhado {
    geracao: AtomicU64,
    falando: AtomicBool,
    saida: Mutex<Option<Arc<dyn Saida>>>,
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
}

/// O motor de voz neural. Os comandos são rápidos: o trabalho pesado fica na thread dele.
pub struct MotorNeural {
    comum: Arc<Compartilhado>,
    trabalhos: mpsc::Sender<Trabalho>,
}

/// Onde estão os arquivos da voz e qual voz usar.
#[derive(Debug, Clone)]
pub struct ConfigNeural {
    /// A pasta com o modelo, as vozes, os tokens e a `libonnxruntime.so`.
    pub pasta: PathBuf,
    /// Nome da voz (ex.: "af_heart").
    pub voz: String,
}

impl MotorNeural {
    /// Cria o motor com o Kokoro e a saída de som do sistema. Nada é carregado ainda.
    pub fn novo(config: ConfigNeural, ao_evento: impl Fn(EventoVoz) + Send + 'static) -> Self {
        let ConfigNeural { pasta, voz } = config;
        let sintetizador: Fabrica<Box<dyn Sintetizador>> = Box::new(move || {
            let espeak = EspeakNg::carregar(None).map_err(|e| cadeia(&e))?;
            let kokoro = Kokoro::carregar(&pasta, Box::new(espeak)).map_err(|e| cadeia(&e))?;
            Ok(Box::new(KokoroComVoz {
                kokoro,
                voz: voz.clone(),
            }) as Box<dyn Sintetizador>)
        });
        let saida: Fabrica<Arc<dyn Saida>> =
            Box::new(|| SaidaRodio::abrir().map(|s| Arc::new(s) as Arc<dyn Saida>));
        Self::com(sintetizador, saida, ao_evento)
    }

    pub(crate) fn com(
        sintetizador: Fabrica<Box<dyn Sintetizador>>,
        saida: Fabrica<Arc<dyn Saida>>,
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
            eventos,
        });
        let (trabalhos, fila) = mpsc::channel();
        let c = Arc::clone(&comum);
        thread::Builder::new()
            .name("voz-neural".into())
            .spawn(move || laco(c, fila, sintetizador, saida))
            .expect("criar a thread da voz neural");
        Self { comum, trabalhos }
    }
}

impl MotorDeVoz for MotorNeural {
    fn falar(&self, ssml: String, config: ConfigVoz) -> Result<(), ErroVoz> {
        let geracao = self.comum.geracao.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(saida) = self.comum.saida() {
            saida.limpar();
            saida.retomar();
        }
        self.comum.falando.store(true, Ordering::SeqCst);
        self.trabalhos
            .send(Trabalho {
                geracao,
                frases: frases_do_ssml(&ssml),
                velocidade: fator_de_velocidade(config.velocidade),
            })
            .map_err(|_| ErroVoz::Encerrado)
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
        if self.comum.falando.swap(false, Ordering::SeqCst) {
            self.comum.geracao.fetch_add(1, Ordering::SeqCst);
            if let Some(saida) = self.comum.saida() {
                saida.limpar();
                saida.retomar();
            }
            self.comum.emitir(EventoVoz::Interrompido);
        }
        Ok(())
    }
}

fn laco(
    comum: Arc<Compartilhado>,
    fila: mpsc::Receiver<Trabalho>,
    mut criar_sintetizador: Fabrica<Box<dyn Sintetizador>>,
    mut criar_saida: Fabrica<Arc<dyn Saida>>,
) {
    let mut sintetizador: Option<Box<dyn Sintetizador>> = None;
    for trabalho in fila {
        let g = trabalho.geracao;
        if !comum.atual(g) {
            continue;
        }
        // Abre o modelo e a saída na primeira fala; se falhar, tenta de novo na próxima.
        let prontos = (|| {
            if sintetizador.is_none() {
                sintetizador = Some(criar_sintetizador()?);
            }
            if comum.saida().is_none() {
                let saida = criar_saida()?;
                *comum.saida.lock().unwrap_or_else(|e| e.into_inner()) = Some(saida);
            }
            Ok::<_, String>(())
        })();
        let (Ok(()), Some(sint), Some(saida)) = (prontos, sintetizador.as_mut(), comum.saida())
        else {
            tracing::warn!("voz neural indisponível");
            if comum.atual(g) && comum.falando.swap(false, Ordering::SeqCst) {
                comum.emitir(EventoVoz::Interrompido);
            }
            continue;
        };
        for frase in trabalho.frases {
            if !comum.atual(g) {
                break;
            }
            let audio = if frase.texto.is_empty() {
                None
            } else {
                match sint.sintetizar(&frase.texto, trabalho.velocidade) {
                    Ok(audio) => Some(audio),
                    Err(erro) => {
                        tracing::warn!(
                            erro = cadeia(&erro),
                            frase = frase.texto,
                            "frase não sintetizada"
                        );
                        None
                    }
                }
            };
            if !comum.atual(g) {
                break;
            }
            if let Some(marca) = frase.marca {
                let c = Arc::clone(&comum);
                saida.tocar(Item::Aviso(Box::new(move || {
                    if c.atual(g) {
                        c.emitir(EventoVoz::Marca(marca));
                    }
                })));
            }
            if let Some(audio) = audio {
                saida.tocar(Item::Audio(audio));
            }
        }
        if comum.atual(g) {
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

struct KokoroComVoz {
    kokoro: Kokoro,
    voz: String,
}

impl Sintetizador for KokoroComVoz {
    fn sintetizar(&mut self, frase: &str, velocidade: f32) -> Result<Vec<f32>, ErroKokoro> {
        self.kokoro.sintetizar(frase, &self.voz, velocidade)
    }
}

// --- saída de som (rodio) ------------------------------------------------------------------

struct SaidaRodio {
    player: rodio::Player,
    /// Mantém a saída de som aberta enquanto o player existir.
    _dispositivo: rodio::MixerDeviceSink,
}

impl SaidaRodio {
    fn abrir() -> Result<Self, String> {
        let mut dispositivo = rodio::DeviceSinkBuilder::open_default_sink()
            .map_err(|e| format!("saída de som: {e}"))?;
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
                const MONO: std::num::NonZero<u16> = std::num::NonZero::new(1).unwrap();
                const TAXA_NZ: std::num::NonZero<u32> = std::num::NonZero::new(TAXA).unwrap();
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

    /// Gera "áudio" de uma amostra; antes, espera a liberação, se houver uma trava.
    struct Falso {
        trava: Option<Arc<Mutex<mpsc::Receiver<()>>>>,
    }
    impl Sintetizador for Falso {
        fn sintetizar(&mut self, frase: &str, _: f32) -> Result<Vec<f32>, ErroKokoro> {
            if let Some(t) = &self.trava {
                let _ = t.lock().unwrap().recv_timeout(Duration::from_secs(5));
            }
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

    fn motor(
        trava: Option<mpsc::Receiver<()>>,
    ) -> (MotorNeural, mpsc::Receiver<EventoVoz>, Arc<SaidaFalsa>) {
        let saida = Arc::new(SaidaFalsa::default());
        let s = Arc::clone(&saida);
        let trava = trava.map(|t| Arc::new(Mutex::new(t)));
        let (tx, rx) = mpsc::channel();
        let m = MotorNeural::com(
            Box::new(move || {
                Ok(Box::new(Falso {
                    trava: trava.clone(),
                }) as Box<dyn Sintetizador>)
            }),
            Box::new(move || Ok(Arc::clone(&s) as Arc<dyn Saida>)),
            move |e| tx.send(e).unwrap(),
        );
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
            Box::new(|| Err("sem modelo".into())),
            Box::new(|| Ok(Arc::new(SaidaFalsa::default()) as Arc<dyn Saida>)),
            move |e| tx.send(e).unwrap(),
        );
        m.falar(ssml(&["0"]), ConfigVoz::default()).unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Interrompido);
    }
}
