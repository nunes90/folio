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

/// A família do modelo: diz como carregá-lo e como a aba Voz o mostra.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tipo {
    /// Um modelo com várias vozes numa pasta (inglês e português).
    Kokoro,
    /// Uma voz por modelo, mais leve e mais rápida (M27e).
    Piper,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Modelo {
    pub id: &'static str,
    pub nome: &'static str,
    pub tipo: Tipo,
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
    tipo: Tipo::Kokoro,
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

/// Os arquivos de uma voz do Piper, presos a um commit do `rhasspy/piper-voices`.
macro_rules! hf_piper {
    ($($parte:expr),+) => {
        concat!(
            "https://huggingface.co/rhasspy/piper-voices/resolve/",
            "e7229f7d33a10e145e109b886d661984201ac3c4/en/en_US/",
            $($parte),+
        )
    };
}

/// Uma voz do Piper: o modelo, a configuração, o cartão (a origem e a licença dos dados) e o ONNX
/// Runtime (cada pasta funciona sozinha; são ~11 MB a mais por voz).
macro_rules! voz_piper {
    ($id:literal, $nome:literal, $genero:expr, $dir:literal,
     $sha_onnx:literal, $sha_json:literal, $tam_json:literal, $sha_card:literal, $tam_card:literal) => {
        Modelo {
            id: concat!("piper-", $id),
            nome: $nome,
            tipo: Tipo::Piper,
            licenca: "MIT (modelo); gravações em domínio público",
            arquivos: &[
                Arquivo {
                    nome: crate::piper::ARQUIVO_MODELO,
                    url: hf_piper!($dir, "/medium/", $id, ".onnx"),
                    sha256: $sha_onnx,
                    tamanho: 63_531_379,
                    extrair: &[],
                },
                Arquivo {
                    nome: crate::piper::ARQUIVO_CONFIG,
                    url: hf_piper!($dir, "/medium/", $id, ".onnx.json"),
                    sha256: $sha_json,
                    tamanho: $tam_json,
                    extrair: &[],
                },
                Arquivo {
                    nome: "MODEL_CARD",
                    url: hf_piper!($dir, "/medium/MODEL_CARD"),
                    sha256: $sha_card,
                    tamanho: $tam_card,
                    extrair: &[],
                },
                ONNX_RUNTIME,
            ],
            vozes: &[VozDoCatalogo {
                id: $id,
                nome: $nome,
                idioma: "en-US",
                genero: $genero,
            }],
        }
    };
}

// As vozes do Piper (M27e): só as treinadas do zero com gravações em domínio público, ou a partir
// de outra assim (o John vem da Kristin). As outras do inglês e todas do português vêm de vozes com
// licença só para pesquisa (lessac) ou não comercial (ryan), ou de origem desconhecida. Ouvidas
// pelo Lucas (nov/2026): a Cori (britânica) ficou de fora.
pub const PIPER_KRISTIN: Modelo = voz_piper!(
    "en_US-kristin-medium",
    "Kristin",
    Genero::Feminina,
    "kristin",
    "5849957f929cbf720c258f8458692d6103fff2f0e3d3b19c8259474bb06a18d4",
    "5681426d4aead22195de70531eeeeddb46493cfaffc5764b2ea3db73428b651c",
    4968,
    "8c181b1d5f7d8152b914faab941fcbe6b8f0495e63e5189d6f27b8c68c8393fc",
    479
);
pub const PIPER_LJSPEECH: Modelo = voz_piper!(
    "en_US-ljspeech-medium",
    "LJSpeech",
    Genero::Feminina,
    "ljspeech",
    "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22",
    "141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860",
    4972,
    "fbee1529c89d36b3fe76d7e9f3f832dce17f44900a52d76a9bda735654766b4d",
    517
);
pub const PIPER_NORMAN: Modelo = voz_piper!(
    "en_US-norman-medium",
    "Norman",
    Genero::Masculina,
    "norman",
    "b9739443232a80a59c7d18810dd856899bf16a7964725f5ab81ea49b1351cb71",
    "6c2db7f558a4a8deb9fe822583c1c5105f6c4e834dd0f9de8ad17a888ee9fe1d",
    4968,
    "60eaf4d10009d1bd4a1aa555d337dae00f60421d72fee415b9139a021e7cb5d0",
    528
);
pub const PIPER_JOHN: Modelo = voz_piper!(
    "en_US-john-medium",
    "John",
    Genero::Masculina,
    "john",
    "789c6c875726e627ddee93d51d8727859abe9c091c3d141591f4b83c2072e988",
    "af60f177b6b550f3d7a302720c0fb89e7f94a82b5dca464775ef63b1c69ba09a",
    4965,
    "a056da65cd70dcbda96fc3420fe8d3442dbf3c8b75f49cdf800a715b42e299d1",
    498
);

/// Os modelos que o app oferece.
pub const MODELOS: &[Modelo] = &[
    KOKORO,
    PIPER_KRISTIN,
    PIPER_LJSPEECH,
    PIPER_NORMAN,
    PIPER_JOHN,
];

pub fn modelo(id: &str) -> Option<&'static Modelo> {
    MODELOS.iter().find(|m| m.id == id)
}

