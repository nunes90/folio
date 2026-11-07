//! Catálogo das vozes neurais que o app sabe baixar.
//!
//! Cada modelo lista os arquivos que precisa (de onde vêm, tamanho e SHA-256) e as vozes que
//! oferece. Os endereços apontam para um commit fixo (Hugging Face) ou uma versão fixa (GitHub):
//! o conteúdo não muda, então o hash sempre confere. Um modelo instalado é uma pasta
//! `<vozes>/<id>/` com os arquivos; ela só aparece quando tudo foi baixado e conferido (ver
//! `baixar`).
//!
//! Hoje há um modelo (Kokoro). O Piper (M27e) entra como outro `Modelo`.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Um arquivo a baixar. Se `extrair` não estiver vazio, o arquivo é um `.tgz`, e só as entradas
/// listadas (caminho no pacote → nome na pasta do modelo) ficam; o pacote é apagado.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Arquivo {
    pub nome: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub tamanho: u64,
    #[serde(skip)]
    pub extrair: &'static [(&'static str, &'static str)],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Genero {
    Feminina,
    Masculina,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VozDoCatalogo {
    /// O nome da voz no modelo (ex.: "af_heart").
    pub id: &'static str,
    /// O nome para mostrar ("Heart").
    pub nome: &'static str,
    /// Idioma BCP 47 ("en-US").
    pub idioma: &'static str,
    pub genero: Genero,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Modelo {
    pub id: &'static str,
    pub nome: &'static str,
    pub licenca: &'static str,
    pub arquivos: &'static [Arquivo],
    pub vozes: &'static [VozDoCatalogo],
}

impl Modelo {
    /// Quanto baixar, somando os arquivos.
    pub fn tamanho(&self) -> u64 {
        self.arquivos.iter().map(|a| a.tamanho).sum()
    }

    pub fn voz(&self, id: &str) -> Option<&'static VozDoCatalogo> {
        self.vozes.iter().find(|v| v.id == id)
    }

    /// A voz usada quando nenhuma foi escolhida.
    pub fn voz_padrao(&self) -> &'static VozDoCatalogo {
        &self.vozes[0]
    }

    /// A primeira voz do idioma (base: "en", "pt"), se houver.
    pub fn voz_do_idioma(&self, base: &str) -> Option<&'static VozDoCatalogo> {
        self.vozes
            .iter()
            .find(|v| crate::voz_por_idioma::idioma_base(v.idioma) == base)
    }

    /// Os idiomas (bases) que o modelo fala, na ordem do catálogo.
    pub fn idiomas(&self) -> Vec<String> {
        let mut idiomas: Vec<String> = Vec::new();
        for v in self.vozes {
            let base = crate::voz_por_idioma::idioma_base(v.idioma);
            if !idiomas.contains(&base) {
                idiomas.push(base);
            }
        }
        idiomas
    }

    pub fn pasta(&self, vozes: &Path) -> PathBuf {
        vozes.join(self.id)
    }

    /// Instalado = a pasta existe (ela só é criada no fim de um download conferido).
    pub fn instalado(&self, vozes: &Path) -> bool {
        self.pasta(vozes).is_dir()
    }

    /// Apaga a pasta do modelo. Não instalado não é erro.
    pub fn remover(&self, vozes: &Path) -> std::io::Result<()> {
        match std::fs::remove_dir_all(self.pasta(vozes)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }
}

/// Um arquivo do Kokoro no Hugging Face, no commit conferido.
macro_rules! hf_kokoro {
    ($arquivo:literal) => {
        concat!(
            "https://huggingface.co/csukuangfj/kokoro-int8-multi-lang-v1_0/resolve/",
            "57adb37fc0e8d4bd430cfc1b8f8c2294945b9af2/",
            $arquivo
        )
    };
}

