//! As vozes do Kokoro (`voices.bin`).
//!
//! Cada voz é uma tabela de 510 "estilos" de 256 números, um por tamanho de frase (em tokens):
//! a frase de n tokens usa o estilo n. O arquivo é a sequência crua de `f32` (little-endian)
//! de todas as vozes, na ordem de `VOZES`.

use super::ErroKokoro;

const ESTILOS_POR_VOZ: usize = 510;
const TAMANHO_DO_ESTILO: usize = 256;

/// As 54 vozes do Kokoro v1.0, na ordem do `voices.bin` (o índice é o número da voz). A
/// primeira letra é o idioma (a = inglês americano, b = britânico, p = português do Brasil…),
/// a segunda o gênero (f, m).
pub const VOZES: [&str; 54] = [
    "af_alloy",
    "af_aoede",
    "af_bella",
    "af_heart",
    "af_jessica",
    "af_kore",
    "af_nicole",
    "af_nova",
    "af_river",
    "af_sarah",
    "af_sky",
    "am_adam",
    "am_echo",
    "am_eric",
    "am_fenrir",
    "am_liam",
    "am_michael",
    "am_onyx",
    "am_puck",
    "am_santa",
    "bf_alice",
    "bf_emma",
    "bf_isabella",
    "bf_lily",
    "bm_daniel",
    "bm_fable",
    "bm_george",
    "bm_lewis",
    "ef_dora",
    "em_alex",
    "ff_siwis",
    "hf_alpha",
    "hf_beta",
    "hm_omega",
    "hm_psi",
    "if_sara",
    "im_nicola",
    "jf_alpha",
    "jf_gongitsune",
    "jf_nezumi",
    "jf_tebukuro",
    "jm_kumo",
    "pf_dora",
    "pm_alex",
    "pm_santa",
    "zf_xiaobei",
    "zf_xiaoni",
    "zf_xiaoxiao",
    "zf_xiaoyi",
    "zm_yunjian",
    "zm_yunxi",
    "zm_yunxia",
    "zm_yunyang",
    "em_santa",
];

pub fn indice_da_voz(nome: &str) -> Option<usize> {
    VOZES.iter().position(|v| *v == nome)
}

/// O idioma do espeak-ng para a pronúncia da voz. `None` para os idiomas que a voz neural
/// ainda não lê (japonês e chinês precisam de outra conversão em fonemas).
pub fn idioma_da_voz(nome: &str) -> Option<&'static str> {
    match nome.as_bytes().first()? {
        b'a' => Some("en-us"),
        b'b' => Some("en-gb"),
        b'e' => Some("es"),
        b'f' => Some("fr-fr"),
        b'h' => Some("hi"),
        b'i' => Some("it"),
        b'p' => Some("pt-br"),
        _ => None,
    }
}

#[derive(Debug)]
pub struct Vozes(Vec<f32>);

impl Vozes {
    pub fn ler(bytes: &[u8]) -> Result<Self, ErroKokoro> {
        let por_voz = ESTILOS_POR_VOZ * TAMANHO_DO_ESTILO * 4;
        if bytes.len() != VOZES.len() * por_voz {
            return Err(ErroKokoro::ArquivoInvalido(format!(
                "voices.bin com {} bytes (esperado {})",
                bytes.len(),
                VOZES.len() * por_voz
            )));
        }
        let numeros = bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|b| f32::from_le_bytes(*b))
            .collect();
        Ok(Self(numeros))
    }

    /// O estilo da voz para uma frase de `tokens` tokens (as maiores usam o último).
    pub fn estilo(&self, voz: usize, tokens: usize) -> &[f32] {
        let linha = tokens.min(ESTILOS_POR_VOZ - 1);
        let inicio = (voz * ESTILOS_POR_VOZ + linha) * TAMANHO_DO_ESTILO;
        &self.0[inicio..inicio + TAMANHO_DO_ESTILO]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indices_e_idiomas() {
        assert_eq!(indice_da_voz("af_heart"), Some(3));
        assert_eq!(indice_da_voz("pf_dora"), Some(42));
        assert_eq!(indice_da_voz("em_santa"), Some(53));
        assert_eq!(indice_da_voz("xx"), None);
        assert_eq!(idioma_da_voz("bm_george"), Some("en-gb"));
        assert_eq!(idioma_da_voz("pm_alex"), Some("pt-br"));
        assert_eq!(idioma_da_voz("zf_xiaobei"), None);
        assert_eq!(idioma_da_voz(""), None);
    }

    #[test]
    fn tamanho_errado_e_recusado() {
        assert!(Vozes::ler(&[0; 1024]).is_err());
    }

    #[test]
    fn estilo_pela_voz_e_pelo_tamanho_da_frase() {
        // Cada número do arquivo = sua posição, para conferir de onde o estilo saiu.
        let total = VOZES.len() * ESTILOS_POR_VOZ * TAMANHO_DO_ESTILO;
        let bytes: Vec<u8> = (0..total).flat_map(|i| (i as f32).to_le_bytes()).collect();
        let vozes = Vozes::ler(&bytes).unwrap();
        let primeiro = |voz, tokens| vozes.estilo(voz, tokens)[0] as usize;
        assert_eq!(primeiro(0, 0), 0);
        assert_eq!(primeiro(0, 7), 7 * TAMANHO_DO_ESTILO);
        assert_eq!(
            primeiro(3, 7),
            (3 * ESTILOS_POR_VOZ + 7) * TAMANHO_DO_ESTILO
        );
        // Frase maior que a tabela: o último estilo.
        assert_eq!(
            primeiro(1, 9999),
            (2 * ESTILOS_POR_VOZ - 1) * TAMANHO_DO_ESTILO
        );
        assert_eq!(vozes.estilo(2, 3).len(), TAMANHO_DO_ESTILO);
    }
}
