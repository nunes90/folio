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

pub use fonemas::{EspeakNg, Fonemizador, fonemas_com_pontuacao};
pub use modelo::{
    ARQUIVO_MODELO, ARQUIVO_ONNX_RUNTIME, ARQUIVO_TOKENS, ARQUIVO_VOZES, Kokoro, TAXA,
};
pub use normalizar::normalizar_ingles;
pub use normalizar_pt::normalizar_portugues;
pub use tokens::{MAX_TOKENS, Vocabulario, dividir};
pub use vozes::{VOZES, Vozes, corte_da_voz, idioma_da_voz, indice_da_voz};

use std::path::PathBuf;

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
