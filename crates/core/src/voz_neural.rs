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
use std::time::{Duration, Instant};

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

/// O que vai inteiro ao modelo: uma frase do frontend, ou várias quando o corte entre elas não
/// era fim de frase. `marcas` = onde cada frase começa no texto (em bytes), para o destaque.
pub(crate) struct Unidade {
    pub texto: String,
    pub marcas: Vec<(usize, String)>,
}

/// Abreviações que o `Intl.Segmenter` toma por fim de frase ("D. Gloria", "Sr. José").
const ABREVIACOES: &[&str] = &[
    "Sr", "Sra", "Srta", "Srs", "Sras", "D", "Dr", "Dra", "Drs", "Prof", "Profa", "Pe", "Fr",
    "Exmo", "Exma", "Sto", "Sta", "Av", "Mr", "Mrs", "Ms", "Mt", "St", "Jr", "Sen", "Gen", "Cap",
];

/// Se `seguinte` continua a frase de `anterior` em vez de começar outra. O segmentador corta
/// depois de "?" e "!" mesmo quando a frase segue em minúscula ("—Abaixo ou acima? perguntou-lhe
/// tio Cosme"), deixa a aspa de fecho no começo da seguinte ("mamãe!" | "» Ella acudiu") e corta
/// nas abreviações. Sintetizado sozinho, cada pedaço sai com a entonação de fim: soava picado.
/// O frontend tem a mesma regra (`continua` em `ui/src/lib/frases.ts`), para o modo frase.
fn continua(anterior: &str, seguinte: &str) -> bool {
    let Some(primeira) = seguinte.chars().next() else {
        return false;
    };
    if matches!(primeira, '»' | '”' | ')' | ']' | '’') {
        return true;
    }
    let letra = seguinte
        .chars()
        .find(|c| !matches!(c, '«' | '“' | '"' | '‘' | '\'' | '(' | ' '));
    if letra.is_some_and(char::is_lowercase) {
        return true;
    }
    let Some(sem_ponto) = anterior.strip_suffix('.') else {
        return false;
    };
    let palavra = sem_ponto
        .rsplit(|c: char| c.is_whitespace())
        .next()
        .unwrap_or("")
        .trim_start_matches(|c: char| !c.is_alphabetic());
    let mut letras = palavra.chars();
    let inicial = matches!((letras.next(), letras.next()), (Some(c), None) if c.is_uppercase());
    inicial || ABREVIACOES.contains(&palavra)
}

/// Junta as frases que se continuam (`continua`); uma frase sem texto fica sozinha (só a marca).
pub(crate) fn juntar_frases(frases: Vec<Frase>) -> Vec<Unidade> {
    let mut unidades: Vec<Unidade> = Vec::new();
    for frase in frases {
        let marcas = |inicio| frase.marca.iter().map(|m| (inicio, m.clone())).collect();
        match unidades.last_mut() {
            Some(u)
                if !u.texto.is_empty()
                    && !frase.texto.is_empty()
                    && continua(&u.texto, &frase.texto) =>
            {
                u.texto.push(' ');
                let inicio = u.texto.len();
                u.marcas.extend(marcas(inicio));
                u.texto.push_str(&frase.texto);
            }
            _ => unidades.push(Unidade {
                marcas: marcas(0),
                texto: frase.texto,
            }),
        }
    }
    unidades
}

/// `audio` dividido nas `fracoes` (de 0 a 1, em ordem): uma parte antes da primeira e uma depois
/// de cada uma. O ponto de cada frase juntada é estimado pela proporção das letras: o modelo não
/// diz quando cada palavra começa, e para o destaque basta.
pub(crate) fn dividir_audio(mut audio: Vec<f32>, fracoes: &[f64]) -> Vec<Vec<f32>> {
    let total = audio.len();
    let mut partes = Vec::with_capacity(fracoes.len() + 1);
    let mut feito = 0;
    for f in fracoes {
        let ponto = ((f.clamp(0.0, 1.0) * total as f64) as usize).max(feito);
        let resto = audio.split_off(ponto - feito);
        partes.push(std::mem::replace(&mut audio, resto));
        feito = ponto;
    }
    partes.push(audio);
    partes
}