/// A biblioteca oficial do ONNX Runtime (MIT, exige glibc 2.28): o pacote da Microsoft para a
/// arquitetura em que o app foi compilado. A licença e os avisos de terceiros vão junto.
#[cfg(not(target_arch = "aarch64"))]
const ONNX_RUNTIME: Arquivo = Arquivo {
    nome: "onnxruntime-linux-x64-1.31.1.tgz",
    url: "https://github.com/microsoft/onnxruntime/releases/download/v1.31.1/onnxruntime-linux-x64-1.31.1.tgz",
    sha256: "c849e36a1ef3e22d4ff217b9d1ce4a3cf5b9467b975610913ae959ad5b16bdc9",
    tamanho: 11_413_655,
    extrair: &[
        (
            "onnxruntime-linux-x64-1.31.1/lib/libonnxruntime.so.1.31.1",
            "libonnxruntime.so",
        ),
        (
            "onnxruntime-linux-x64-1.31.1/LICENSE",
            "LICENSE-onnxruntime",
        ),
        (
            "onnxruntime-linux-x64-1.31.1/ThirdPartyNotices.txt",
            "ThirdPartyNotices-onnxruntime.txt",
        ),
    ],
};

#[cfg(target_arch = "aarch64")]
const ONNX_RUNTIME: Arquivo = Arquivo {
    nome: "onnxruntime-linux-aarch64-1.31.1.tgz",
    url: "https://github.com/microsoft/onnxruntime/releases/download/v1.31.1/onnxruntime-linux-aarch64-1.31.1.tgz",
    sha256: "5317505e2da99be65f8e2775ba3c2afd6d2961fd78aba1bd8f56159f48820c78",
    tamanho: 10_332_381,
    extrair: &[
        (
            "onnxruntime-linux-aarch64-1.31.1/lib/libonnxruntime.so.1.31.1",
            "libonnxruntime.so",
        ),
        (
            "onnxruntime-linux-aarch64-1.31.1/LICENSE",
            "LICENSE-onnxruntime",
        ),
        (
            "onnxruntime-linux-aarch64-1.31.1/ThirdPartyNotices.txt",
            "ThirdPartyNotices-onnxruntime.txt",
        ),
    ],
};

/// Kokoro v1.0 (Apache-2.0), versão int8 da sherpa-onnx: soa igual ao modelo completo e gera
/// ~4× mais rápido que o tempo real.
pub const KOKORO: Modelo = Modelo {
    id: "kokoro-v1.0-int8",
    nome: "Kokoro",
    licenca: "Apache-2.0",
    arquivos: &[
        Arquivo {
            nome: crate::kokoro::ARQUIVO_MODELO,
            url: hf_kokoro!("model.int8.onnx"),
            sha256: "75635ea3b85a32d00094dcdd61a258aba87c160f7c264c304a7b3ae9d734195e",
            tamanho: 114_202_993,
            extrair: &[],
        },
        Arquivo {
            nome: crate::kokoro::ARQUIVO_VOZES,
            url: hf_kokoro!("voices.bin"),
            sha256: "1c5a5b983d3d50d8586d437a51f3faa2da7919ce76a013c081e65671a3447c29",
            tamanho: 28_200_960,
            extrair: &[],
        },
        Arquivo {
            nome: crate::kokoro::ARQUIVO_TOKENS,
            url: hf_kokoro!("tokens.txt"),
            sha256: "6ebb6bb288f20f3ae8d004d3c2ca27697da27c037d75e81a60e2a6a663f95425",
            tamanho: 687,
            extrair: &[],
        },
        Arquivo {
            nome: "LICENSE",
            url: hf_kokoro!("LICENSE"),
            sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
            tamanho: 11_358,
            extrair: &[],
        },
        ONNX_RUNTIME,
    ],
    vozes: &[
        VozDoCatalogo {
            id: "af_heart",
            nome: "Heart",
            idioma: "en-US",
            genero: Genero::Feminina,
        },
        VozDoCatalogo {
            id: "af_bella",
            nome: "Bella",
            idioma: "en-US",
            genero: Genero::Feminina,
        },
        VozDoCatalogo {
            id: "am_michael",
            nome: "Michael",
            idioma: "en-US",
            genero: Genero::Masculina,
        },
        // Não a Emma (bf_emma): no mesmo texto, chia bem mais que as outras (ruído de fundo nos
        // agudos, ouvido em out/2026); um passa-baixa não a limpa. A Isabella soa limpa.
        VozDoCatalogo {
            id: "bf_isabella",
            nome: "Isabella",
            idioma: "en-GB",
            genero: Genero::Feminina,
        },
        VozDoCatalogo {
            id: "bm_george",
            nome: "George",
            idioma: "en-GB",
            genero: Genero::Masculina,
        },
        // Das três vozes do Brasil, a Dora e o Alex soaram bons num trecho de livro (nov/2026,
        // depois de juntar as frases picadas); o Santa, não. A primeira é a padrão do idioma.
        VozDoCatalogo {
            id: "pf_dora",
            nome: "Dora",
            idioma: "pt-BR",
            genero: Genero::Feminina,
        },
        VozDoCatalogo {
            id: "pm_alex",
            nome: "Alex",
            idioma: "pt-BR",
            genero: Genero::Masculina,
        },
    ],
};

