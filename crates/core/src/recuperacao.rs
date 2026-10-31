//! Quando recarregar a página depois de o processo dela cair.
//!
//! O WebKitGTK pode abortar o processo da página (ver `e2e/atspi/rodar.sh`). Recarregar devolve a
//! janela, mas uma queda que se repete ao carregar viraria um ciclo sem fim: depois de
//! [`MAXIMO`] quedas em [`JANELA`], o app desiste.

use std::time::{Duration, Instant};

/// Quantas recargas valem dentro da [`JANELA`].
pub const MAXIMO: usize = 3;
/// O período em que as quedas são contadas.
pub const JANELA: Duration = Duration::from_secs(60);

/// As quedas recentes.
#[derive(Debug, Default)]
pub struct Recuperacoes {
    quedas: Vec<Instant>,
}

impl Recuperacoes {
    /// Registra uma queda em `agora` e diz se ainda vale recarregar.
    pub fn pode_recarregar(&mut self, agora: Instant) -> bool {
        self.quedas
            .retain(|&queda| agora.duration_since(queda) < JANELA);
        self.quedas.push(agora);
        self.quedas.len() <= MAXIMO
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn recarrega_ate_o_maximo_e_desiste_na_queda_seguinte() {
        let inicio = Instant::now();
        let mut r = Recuperacoes::default();
        for i in 0..MAXIMO {
            assert!(r.pode_recarregar(inicio + Duration::from_secs(i as u64)));
        }
        assert!(!r.pode_recarregar(inicio + Duration::from_secs(MAXIMO as u64)));
    }

    #[test]
    fn quedas_antigas_nao_contam() {
        let inicio = Instant::now();
        let mut r = Recuperacoes::default();
        for i in 0..MAXIMO {
            assert!(r.pode_recarregar(inicio + Duration::from_secs(i as u64)));
        }
        assert!(r.pode_recarregar(inicio + JANELA + Duration::from_secs(MAXIMO as u64)));
    }
}
