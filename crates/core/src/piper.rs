//! Voz neural local, segundo modelo (M27e): o Piper (VITS), mais leve e mais rápido que o Kokoro.
//! Cada voz é um modelo próprio (`<voz>.onnx`, ~63 MB) com a sua configuração (`<voz>.onnx.json`).
//!
//! O caminho de um texto até o áudio, reaproveitando o do Kokoro:
//! 1. o espeak-ng dá os fonemas IPA, com a pontuação devolvida (`fonemas_pontuados`), na voz do
//!    espeak-ng que a configuração pede ("en", "pt-br");
//! 2. cada símbolo vira números pela tabela da configuração (`phoneme_id_map`): começo (`^`),
//!    um separador (`_`) depois de cada símbolo, fim (`$`), como o Piper foi treinado;
//! 3. o ONNX Runtime devolve o áudio (22 050 Hz nas vozes "medium"), mono.

use std::collections::HashMap;
use std::path::Path;

use ort::session::Session;
use ort::value::Tensor;

use crate::kokoro::{ErroKokoro, Fonemizador, fonemas_pontuados, normalizar_ingles};

/// O que a configuração de uma voz (`.onnx.json`) diz e o motor usa.
#[derive(Debug, Clone, PartialEq)]
pub struct ConfigPiper {
    /// Taxa de amostragem do áudio que o modelo gera.
    pub taxa: u32,
    /// O nome da voz do espeak-ng para os fonemas ("en", "pt-br").
    pub voz_espeak: String,
    /// Símbolo → números.
    pub mapa: HashMap<char, Vec<i64>>,
    /// `noise_scale`, `length_scale` e `noise_w` do treino.
    pub ruido: f32,
    pub duracao: f32,
    pub ruido_w: f32,
}

impl ConfigPiper {
    pub fn ler(json: &str) -> Result<Self, ErroKokoro> {
        let invalido = |o: &str| ErroKokoro::ArquivoInvalido(format!("configuração do Piper: {o}"));
        let v: serde_json::Value = serde_json::from_str(json).map_err(|_| invalido("JSON"))?;
        if v["phoneme_type"].as_str().is_some_and(|t| t != "espeak") {
            return Err(invalido("fonemas que não são do espeak-ng"));
        }
        let mut mapa = HashMap::new();
        for (simbolo, ids) in v["phoneme_id_map"]
            .as_object()
            .ok_or_else(|| invalido("phoneme_id_map"))?
        {
            let mut letras = simbolo.chars();
            let (Some(c), None) = (letras.next(), letras.next()) else {
                continue;
            };
            let ids: Vec<i64> = ids
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|i| i.as_i64())
                .collect();
            mapa.insert(c, ids);
        }
        for especial in [INICIO, FIM, SEPARADOR] {
            if !mapa.contains_key(&especial) {
                return Err(invalido("sem os símbolos de começo, fim e separador"));
            }
        }
        let numero =
            |campo: &str, padrao: f64| v["inference"][campo].as_f64().unwrap_or(padrao) as f32;
        Ok(Self {
            taxa: v["audio"]["sample_rate"]
                .as_u64()
                .ok_or_else(|| invalido("sample_rate"))? as u32,
            voz_espeak: v["espeak"]["voice"]
                .as_str()
                .ok_or_else(|| invalido("espeak.voice"))?
                .to_string(),
            mapa,
            ruido: numero("noise_scale", 0.667),
            duracao: numero("length_scale", 1.0),
            ruido_w: numero("noise_w", 0.8),
        })
    }
}

/// Os arquivos de uma voz na pasta dela (o download os renomeia).
pub const ARQUIVO_MODELO: &str = "modelo.onnx";
pub const ARQUIVO_CONFIG: &str = "modelo.onnx.json";

const INICIO: char = '^';
const FIM: char = '$';
const SEPARADOR: char = '_';

/// Os números de uma frase em fonemas: `^`, cada símbolo seguido de `_`, `$`. Símbolos que a voz
/// não conhece são pulados (como no Piper).
pub fn ids_dos_fonemas(mapa: &HashMap<char, Vec<i64>>, fonemas: &str) -> Vec<i64> {
    let separador = &mapa[&SEPARADOR];
    let mut ids = mapa[&INICIO].clone();
    ids.extend(separador);
    for c in fonemas.chars() {
        if let Some(n) = mapa.get(&c) {
            ids.extend(n);
            ids.extend(separador);
        }
    }
    ids.extend(&mapa[&FIM]);
    ids
}

pub struct Piper {
    sessao: Session,
    config: ConfigPiper,
    fonemizador: Box<dyn Fonemizador>,
}

impl Piper {
    /// Carrega a voz `modelo` (o `.onnx`; a configuração é o `.onnx.json` ao lado) com o ONNX
    /// Runtime em `onnx_runtime` (o mesmo do Kokoro; carregado uma vez por processo).
    pub fn carregar(
        modelo: &Path,
        onnx_runtime: &Path,
        fonemizador: Box<dyn Fonemizador>,
    ) -> Result<Self, ErroKokoro> {
        let ler = |caminho: &Path| {
            std::fs::read(caminho).map_err(|fonte| ErroKokoro::Io {
                caminho: caminho.to_path_buf(),
                fonte,
            })
        };
        let json = ler(&modelo.with_extension("onnx.json"))?;
        let config = ConfigPiper::ler(&String::from_utf8_lossy(&json))?;
        let ambiente = crate::kokoro::ambiente_onnx(onnx_runtime)?;
        let nucleos = std::thread::available_parallelism().map_or(2, |n| n.get());
        let sessao = Session::builder(ambiente)?
            .with_intra_threads((nucleos / 2).clamp(1, 4))
            .map_err(ort::Error::from)?
            .commit_from_memory(&ler(modelo)?)?;
        Ok(Self {
            sessao,
            config,
            fonemizador,
        })
    }