/// Os modelos que o app oferece.
pub const MODELOS: &[Modelo] = &[KOKORO];

pub fn modelo(id: &str) -> Option<&'static Modelo> {
    MODELOS.iter().find(|m| m.id == id)
}

/// A voz com esse id e o modelo dela.
pub fn voz(id: &str) -> Option<(&'static Modelo, &'static VozDoCatalogo)> {
    MODELOS.iter().find_map(|m| m.voz(id).map(|v| (m, v)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kokoro::indice_da_voz;

    #[test]
    fn arquivos_com_hash_e_tamanho() {
        for m in MODELOS {
            assert!(!m.vozes.is_empty());
            for a in m.arquivos {
                assert_eq!(a.sha256.len(), 64, "{}", a.nome);
                assert!(a.sha256.bytes().all(|b| b.is_ascii_hexdigit()));
                assert!(a.tamanho > 0);
                assert!(a.url.starts_with("https://"));
            }
        }
        assert_eq!(KOKORO.tamanho(), 142_415_998 + ONNX_RUNTIME.tamanho);
    }

    #[test]
    fn vozes_existem_no_modelo() {
        for v in KOKORO.vozes {
            assert!(indice_da_voz(v.id).is_some(), "{}", v.id);
        }
        assert_eq!(KOKORO.voz_padrao().id, "af_heart");
        assert_eq!(KOKORO.voz("bm_george").map(|v| v.nome), Some("George"));
        assert!(KOKORO.voz("xx").is_none());
        assert_eq!(modelo("kokoro-v1.0-int8").map(|m| m.nome), Some("Kokoro"));
        assert_eq!(
            voz("bf_isabella").map(|(m, _)| m.id),
            Some("kokoro-v1.0-int8")
        );
        assert!(voz("").is_none());
        // Fora do catálogo (a preferência de quem a tinha volta à voz padrão).
        assert!(voz("bf_emma").is_none());
        assert_eq!(KOKORO.voz_do_idioma("pt").map(|v| v.id), Some("pf_dora"));
        assert_eq!(KOKORO.voz("pm_alex").map(|v| v.nome), Some("Alex"));
        assert_eq!(KOKORO.voz_do_idioma("en").map(|v| v.id), Some("af_heart"));
        assert!(KOKORO.voz_do_idioma("es").is_none());
        assert_eq!(KOKORO.idiomas(), ["en", "pt"]);
    }

    #[test]
    fn instalar_e_remover_pela_pasta() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!KOKORO.instalado(dir.path()));
        KOKORO.remover(dir.path()).unwrap();
        std::fs::create_dir_all(KOKORO.pasta(dir.path())).unwrap();
        assert!(KOKORO.instalado(dir.path()));
        KOKORO.remover(dir.path()).unwrap();
        assert!(!KOKORO.instalado(dir.path()));
    }
}
