//! Miniaturas das capas (M36). A capa de um EPUB vinha para o cache como estava no livro: às vezes
//! mais de 1 MB, para um cartão de uns 200 px na biblioteca, e cada uma era decodificada inteira ao
//! rolar a grade. Agora toda capa gravada passa por aqui: se for grande, vira um JPEG de até
//! [`LARGURA`] px de largura.

use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageReader, Limits, Rgb, RgbImage};

use crate::epub::Capa;

/// Largura da miniatura: o cartão mais largo da grade (13rem) em tela de densidade dupla, com folga.
pub const LARGURA: u32 = 480;
/// Um arquivo deste tamanho para baixo nem é aberto ao procurar as capas grandes do cache.
pub const BYTES_PEQUENA: usize = 150 * 1024;
const QUALIDADE: u8 = 85;
/// Limites da decodificação: uma "capa" de 50.000 × 50.000 px não derruba o app.
const LADO_MAXIMO: u32 = 12_000;
const MEMORIA_MAXIMA: u64 = 256 * 1024 * 1024;

/// A capa reduzida, ou `None` se ela pode ficar como está: já é pequena, é um SVG (vetorial) ou
/// não dá para decodificar (o arquivo original segue valendo; o webview pode saber mostrá-lo).
pub fn reduzir(capa: &Capa) -> Option<Capa> {
    if capa.tipo_midia == "image/svg+xml" {
        return None;
    }
    let (largura, _) = leitor(&capa.bytes)?.into_dimensions().ok()?;
    // Já estreita: fica como está, seja qual for o tamanho do arquivo (recodificar ganharia pouco,
    // e uma miniatura que não comprime bem seria refeita a cada abertura do app).
    if largura <= LARGURA {
        return None;
    }
    // `into_dimensions` consome o leitor: outro para decodificar.
    let imagem = leitor(&capa.bytes)?.decode().ok()?;
    // Altura livre: a proporção da capa se mantém.
    let menor = imagem.resize(LARGURA, u32::MAX, FilterType::Lanczos3);
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, QUALIDADE)
        .encode_image(&sobre_branco(&menor))
        .ok()?;
    Some(Capa {
        tipo_midia: "image/jpeg".into(),
        bytes,
    })
}

/// Um leitor da imagem, com o formato adivinhado pelos primeiros bytes e os limites de tamanho.
fn leitor(bytes: &[u8]) -> Option<ImageReader<Cursor<&[u8]>>> {
    let mut leitor = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let mut limites = Limits::default();
    limites.max_image_width = Some(LADO_MAXIMO);
    limites.max_image_height = Some(LADO_MAXIMO);
    limites.max_alloc = Some(MEMORIA_MAXIMA);
    leitor.limits(limites);
    Some(leitor)
}

/// O JPEG não tem transparência: uma capa com fundo transparente fica sobre branco (sem isto, o
/// transparente viraria preto).
fn sobre_branco(imagem: &DynamicImage) -> RgbImage {
    let rgba = imagem.to_rgba8();
    let mut saida = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let [r, g, b, a] = pixel.0;
        let a = u16::from(a);
        // Mistura com o branco (255), em inteiros: c·a + 255·(255 − a), dividido por 255.
        let misturar = |c: u8| ((u16::from(c) * a + 255 * (255 - a) + 127) / 255) as u8;
        saida.put_pixel(x, y, Rgb([misturar(r), misturar(g), misturar(b)]));
    }
    saida
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, Rgba, RgbaImage};
    use proptest::prelude::*;

    fn png(largura: u32, altura: u32, cor: [u8; 4]) -> Capa {
        let mut bytes = Vec::new();
        RgbaImage::from_pixel(largura, altura, Rgba(cor))
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        Capa {
            tipo_midia: "image/png".into(),
            bytes,
        }
    }

    fn dimensoes(capa: &Capa) -> (u32, u32) {
        let imagem = image::load_from_memory(&capa.bytes).unwrap();
        (imagem.width(), imagem.height())
    }

    #[test]
    fn capa_grande_vira_um_jpeg_estreito_na_mesma_proporcao() {
        let reduzida = reduzir(&png(1200, 1800, [200, 30, 30, 255])).unwrap();
        assert_eq!(reduzida.tipo_midia, "image/jpeg");
        assert_eq!(dimensoes(&reduzida), (480, 720));
    }

    #[test]
    fn capa_pequena_fica_como_esta() {
        assert!(reduzir(&png(300, 450, [0, 0, 0, 255])).is_none());
    }

    #[test]
    fn transparente_fica_sobre_branco() {
        let reduzida = reduzir(&png(1000, 1000, [0, 0, 0, 0])).unwrap();
        let pixel = image::load_from_memory(&reduzida.bytes).unwrap().to_rgb8();
        let [r, g, b] = pixel.get_pixel(10, 10).0;
        assert!(r > 250 && g > 250 && b > 250, "{r} {g} {b}");
    }

    #[test]
    fn svg_e_lixo_ficam_como_estao() {
        let svg = Capa {
            tipo_midia: "image/svg+xml".into(),
            bytes: b"<svg xmlns='http://www.w3.org/2000/svg'/>".to_vec(),
        };
        assert!(reduzir(&svg).is_none());
        let lixo = Capa {
            tipo_midia: "image/jpeg".into(),
            bytes: vec![0xFF; 400_000],
        };
        assert!(reduzir(&lixo).is_none());
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(64))]
        /// Bytes quaisquer no lugar da capa: nunca um pânico.
        #[test]
        fn nunca_entra_em_panico(bytes in proptest::collection::vec(any::<u8>(), 0..4096)) {
            let _ = reduzir(&Capa { tipo_midia: "image/png".into(), bytes });
        }
    }
}
