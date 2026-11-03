//! O modelo Kokoro no ONNX Runtime.

use std::path::Path;

use ort::session::Session;
use ort::value::Tensor;

use super::{
    ErroKokoro, Fonemizador, MAX_TOKENS, Vocabulario, Vozes, dividir, fonemas_com_pontuacao,
    idioma_da_voz, indice_da_voz,
};

/// Taxa de amostragem do áudio que o modelo gera (mono).
pub const TAXA: u32 = 24_000;

pub const ARQUIVO_MODELO: &str = "model.int8.onnx";
pub const ARQUIVO_VOZES: &str = "voices.bin";
pub const ARQUIVO_TOKENS: &str = "tokens.txt";
/// O ONNX Runtime oficial (1.31), baixado junto com a voz.
pub const ARQUIVO_ONNX_RUNTIME: &str = "libonnxruntime.so";

pub struct Kokoro {
    sessao: Session,
    vozes: Vozes,
    vocabulario: Vocabulario,
    fonemizador: Box<dyn Fonemizador>,
    /// O ambiente do ONNX Runtime precisa viver enquanto a sessão existir.
    _ambiente: ort::environment::Environment,
}

impl Kokoro {
    /// Carrega o modelo da `pasta` (com os arquivos baixados, inclusive o ONNX Runtime). Leva
    /// perto de 1 s.
    ///
    /// O ONNX Runtime é carregado uma vez por processo: depois da primeira, as próximas usam o
    /// mesmo, venha de onde vier.
    pub fn carregar(pasta: &Path, fonemizador: Box<dyn Fonemizador>) -> Result<Self, ErroKokoro> {
        let ler = |nome: &str| {
            let caminho = pasta.join(nome);
            std::fs::read(&caminho).map_err(|fonte| ErroKokoro::Io { caminho, fonte })
        };
        let vozes = Vozes::ler(&ler(ARQUIVO_VOZES)?)?;
        let tokens = String::from_utf8(ler(ARQUIVO_TOKENS)?)
            .map_err(|_| ErroKokoro::ArquivoInvalido("tokens.txt não é UTF-8".into()))?;
        let vocabulario = Vocabulario::ler(&tokens)?;
        let ambiente = ort::init_from(pasta.join(ARQUIVO_ONNX_RUNTIME))
            .map_err(ErroKokoro::SemOnnxRuntime)?
            .with_name("folio")
            .build()?;
        // Metade dos núcleos, até 4: mais que isso quase não acelera e disputa a CPU com a
        // interface enquanto o livro é lido.
        let nucleos = std::thread::available_parallelism().map_or(2, |n| n.get());
        let sessao = Session::builder(&ambiente)?
            .with_intra_threads((nucleos / 2).clamp(1, 4))
            .map_err(ort::Error::from)?
            .commit_from_memory(&ler(ARQUIVO_MODELO)?)?;
        Ok(Self {
            sessao,
            vozes,
            vocabulario,
            fonemizador,
            _ambiente: ambiente,
        })
    }

    /// O áudio de uma frase (amostras de -1 a 1, a `TAXA`). `velocidade` 1,0 é a normal.
    ///
    /// Frases maiores que o modelo aceita são divididas e o áudio dos pedaços, emendado.
    pub fn sintetizar(
        &mut self,
        frase: &str,
        voz: &str,
        velocidade: f32,
    ) -> Result<Vec<f32>, ErroKokoro> {
        let numero = indice_da_voz(voz).ok_or_else(|| ErroKokoro::VozDesconhecida(voz.into()))?;
        let idioma = idioma_da_voz(voz).ok_or_else(|| ErroKokoro::VozDesconhecida(voz.into()))?;
        let fonemas = fonemas_com_pontuacao(self.fonemizador.as_ref(), frase, idioma)?;
        let ids = self.vocabulario.ids(&fonemas);
        let mut audio = Vec::new();
        for pedaco in dividir(&self.vocabulario, &ids, MAX_TOKENS) {
            let estilo = self.vozes.estilo(numero, pedaco.len()).to_vec();
            let n = pedaco.len() + 2;
            let mut tokens = Vec::with_capacity(n);
            tokens.push(0);
            tokens.extend(pedaco);
            tokens.push(0);
            let saidas = self.sessao.run(ort::inputs![
                "tokens" => Tensor::from_array(([1usize, n], tokens))?,
                "style" => Tensor::from_array(([1usize, estilo.len()], estilo))?,
                "speed" => Tensor::from_array(([1usize], vec![velocidade]))?,
            ])?;
            let (_, amostras) = saidas[0].try_extract_tensor::<f32>()?;
            audio.extend_from_slice(amostras);
        }
        Ok(audio)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kokoro::EspeakNg;

    /// Com o modelo baixado e o espeak-ng do sistema:
    /// `FOLIO_KOKORO=<pasta> cargo test -p folio-core -- --ignored kokoro_de_verdade`.
    /// Com `FOLIO_KOKORO_WAV=<arquivo>`, grava o áudio para ouvir.
    #[test]
    #[ignore = "precisa do modelo baixado (FOLIO_KOKORO) e da libespeak-ng"]
    fn kokoro_de_verdade() {
        let pasta = std::env::var("FOLIO_KOKORO").expect("FOLIO_KOKORO=<pasta do modelo>");
        let espeak = EspeakNg::carregar(None).unwrap();
        let mut kokoro = Kokoro::carregar(Path::new(&pasta), Box::new(espeak)).unwrap();
        let audio = kokoro
            .sintetizar(
                "It was the best of times, it was the worst of times.",
                "af_heart",
                1.0,
            )
            .unwrap();
        let segundos = audio.len() as f32 / TAXA as f32;
        assert!((2.0..8.0).contains(&segundos), "{segundos} s");
        assert!(audio.iter().any(|a| a.abs() > 0.05), "áudio mudo");
        assert!(matches!(
            kokoro.sintetizar("x", "nao_existe", 1.0),
            Err(ErroKokoro::VozDesconhecida(_))
        ));
        if let Ok(wav) = std::env::var("FOLIO_KOKORO_WAV") {
            std::fs::write(wav, wav_mono_16(&audio, TAXA)).unwrap();
        }
    }

    fn wav_mono_16(amostras: &[f32], taxa: u32) -> Vec<u8> {
        let dados = (amostras.len() * 2) as u32;
        let mut b = Vec::with_capacity(44 + dados as usize);
        b.extend(b"RIFF");
        b.extend((36 + dados).to_le_bytes());
        b.extend(b"WAVEfmt ");
        b.extend(16u32.to_le_bytes());
        b.extend(1u16.to_le_bytes());
        b.extend(1u16.to_le_bytes());
        b.extend(taxa.to_le_bytes());
        b.extend((taxa * 2).to_le_bytes());
        b.extend(2u16.to_le_bytes());
        b.extend(16u16.to_le_bytes());
        b.extend(b"data");
        b.extend(dados.to_le_bytes());
        for a in amostras {
            b.extend(((a.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
        }
        b
    }
}
