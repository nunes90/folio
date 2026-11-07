//! Voz neural local: o modelo Kokoro (82M parâmetros, Apache-2.0) rodando no próprio computador,
//! sem internet, pelo ONNX Runtime (crate `ort`).
//!
//! O caminho de um texto até o áudio:
//! 0. `normalizar`, `normalizar_pt`: o que o espeak-ng leria errado é reescrito (no inglês, "$5.50",
//!    "1990s", "Chapter IV"; no português, os números por extenso, "R$ 5,50", "D. Pedro II").
//! 1. `fonemas`: o espeak-ng transforma o texto em fonemas IPA ("test" → "tˈɛst"). Só a pronúncia
//!    vem dele; a voz é a do modelo. A pontuação, que o espeak-ng descarta, é devolvida aqui,
//!    porque o modelo a usa para as pausas e a entonação.
//! 2. `tokens`: cada fonema vira um número, pela tabela `tokens.txt` do modelo.
//! 3. `vozes`: cada voz é uma tabela de "estilos", um por tamanho de frase.
//! 4. `modelo`: o ONNX Runtime recebe os números e o estilo e devolve o áudio (24 kHz, mono).
//!
//! Os arquivos do modelo (`model.int8.onnx`, `voices.bin`, `tokens.txt`) e o próprio ONNX Runtime
//! (`libonnxruntime.so`, o oficial da Microsoft) são baixados à parte. As duas bibliotecas em C (o
//! ONNX Runtime e o espeak-ng) são carregadas durante a execução: sem elas, o app abre normalmente.

mod filtro;
mod fonemas;
mod modelo;
mod normalizar;
mod normalizar_pt;
mod tokens;
mod vozes;

pub use filtro::reamostrar;
pub use fonemas::{EspeakNg, Fonemizador, fonemas_com_pontuacao, fonemas_pontuados};
pub use modelo::{
    ARQUIVO_MODELO, ARQUIVO_ONNX_RUNTIME, ARQUIVO_TOKENS, ARQUIVO_VOZES, Kokoro, TAXA,
};
pub use normalizar::normalizar_ingles;
pub use normalizar_pt::normalizar_portugues;
pub use tokens::{MAX_TOKENS, Vocabulario, dividir};
pub use vozes::{VOZES, Vozes, corte_da_voz, idioma_da_voz, indice_da_voz};

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// O ambiente do ONNX Runtime, um só por processo: ele recusa um segundo ("only one environment
/// is allowed per process"), mesmo depois de o primeiro ser descartado. Cada modelo criava o seu, e
/// reabrir um modelo (outra voz, ou depois de 2 min parado) falhava até o app ser reiniciado.
/// `runtime` é a `libonnxruntime.so` a carregar na primeira vez; depois, vale a já carregada.
pub(crate) fn ambiente_onnx(
    runtime: &Path,
) -> Result<&'static ort::environment::Environment, ErroKokoro> {
    static AMBIENTE: OnceLock<ort::environment::Environment> = OnceLock::new();
    static CRIANDO: Mutex<()> = Mutex::new(());
    if let Some(a) = AMBIENTE.get() {
        return Ok(a);
    }
    let _vez = CRIANDO.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(a) = AMBIENTE.get() {
        return Ok(a);
    }
    let ambiente = ort::init_from(runtime)
        .map_err(ErroKokoro::SemOnnxRuntime)?
        .with_name("folio")
        .build()?;
    Ok(AMBIENTE.get_or_init(|| ambiente))
}

#[derive(Debug, thiserror::Error)]
pub enum ErroKokoro {
    #[error("a voz neural precisa do espeak-ng instalado (libespeak-ng.so.1)")]
    SemEspeak(#[source] libloading::Error),
    #[error("não foi possível carregar o ONNX Runtime")]
    SemOnnxRuntime(#[source] ort::LoadDynamicError),
    #[error("o espeak-ng não iniciou")]
    EspeakNaoIniciou,
    #[error("o espeak-ng não conhece o idioma {0}")]
    IdiomaDesconhecido(String),
    #[error("voz desconhecida: {0}")]
    VozDesconhecida(String),
    #[error("arquivo da voz neural inválido: {0}")]
    ArquivoInvalido(String),
    #[error("não foi possível ler {caminho}")]
    Io {
        caminho: PathBuf,
        #[source]
        fonte: std::io::Error,
    },
    #[error("falha no modelo de voz")]
    Modelo(#[from] ort::Error),
}

/// Áudio mono em WAV de 16 bits, para ouvir o que os testes ignorados geram (Kokoro e Piper).
#[cfg(test)]
pub(crate) fn wav_mono_16(amostras: &[f32], taxa: u32) -> Vec<u8> {
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