    pub fn taxa(&self) -> u32 {
        self.config.taxa
    }

    /// O áudio de uma frase (amostras de -1 a 1, a `taxa()`). `velocidade` 1,0 é a normal.
    pub fn sintetizar(&mut self, frase: &str, velocidade: f32) -> Result<Vec<f32>, ErroKokoro> {
        let frase = if self.config.voz_espeak.starts_with("en") {
            normalizar_ingles(frase)
        } else {
            frase.to_string()
        };
        let fonemas =
            fonemas_pontuados(self.fonemizador.as_ref(), &frase, &self.config.voz_espeak)?;
        let ids = ids_dos_fonemas(&self.config.mapa, &fonemas);
        let n = ids.len();
        let escalas = vec![
            self.config.ruido,
            self.config.duracao / velocidade.max(0.1),
            self.config.ruido_w,
        ];
        let saidas = self.sessao.run(ort::inputs![
            "input" => Tensor::from_array(([1usize, n], ids))?,
            "input_lengths" => Tensor::from_array(([1usize], vec![n as i64]))?,
            "scales" => Tensor::from_array(([3usize], escalas))?,
        ])?;
        let (_, amostras) = saidas[0].try_extract_tensor::<f32>()?;
        Ok(amostras.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = r#"{
        "audio": {"sample_rate": 22050, "quality": "medium"},
        "espeak": {"voice": "en"},
        "inference": {"noise_scale": 0.667, "length_scale": 1, "noise_w": 0.333},
        "phoneme_type": "espeak",
        "phoneme_id_map": {"_": [0], "^": [1], "$": [2], " ": [3], "a": [14], "ˈ": [120], "ab": [99]}
    }"#;

    #[test]
    fn le_a_configuracao_da_voz() {
        let c = ConfigPiper::ler(CONFIG).unwrap();
        assert_eq!(c.taxa, 22050);
        assert_eq!(c.voz_espeak, "en");
        assert_eq!(c.ruido_w, 0.333);
        assert_eq!(c.mapa[&'a'], vec![14]);
        // Só símbolos de um caractere.
        assert_eq!(c.mapa.len(), 6);
        assert!(ConfigPiper::ler("{}").is_err());
        assert!(ConfigPiper::ler(&CONFIG.replace("espeak\",", "text\",")).is_err());
    }

    #[test]
    fn ids_com_comeco_separadores_e_fim() {
        let c = ConfigPiper::ler(CONFIG).unwrap();
        // "ˈa a" → ^ _ ˈ _ a _ ␠ _ a _ $; o "?" não está na tabela e é pulado.
        assert_eq!(
            ids_dos_fonemas(&c.mapa, "ˈa a?"),
            vec![1, 0, 120, 0, 14, 0, 3, 0, 14, 0, 2]
        );
    }

    /// Gera um WAV para ouvir: `FOLIO_PIPER=<voz.onnx> FOLIO_ONNX_RUNTIME=<libonnxruntime.so>
    /// FOLIO_PIPER_WAV=<saida.wav> [FOLIO_PIPER_TEXTO=…] cargo test -p folio-core --release --
    /// --ignored piper_gerar_wav --nocapture`. Uma frase por linha.
    #[test]
    #[ignore = "ferramenta: precisa de uma voz do Piper baixada"]
    fn piper_gerar_wav() {
        let modelo = std::env::var("FOLIO_PIPER").expect("FOLIO_PIPER=<voz.onnx>");
        let runtime = std::env::var("FOLIO_ONNX_RUNTIME").expect("FOLIO_ONNX_RUNTIME=<.so>");
        let wav = std::env::var("FOLIO_PIPER_WAV").expect("FOLIO_PIPER_WAV=<saida.wav>");
        let texto = std::env::var("FOLIO_PIPER_TEXTO")
            .unwrap_or_else(|_| "It was the best of times, it was the worst of times.".into());
        let espeak = crate::kokoro::EspeakNg::carregar(None).unwrap();
        let mut piper =
            Piper::carregar(Path::new(&modelo), Path::new(&runtime), Box::new(espeak)).unwrap();
        let comeco = std::time::Instant::now();
        let mut audio = Vec::new();
        for frase in texto.lines().filter(|l| !l.trim().is_empty()) {
            audio.extend(piper.sintetizar(frase, 1.0).unwrap());
            // Uma pausa curta entre as frases, como entre as do livro.
            audio.extend(std::iter::repeat_n(0.0, piper.taxa() as usize / 4));
        }
        let segundos = audio.len() as f32 / piper.taxa() as f32;
        println!(
            "{segundos:.1} s de áudio em {:.2} s ({:.1}× o tempo real)",
            comeco.elapsed().as_secs_f32(),
            segundos / comeco.elapsed().as_secs_f32()
        );
        assert!(audio.iter().any(|a| a.abs() > 0.05), "áudio mudo");
        std::fs::write(wav, crate::kokoro::wav_mono_16(&audio, piper.taxa())).unwrap();
    }
}