/// As vozes dos modelos instalados, com o modelo de cada uma, na ordem do catálogo.
pub fn vozes_instaladas(
    instalado: impl Fn(&Modelo) -> bool,
) -> Vec<(&'static VozDoCatalogo, &'static Modelo)> {
    MODELOS
        .iter()
        .filter(|m| instalado(m))
        .flat_map(|m| m.vozes.iter().map(move |v| (v, m)))
        .collect()
}

/// A voz de cada idioma (pela base: "en", "pt"): a escolhida, se estiver instalada; senão, a
/// primeira instalada daquele idioma, na ordem do catálogo (o Kokoro primeiro). Idioma sem voz
/// instalada fica de fora.
pub fn vozes_dos_idiomas(
    escolhas: &[(&str, &str)],
    instaladas: &[(&'static VozDoCatalogo, &'static Modelo)],
) -> Vec<(String, String)> {
    let base = |v: &VozDoCatalogo| crate::voz_por_idioma::idioma_base(v.idioma);
    let mut idiomas: Vec<String> = Vec::new();
    for (v, _) in instaladas {
        if !idiomas.contains(&base(v)) {
            idiomas.push(base(v));
        }
    }
    idiomas
        .into_iter()
        .filter_map(|idioma| {
            let escolhida = escolhas
                .iter()
                .find(|(b, _)| *b == idioma)
                .map(|(_, id)| *id);
            let do_idioma = || instaladas.iter().find(|(v, _)| base(v) == idioma);
            let voz = instaladas
                .iter()
                .find(|(v, _)| Some(v.id) == escolhida && base(v) == idioma)
                .or_else(do_idioma)?;
            Some((idioma, voz.0.id.to_string()))
        })
        .collect()
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
        // Cada voz do Piper no seu modelo, com o ONNX Runtime junto.
        assert_eq!(
            voz("en_US-norman-medium").map(|(m, v)| (m.id, v.nome, m.tipo)),
            Some(("piper-en_US-norman-medium", "Norman", Tipo::Piper))
        );
        for m in MODELOS.iter().filter(|m| m.tipo == Tipo::Piper) {
            assert_eq!(m.vozes.len(), 1);
            assert!(
                m.arquivos
                    .iter()
                    .any(|a| a.nome == crate::piper::ARQUIVO_MODELO)
            );
            assert!(m.arquivos.iter().any(|a| a.nome == ONNX_RUNTIME.nome));
            assert!(
                m.arquivos[0]
                    .url
                    .ends_with(&format!("{}.onnx", m.vozes[0].id))
            );
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

    #[test]
    fn a_voz_de_cada_idioma_e_a_escolhida_se_estiver_baixada() {
        let so = |ids: &'static [&'static str]| move |m: &Modelo| ids.contains(&m.id);
        // Só o Norman (Piper): o inglês fala com ele, mesmo escolhida a Heart; sem português.
        let instaladas = vozes_instaladas(so(&["piper-en_US-norman-medium"]));
        assert_eq!(
            vozes_dos_idiomas(&[("en", "af_heart")], &instaladas),
            [("en".to_string(), "en_US-norman-medium".to_string())]
        );
        // Kokoro e o Norman: vale a escolha; sem escolha, a primeira do catálogo (a Heart).
        let instaladas = vozes_instaladas(so(&["kokoro-v1.0-int8", "piper-en_US-norman-medium"]));
        assert_eq!(
            vozes_dos_idiomas(
                &[("en", "en_US-norman-medium"), ("pt", "pm_alex")],
                &instaladas
            ),
            [
                ("en".to_string(), "en_US-norman-medium".to_string()),
                ("pt".to_string(), "pm_alex".to_string())
            ]
        );
        assert_eq!(
            vozes_dos_idiomas(&[("en", ""), ("pt", "")], &instaladas),
            [
                ("en".to_string(), "af_heart".to_string()),
                ("pt".to_string(), "pf_dora".to_string())
            ]
        );
        // Uma escolha de outro idioma não vale.
        assert_eq!(
            vozes_dos_idiomas(&[("en", "pf_dora")], &instaladas)[0].1,
            "af_heart"
        );
        assert!(vozes_dos_idiomas(&[], &vozes_instaladas(|_| false)).is_empty());
    }
}