/// A velocidade do speech-dispatcher (-100 a 100, 0 = normal) como fator do Kokoro: -100 é a
/// metade, 100 o dobro.
pub(crate) fn fator_de_velocidade(velocidade: i8) -> f32 {
    2f32.powf(f32::from(velocidade.clamp(-100, 100)) / 100.0)
}

/// Um pedaço menor que isto (em caracteres) não é cortado nem fica sozinho.
const PEDACO_MINIMO: usize = 40;
/// Quanto a fila pode ficar vazia esperando o áudio seguinte (a pausa que ninguém nota).
const FOLGA: Duration = Duration::from_millis(400);
/// Quanto o modelo leva para gerar uma letra antes da primeira medida (~3,5× o tempo real).
const SEGUNDOS_POR_LETRA: f64 = 0.02;

/// Onde as orações de `frase` terminam: depois da pontuação seguida de espaço (vírgula, ponto e
/// vírgula, dois-pontos, travessão, e o fim de uma frase que o frontend juntou à seguinte).
/// "1,000" não corta: depois da vírgula não há espaço.
fn fins_de_oracao(frase: &str) -> Vec<usize> {
    let mut fins = Vec::new();
    let mut letras = frase.char_indices().peekable();
    while let Some((i, c)) = letras.next() {
        let pausa = matches!(c, ',' | ';' | ':' | '—' | '–' | '.' | '!' | '?');
        if pausa && letras.peek().is_some_and(|&(_, p)| p.is_whitespace()) {
            fins.push(i + c.len_utf8());
        }
    }
    fins
}

/// O começo de `frase` que cabe em `cabe` caracteres, cortado no fim de uma oração, e o resto.
///
/// Cada pedaço é sintetizado sozinho, e o modelo fecha a entonação no fim dele: uma frase longa
/// cortada em várias vírgulas soava picada (no Dom Casmurro). Por isso só se corta quando a frase
/// inteira não ficaria pronta antes de a fila acabar (`cabe` vem dessa conta, no motor): no começo
/// de um parágrafo, a fila está vazia, e a primeira oração vai antes para a fala começar logo; com
/// ela tocando, o resto já cabe. Sem onde cortar, ou se um dos lados ficaria com menos de
/// `PEDACO_MINIMO`, a frase vai inteira (o modelo ainda divide no limite de tokens).
pub(crate) fn cortar(frase: &str, cabe: usize) -> (&str, &str) {
    let frase = frase.trim();
    let tamanho = |a: usize, b: usize| frase[a..b].chars().count();
    let total = tamanho(0, frase.len());
    if total <= cabe {
        return (frase, "");
    }
    let validos: Vec<usize> = fins_de_oracao(frase)
        .into_iter()
        .filter(|&f| tamanho(0, f) >= PEDACO_MINIMO && tamanho(f, frase.len()) >= PEDACO_MINIMO)
        .collect();
    // O maior começo que cabe; se nenhum cabe, o menor possível.
    let corte = validos
        .iter()
        .rev()
        .find(|&&f| tamanho(0, f) <= cabe)
        .or(validos.first());
    match corte {
        Some(&f) => (frase[..f].trim(), frase[f..].trim()),
        None => (frase, ""),
    }
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
    /// A voz deste trabalho (a do idioma do texto, ou a pedida na amostra).
    voz: String,
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

/// Onde estão os arquivos da voz e qual voz usar em cada idioma.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigNeural {
    /// A pasta com o modelo, as vozes, os tokens e a `libonnxruntime.so`.
    pub pasta: PathBuf,
    /// A voz de cada idioma, pela base dele ("en" → "af_heart", "pt" → "pf_dora"). A primeira
    /// vale para um texto sem idioma.
    pub vozes: Vec<(String, String)>,
}

