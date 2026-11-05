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
}
