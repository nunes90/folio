//! Passa-baixa para vozes que chiam nos agudos (o "s" da Dora soava metálico, como um apito).
//!
//! Butterworth de 4ª ordem, em duas seções biquad (as fórmulas do "Audio EQ Cookbook", de Robert
//! Bristow-Johnson). O corte em 8 kHz foi escolhido ouvindo: tira o apito e não abafa a voz (em
//! 6 kHz abafava).

/// Uma seção de 2ª ordem (forma direta I).
struct Biquad {
    b: [f32; 3],
    a: [f32; 2],
    x: [f32; 2],
    y: [f32; 2],
}

impl Biquad {
    fn passa_baixa(taxa: f32, corte: f32, q: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * corte / taxa;
        let (seno, cosseno) = w0.sin_cos();
        let alfa = seno / (2.0 * q);
        let a0 = 1.0 + alfa;
        let b1 = (1.0 - cosseno) / a0;
        Self {
            b: [b1 / 2.0, b1, b1 / 2.0],
            a: [-2.0 * cosseno / a0, (1.0 - alfa) / a0],
            x: [0.0; 2],
            y: [0.0; 2],
        }
    }

    fn passar(&mut self, v: f32) -> f32 {
        let s = self.b[0] * v + self.b[1] * self.x[0] + self.b[2] * self.x[1]
            - self.a[0] * self.y[0]
            - self.a[1] * self.y[1];
        self.x = [v, self.x[0]];
        self.y = [s, self.y[0]];
        s
    }
}

/// Filtra `amostras` (a `taxa` Hz) acima de `corte` Hz, no lugar.
pub fn passa_baixa(amostras: &mut [f32], taxa: u32, corte: f32) {
    // Os dois Q de um Butterworth de 4ª ordem.
    let mut secoes = [0.541_196_1, 1.306_563].map(|q| Biquad::passa_baixa(taxa as f32, corte, q));
    for a in amostras.iter_mut() {
        *a = secoes.iter_mut().fold(*a, |v, s| s.passar(v));
    }
}

/// Muda a taxa de amostragem (o Piper gera a 22 050 Hz; a saída de som abre a 24 000 Hz, a do
/// Kokoro). Interpolação por sinc com janela de Blackman, 16 amostras de cada lado: a interpolação
/// linear deixaria réplicas nos agudos (a voz soava áspera quando o rodio convertia assim). Ao
/// baixar a taxa, o corte desce junto (sem dobrar os agudos para baixo).
pub fn reamostrar(amostras: &[f32], de: u32, para: u32) -> Vec<f32> {
    if de == para || amostras.is_empty() {
        return amostras.to_vec();
    }
    const MEIO: f64 = 16.0;
    // As posições se repetem a cada `p` amostras de saída (22 050 → 24 000: 147/160): os pesos de
    // cada uma das `p` fases são calculados uma vez só.
    let g = mdc(de, para);
    let (q, p) = (u64::from(de / g), u64::from(para / g));
    let corte = (f64::from(para) / f64::from(de)).min(1.0);
    let largura = MEIO / corte;
    let alcance = largura.ceil() as i64;
    let pesos: Vec<Vec<f32>> = (0..p)
        .map(|fase| {
            let frac = fase as f64 / p as f64;
            (-alcance + 1..=alcance)
                .map(|k| {
                    let d = frac - k as f64;
                    if d.abs() >= largura {
                        return 0.0;
                    }
                    let janela = 0.42
                        + 0.5 * (std::f64::consts::PI * d / largura).cos()
                        + 0.08 * (2.0 * std::f64::consts::PI * d / largura).cos();
                    (corte * sinc(corte * d) * janela) as f32
                })
                .collect()
        })
        .collect();
    let n = amostras.len() as i64;
    let saida = (amostras.len() as u64 * p).div_ceil(q);
    (0..saida)
        .map(|i| {
            let base = (i * q / p) as i64;
            let fase = (i * q % p) as usize;
            pesos[fase]
                .iter()
                .zip(base - alcance + 1..)
                .filter(|&(_, k)| (0..n).contains(&k))
                .map(|(w, k)| w * amostras[k as usize])
                .sum()
        })
        .collect()
}

fn mdc(mut a: u32, mut b: u32) -> u32 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

fn sinc(x: f64) -> f64 {
    if x.abs() < 1e-9 {
        1.0
    } else {
        let px = std::f64::consts::PI * x;
        px.sin() / px
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seno(freq: f32, taxa: u32, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / taxa as f32).sin())
            .collect()
    }

    /// A amplitude depois do transitório.
    fn pico(a: &[f32]) -> f32 {
        a[a.len() / 2..].iter().fold(0.0, |m, v| m.max(v.abs()))
    }

    #[test]
    fn deixa_a_voz_e_corta_o_apito() {
        let mut voz = seno(1000.0, 24_000, 4800);
        passa_baixa(&mut voz, 24_000, 8000.0);
        assert!((pico(&voz) - 1.0).abs() < 0.05, "{}", pico(&voz));
        let mut apito = seno(11_000.0, 24_000, 4800);
        passa_baixa(&mut apito, 24_000, 8000.0);
        // 4ª ordem: a 11 kHz, bem abaixo de um quarto.
        assert!(pico(&apito) < 0.25, "{}", pico(&apito));
        let mut vazio: [f32; 0] = [];
        passa_baixa(&mut vazio, 24_000, 8000.0);
    }

    #[test]
    fn reamostrar_um_seno_mantem_o_seno() {
        let seno = |taxa: u32, n: usize| -> Vec<f32> {
            (0..n)
                .map(|i| (2.0 * std::f32::consts::PI * 1000.0 * i as f32 / taxa as f32).sin() * 0.5)
                .collect()
        };
        let de = seno(22_050, 22_050);
        let para = reamostrar(&de, 22_050, 24_000);
        assert_eq!(para.len(), 24_000);
        let ideal = seno(24_000, 24_000);
        // Longe das pontas (onde falta vizinhança), o erro é pequeno.
        let erro = para[100..23_900]
            .iter()
            .zip(&ideal[100..23_900])
            .map(|(a, b)| (a - b).abs())
            .fold(0.0, f32::max);
        assert!(erro < 0.005, "erro {erro}");
        assert_eq!(reamostrar(&de[..10], 24_000, 24_000), de[..10]);
        assert!(reamostrar(&[], 22_050, 24_000).is_empty());
    }
}