impl ConfigNeural {
    /// A voz para um texto em `idioma` ("en-US", "pt-BR"); sem idioma, a primeira.
    pub fn voz_para(&self, idioma: Option<&str>) -> Option<&str> {
        let primeira = || self.vozes.first().map(|(_, v)| v.as_str());
        match idioma {
            None => primeira(),
            Some(i) => {
                let base = crate::voz_por_idioma::idioma_base(i);
                self.vozes
                    .iter()
                    .find(|(b, _)| *b == base)
                    .map(|(_, v)| v.as_str())
            }
        }
    }
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
        let config = self.comum.config().ok_or(ErroVoz::SemVozNeural)?;
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
                voz: voz.to_string(),
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
        let voz = neural
            .voz_para(config.idioma.as_deref())
            .ok_or(ErroVoz::SemVozNeural)?
            .to_string();
        self.comum.falando.store(true, Ordering::SeqCst);
        self.comum.enviar(
            &self.trabalhos,
            Trabalho {
                geracao: 0,
                frases: frases_do_ssml(&ssml),
                velocidade: fator_de_velocidade(config.velocidade),
                config: neural,
                voz,
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
    // Quanto o modelo leva por letra, medido a cada frase (decide onde cortar).
    let mut segundos_por_letra = SEGUNDOS_POR_LETRA;
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
        let voz = &trabalho.voz;
        // Uma frase que falha é pulada (sem som), mas um bloco em que nenhuma falou para a
        // leitura: senão o frontend recebia as marcas e o fim na hora e passava de bloco em bloco
        // pelo livro todo, mudo (aconteceu com a voz do espeak-ng errada para o inglês britânico).
        let (mut falou, mut falhou) = (false, false);
        let mut duracao = Duration::ZERO;
        let mut desistir = false;
        let avisar_marca = |marca: String| {
            let c = Arc::clone(&comum);
            saida.tocar(Item::Aviso(Box::new(move || {
                if c.atual(g) {
                    c.emitir(EventoVoz::Marca(marca));
                }
            })));
        };
        // Quando o áudio já na fila acaba de tocar (estimado: pausar a leitura só adia o fim).
        let mut fim_da_fila = Instant::now();
        'frases: for unidade in juntar_frases(trabalho.frases) {
            if !comum.atual(g) {
                break;
            }
            let texto = unidade.texto.as_str();
            // As marcas que ainda não saíram, na ordem: cada uma vai à fila no ponto do áudio em
            // que a frase dela começa (a primeira, logo antes do primeiro áudio).
            let mut marcas = unidade
                .marcas
                .into_iter()
                .filter(|_| trabalho.avisar)
                .peekable();
            let mut resto = texto.trim();
            while !resto.is_empty() {
                // Quantas letras dá para gerar antes de a fila acabar (mais a folga).
                let adiante = fim_da_fila.saturating_duration_since(Instant::now()) + FOLGA;
                let cabe = (adiante.as_secs_f64() / segundos_por_letra) as usize;
                let (pedaco, depois) = cortar(resto, cabe);
                resto = depois;
                // `pedaco` é um pedaço de `texto`: onde ele começa e acaba ali.
                let de = pedaco.as_ptr() as usize - texto.as_ptr() as usize;
                let ate = de + pedaco.len();
                let inicio = Instant::now();
                let resultado =
                    sintetizar_tentando_de_novo(sint.as_mut(), pedaco, voz, trabalho.velocidade);
                if !comum.atual(g) {
                    break 'frases;
                }
                match resultado {
                    Ok(audio) => {
                        falou = true;
                        // A média com a medida anterior: uma frase lenta não muda tudo.
                        let letras = pedaco.chars().count().max(1) as f64;
                        segundos_por_letra =
                            (segundos_por_letra + inicio.elapsed().as_secs_f64() / letras) / 2.0;
                        let dura = Duration::from_secs_f64(audio.len() as f64 / f64::from(TAXA));
                        duracao += dura;
                        fim_da_fila = fim_da_fila.max(Instant::now()) + dura;
                        // As marcas dentro do pedaço, cada uma antes do trecho de áudio dela.
                        let mut fracoes = Vec::new();
                        let mut nomes = Vec::new();
                        while let Some((pos, nome)) = marcas.next_if(|(pos, _)| *pos < ate) {
                            fracoes.push(texto[de..pos.max(de)].chars().count() as f64 / letras);
                            nomes.push(nome);
                        }
                        let mut partes = dividir_audio(audio, &fracoes).into_iter();
                        if let Some(antes) = partes.next().filter(|a| !a.is_empty()) {
                            saida.tocar(Item::Audio(antes));
                        }
                        for (nome, parte) in nomes.into_iter().zip(partes) {
                            avisar_marca(nome);
                            if !parte.is_empty() {
                                saida.tocar(Item::Audio(parte));
                            }
                        }
                    }
                    Err(erro) => {
                        tracing::warn!(
                            erro = cadeia(&erro),
                            frase = pedaco,
                            "frase não sintetizada"
                        );
                        falhou = true;
                        // A voz ou o idioma não existem: nenhuma frase vai falar.
                        if matches!(
                            erro,
                            ErroKokoro::VozDesconhecida(_) | ErroKokoro::IdiomaDesconhecido(_)
                        ) {
                            desistir = true;
                            break 'frases;
                        }
                    }
                }
            }
            // Frase sem texto, ou que falhou depois de outra ter falado: a marca sai assim mesmo
            // (o destaque segue). Antes de qualquer frase falar, não: se o bloco todo falhar, o
            // frontend só recebe o `Interrompido`.
            if falou || texto.trim().is_empty() {
                marcas.for_each(|m| avisar_marca(m.1));
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

/// Sintetiza; se falhar por outro motivo que não voz ou idioma desconhecidos, tenta mais uma vez.
/// Uma falha dentro do ONNX Runtime ("GetElementType is not implemented") apareceu uma vez no app
/// numa frase que, repetida depois, sempre saiu.
fn sintetizar_tentando_de_novo(
    sint: &mut dyn Sintetizador,
    texto: &str,
    voz: &str,
    velocidade: f32,
) -> Result<Vec<f32>, ErroKokoro> {
    match sint.sintetizar(texto, voz, velocidade) {
        Err(erro)
            if !matches!(
                erro,
                ErroKokoro::VozDesconhecida(_) | ErroKokoro::IdiomaDesconhecido(_)
            ) =>
        {
            tracing::warn!(
                erro = cadeia(&erro),
                "frase não sintetizada; tentando de novo"
            );
            sint.sintetizar(texto, voz, velocidade)
        }
        resultado => resultado,
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

    const LONGA: &str = "Como ia dizendo, subi as escadas sem estrepito, empurrei a cancella, que \
                         estava apenas encostada, o dei com prima Justina e José Dias jogando \
                         cartas na saleta proxima.";

    #[test]
    fn frase_que_cabe_vai_inteira() {
        assert_eq!(cortar("  Hello, there.  ", 100), ("Hello, there.", ""));
        assert_eq!(cortar(LONGA, 1000), (LONGA, ""));
        assert_eq!(cortar("   ", 10), ("", ""));
    }

    #[test]
    fn sem_folga_corta_no_maior_comeco_que_cabe() {
        // Nada cabe (a fila está vazia): o menor começo possível, de 40 letras ou mais.
        let (a, b) = cortar(LONGA, 0);
        assert_eq!(a, "Como ia dizendo, subi as escadas sem estrepito,");
        assert_eq!(format!("{a} {b}"), LONGA);
        // Com espaço para ~100 letras: o maior começo até lá.
        let (a, _) = cortar(LONGA, 100);
        assert_eq!(
            a,
            "Como ia dizendo, subi as escadas sem estrepito, empurrei a cancella, que estava \
             apenas encostada,"
        );
    }

    #[test]
    fn nenhum_lado_fica_curto_demais() {
        // O "Divina arte!" tem menos de 40 letras: não fica sozinho.
        let frase = "Divina arte! Ia-se formando um grupo na rua, deixei a porta da loja e vim \
                     andando para casa.";
        let (a, b) = cortar(frase, 0);
        assert_eq!(a, "Divina arte! Ia-se formando um grupo na rua,");
        assert_eq!(b, "deixei a porta da loja e vim andando para casa.");
        // Se o resto ficasse curto, vai inteira.
        let curta = "Divina arte! Ia-se formando um grupo na rua, deixei a porta e vim.";
        assert_eq!(cortar(curta, 0).1, "");
        // Sem pontuação, fica inteira; "1,000" não é onde cortar.
        let corrida = "palavra ".repeat(40);
        assert_eq!(cortar(&corrida, 0).1, "");
        assert_eq!(
            cortar(
                "We counted 1,000,000 stars in the sky that night above us all.",
                0
            )
            .1,
            ""
        );
    }

    proptest::proptest! {
        #[test]
        fn cortar_nao_perde_texto(frase in "[a-z ,.;:—]{0,400}", cabe in 0usize..300) {
            let (a, b) = cortar(&frase, cabe);
            let sem_espacos = |t: &str| t.split_whitespace().collect::<String>();
            proptest::prop_assert_eq!(sem_espacos(&format!("{a}{b}")), sem_espacos(&frase));
        }
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
            vozes: vec![("en".into(), voz.into())],
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
    fn juntar_frases_que_se_continuam() {
        let frase = |m: &str, t: &str| Frase {
            marca: Some(m.into()),
            texto: t.into(),
        };
        let unidades = juntar_frases(vec![
            frase("0", "—Abaixo ou acima?"),
            frase("1", "perguntou-lhe tio Cosme um dia."),
            frase("2", "—Mas, D."),
            frase("3", "Gloria, a senhora não sabe."),
            frase("4", "«Mamãe!"),
            frase("5", "» Ella acudiu."),
            frase("6", "Nova frase."),
            frase("7", "“Yes?” he asked."),
            frase("8", "Ask J."),
            frase("9", "R. R. Tolkien."),
            Frase {
                marca: Some("10".into()),
                texto: String::new(),
            },
            frase("11", "and then."),
        ]);
        let textos: Vec<&str> = unidades.iter().map(|u| u.texto.as_str()).collect();
        assert_eq!(
            textos,
            [
                "—Abaixo ou acima? perguntou-lhe tio Cosme um dia.",
                "—Mas, D. Gloria, a senhora não sabe.",
                "«Mamãe! » Ella acudiu.",
                "Nova frase.",
                "“Yes?” he asked.",
                "Ask J. R. R. Tolkien.",
                "",
                "and then.",
            ]
        );
        let u = &unidades[0];
        assert_eq!(u.marcas[0], (0, "0".into()));
        assert_eq!(&u.texto[u.marcas[1].0..], "perguntou-lhe tio Cosme um dia.");
        // "Fim." e "Fala." são frases: maiúscula, sem abreviação antes.
        assert_eq!(
            juntar_frases(vec![frase("0", "Era o fim."), frase("1", "Outra.")]).len(),
            2
        );
    }

    #[test]
    fn dividir_audio_nas_marcas() {
        let audio: Vec<f32> = (0..10).map(|i| i as f32).collect();
        let partes = dividir_audio(audio.clone(), &[0.0, 0.3, 0.3, 1.0]);
        assert_eq!(partes.len(), 5);
        assert!(partes[0].is_empty());
        assert_eq!(partes[1], [0.0, 1.0, 2.0]);
        assert!(partes[2].is_empty());
        assert_eq!(partes[3].len(), 7);
        assert!(partes[4].is_empty());
        assert_eq!(dividir_audio(audio, &[]).len(), 1);
    }

    #[test]
    fn frases_juntadas_vao_ao_modelo_numa_vez_com_as_duas_marcas() {
        let (m, rx, saida, _) = motor_com(None, OCIOSO);
        m.falar(
            r#"<speak><s><mark name="0"/>—Abaixo?</s><s><mark name="1"/>perguntou ele.</s></speak>"#
                .into(),
            ConfigVoz::default(),
        )
        .unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Marca("1".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        // Uma síntese só, do texto inteiro (o falso devolve o tamanho dele).
        assert_eq!(
            *saida.tocado.lock().unwrap(),
            ["—Abaixo? perguntou ele.".len() as f32]
        );
    }

    #[test]
    fn frase_longa_no_comeco_toca_em_pedacos_com_uma_marca() {
        let (m, rx, saida, _) = motor_com(None, OCIOSO);
        m.falar(
            format!(
                r#"<speak><s><mark name="0"/>{LONGA}</s><s><mark name="1"/>Curta.</s></speak>"#
            ),
            ConfigVoz::default(),
        )
        .unwrap();
        assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
        assert_eq!(proximo(&rx), EventoVoz::Marca("1".into()));
        assert_eq!(proximo(&rx), EventoVoz::Fim);
        // O falso devolve o tamanho do texto como "áudio". No começo do bloco a fila está vazia:
        // a primeira oração vai antes, e nada se perde.
        let tocado = saida.tocado.lock().unwrap();
        assert!(tocado.len() >= 3, "{tocado:?}");
        assert_eq!(
            tocado[0],
            "Como ia dizendo, subi as escadas sem estrepito,".len() as f32
        );
        let soma: f32 = tocado[..tocado.len() - 1].iter().sum();
        assert!(soma <= LONGA.len() as f32 && soma >= LONGA.len() as f32 - 10.0);
        assert_eq!(*tocado.last().unwrap(), "Curta.".len() as f32);
    }

    #[test]
    fn a_voz_vem_do_idioma_do_texto() {
        let (m, rx, _, registro) = motor_com(None, OCIOSO);
        m.configurar(Some(ConfigNeural {
            pasta: "/m".into(),
            vozes: vec![
                ("en".into(), "af_heart".into()),
                ("pt".into(), "pf_dora".into()),
            ],
        }));
        let em = |idioma: Option<&str>| ConfigVoz {
            idioma: idioma.map(Into::into),
            ..ConfigVoz::default()
        };
        for idioma in [Some("pt-BR"), Some("en-US"), None] {
            m.falar(ssml(&["0"]), em(idioma)).unwrap();
            assert_eq!(proximo(&rx), EventoVoz::Marca("0".into()));
            assert_eq!(proximo(&rx), EventoVoz::Fim);
        }
        assert_eq!(
            *registro.vozes.lock().unwrap(),
            ["pf_dora", "af_heart", "af_heart"]
        );
        // Um idioma sem voz no modelo não fala aqui.
        assert!(matches!(
            m.falar(ssml(&["1"]), em(Some("es"))),
            Err(ErroVoz::SemVozNeural)
        ));
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
        // A amostra espera o áudio: as frases são liberadas de outra thread, só depois de a
        // amostra interromper a leitura (liberar antes deixava a frase "0" falar, às vezes).
        let liberar = thread::spawn(move || {
            let primeiro = proximo(&rx);
            for _ in 0..3 {
                let _ = libera.send(());
            }
            (primeiro, rx)
        });
        // O falso gera uma amostra de áudio por frase (a 24 kHz).
        let dura = m.amostra("Hello there.", "bm_george").unwrap();
        assert_eq!(dura, Duration::from_secs_f64(1.0 / f64::from(TAXA)));
        let (primeiro, rx) = liberar.join().unwrap();
        assert_eq!(primeiro, EventoVoz::Interrompido);
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
