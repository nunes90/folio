//! Escolha do motor de voz pelo idioma do texto.
//!
//! A voz neural (Kokoro) fala os idiomas ligados (inglês e português); o resto continua no
//! speech-dispatcher. A escolha é feita a
//! cada bloco, pelo `idioma` que o frontend manda (o `xml:lang` do EPUB). Quando o motor muda, o
//! anterior é parado, e os eventos dele são descartados: só passam os do motor em uso (senão um
//! `Interrompido` atrasado do antigo pararia a leitura no frontend).

use std::sync::{Arc, Mutex};

use crate::voz::{ConfigVoz, ErroVoz, EventoVoz, MotorDeVoz};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Qual {
    Sistema,
    Neural,
}

/// A base de uma etiqueta de idioma, em minúsculas: "pt-BR" → "pt", "EN_us" → "en".
pub fn idioma_base(idioma: &str) -> String {
    idioma
        .split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Qual motor fala um texto no `idioma`. Os idiomas em `neurais` (bases: "en", "pt") vão à voz
/// neural; o resto, ao sistema. Sem idioma, ao sistema (ou à neural, se só ela existir). `None`:
/// nenhum motor fala esse idioma.
pub(crate) fn escolher(
    idioma: Option<&str>,
    tem_sistema: bool,
    neurais: &[String],
) -> Option<Qual> {
    let na_neural = idioma.is_some_and(|i| neurais.contains(&idioma_base(i)));
    if na_neural || (idioma.is_none() && !tem_sistema && !neurais.is_empty()) {
        Some(Qual::Neural)
    } else if tem_sistema {
        Some(Qual::Sistema)
    } else {
        None
    }
}

/// O que cada motor recebe para avisar o que acontece (já filtrado pelo motor em uso).
pub type AoEvento = Box<dyn Fn(EventoVoz) + Send + Sync>;

pub struct MotorPorIdioma {
    sistema: Option<Box<dyn MotorDeVoz>>,
    neural: Option<Box<dyn MotorDeVoz>>,
    /// Os idiomas (bases) em que a voz natural fala: as preferências "usar em livros em …".
    neural_em: Mutex<Vec<String>>,
    ativo: Arc<Mutex<Option<Qual>>>,
}

impl MotorPorIdioma {
    /// Cria os motores (cada um pode faltar) e liga os eventos deles a `ao_evento`. `None` se
    /// não houver nenhum.
    pub fn novo(
        ao_evento: impl Fn(EventoVoz) + Send + Sync + 'static,
        sistema: impl FnOnce(AoEvento) -> Option<Box<dyn MotorDeVoz>>,
        neural: impl FnOnce(AoEvento) -> Option<Box<dyn MotorDeVoz>>,
    ) -> Option<Self> {
        let ao_evento = Arc::new(ao_evento);
        let ativo = Arc::new(Mutex::new(None));
        let filtro = |qual: Qual| -> AoEvento {
            let ao_evento = Arc::clone(&ao_evento);
            let ativo = Arc::clone(&ativo);
            Box::new(move |evento| {
                if *ativo.lock().unwrap_or_else(|e| e.into_inner()) == Some(qual) {
                    ao_evento(evento);
                }
            })
        };
        let sistema = sistema(filtro(Qual::Sistema));
        let neural = neural(filtro(Qual::Neural));
        (sistema.is_some() || neural.is_some()).then_some(Self {
            sistema,
            neural,
            neural_em: Mutex::new(vec!["en".into()]),
            ativo,
        })
    }

    /// Os idiomas (bases: "en", "pt") em que a voz neural fala; vazio = desligada. Vale a partir
    /// do bloco seguinte.
    pub fn usar_neural_em(&self, idiomas: Vec<String>) {
        *self.neural_em.lock().unwrap_or_else(|e| e.into_inner()) = idiomas;
    }

    /// Os idiomas da voz neural agora (nenhum, se ela não estiver disponível).
    fn neurais(&self) -> Vec<String> {
        if self.neural.as_ref().is_some_and(|n| n.disponivel()) {
            self.neural_em
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
        } else {
            Vec::new()
        }
    }

    fn motor(&self, qual: Qual) -> Option<&dyn MotorDeVoz> {
        match qual {
            Qual::Sistema => self.sistema.as_deref(),
            Qual::Neural => self.neural.as_deref(),
        }
    }

    fn ativo(&self) -> Option<&dyn MotorDeVoz> {
        let qual = *self.ativo.lock().unwrap_or_else(|e| e.into_inner());
        qual.and_then(|q| self.motor(q))
    }
}

impl MotorDeVoz for MotorPorIdioma {
    fn falar(&self, ssml: String, config: ConfigVoz) -> Result<(), ErroVoz> {
        let idioma = config.idioma.as_deref();
        let qual = escolher(idioma, self.sistema.is_some(), &self.neurais())
            .ok_or_else(|| ErroVoz::SemVozParaIdioma(idioma.unwrap_or("?").to_string()))?;
        let anterior = self
            .ativo
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .replace(qual);
        if anterior != Some(qual) {
            tracing::info!(motor = ?qual, idioma, "motor de voz");
        }
        if let Some(antigo) = anterior.filter(|a| *a != qual).and_then(|a| self.motor(a)) {
            // O `Interrompido` dele já não passa pelo filtro.
            let _ = antigo.parar();
        }
        self.motor(qual)
            .ok_or(ErroVoz::Encerrado)?
            .falar(ssml, config)
    }

    fn pausar(&self) -> Result<(), ErroVoz> {
        self.ativo().map_or(Ok(()), |m| m.pausar())
    }

    fn retomar(&self) -> Result<(), ErroVoz> {
        self.ativo().map_or(Ok(()), |m| m.retomar())
    }

    fn parar(&self) -> Result<(), ErroVoz> {
        self.ativo().map_or(Ok(()), |m| m.parar())
    }

    fn disponivel(&self) -> bool {
        self.sistema.is_some() || !self.neurais().is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idiomas_ligados_vao_a_voz_neural() {
        let en = ["en".to_string()];
        let en_pt = ["en".to_string(), "pt".to_string()];
        assert_eq!(escolher(Some("en"), true, &en), Some(Qual::Neural));
        assert_eq!(escolher(Some("en-GB"), true, &en), Some(Qual::Neural));
        assert_eq!(escolher(Some("EN_us"), true, &en), Some(Qual::Neural));
        assert_eq!(escolher(Some("en"), true, &[]), Some(Qual::Sistema));
        assert_eq!(escolher(Some("eng"), true, &en), Some(Qual::Sistema));
        assert_eq!(escolher(Some("pt-BR"), true, &en_pt), Some(Qual::Neural));
        assert_eq!(escolher(Some("pt"), true, &en_pt), Some(Qual::Neural));
        assert_eq!(idioma_base("pt-BR"), "pt");
    }

    #[test]
    fn outros_idiomas_e_sem_idioma() {
        let en = ["en".to_string()];
        assert_eq!(escolher(Some("pt-BR"), true, &en), Some(Qual::Sistema));
        assert_eq!(escolher(Some("pt-BR"), false, &en), None);
        assert_eq!(escolher(None, true, &en), Some(Qual::Sistema));
        assert_eq!(escolher(None, false, &en), Some(Qual::Neural));
        assert_eq!(escolher(None, false, &[]), None);
    }

    /// Guarda o que recebeu e, ao parar, avisa `Interrompido` (como os motores de verdade).
    struct Falso {
        nome: &'static str,
        registro: Arc<Mutex<Vec<String>>>,
        ao_evento: AoEvento,
    }
    impl MotorDeVoz for Falso {
        fn falar(&self, ssml: String, _: ConfigVoz) -> Result<(), ErroVoz> {
            self.registro
                .lock()
                .unwrap()
                .push(format!("{} falar {ssml}", self.nome));
            (self.ao_evento)(EventoVoz::Marca(format!("{} {ssml}", self.nome)));
            Ok(())
        }
        fn pausar(&self) -> Result<(), ErroVoz> {
            self.registro
                .lock()
                .unwrap()
                .push(format!("{} pausar", self.nome));
            Ok(())
        }
        fn retomar(&self) -> Result<(), ErroVoz> {
            Ok(())
        }
        fn parar(&self) -> Result<(), ErroVoz> {
            self.registro
                .lock()
                .unwrap()
                .push(format!("{} parar", self.nome));
            (self.ao_evento)(EventoVoz::Interrompido);
            Ok(())
        }
    }

    type Registro = Arc<Mutex<Vec<String>>>;
    type Eventos = Arc<Mutex<Vec<EventoVoz>>>;

    fn montar() -> (MotorPorIdioma, Registro, Eventos) {
        let registro = Arc::new(Mutex::new(Vec::new()));
        let eventos = Arc::new(Mutex::new(Vec::new()));
        let (r1, r2, ev) = (registro.clone(), registro.clone(), eventos.clone());
        let motor = MotorPorIdioma::novo(
            move |e| ev.lock().unwrap().push(e),
            |ao_evento| {
                Some(Box::new(Falso {
                    nome: "sistema",
                    registro: r1,
                    ao_evento,
                }))
            },
            |ao_evento| {
                Some(Box::new(Falso {
                    nome: "neural",
                    registro: r2,
                    ao_evento,
                }))
            },
        )
        .unwrap();
        (motor, registro, eventos)
    }

    fn config(idioma: &str) -> ConfigVoz {
        ConfigVoz {
            idioma: Some(idioma.into()),
            velocidade: 0,
        }
    }

    #[test]
    fn trocar_de_motor_para_o_anterior_sem_avisar_o_frontend() {
        let (m, registro, eventos) = montar();
        m.falar("a".into(), config("en")).unwrap();
        m.falar("b".into(), config("pt-BR")).unwrap();
        m.pausar().unwrap();
        assert_eq!(
            *registro.lock().unwrap(),
            [
                "neural falar a",
                "neural parar",
                "sistema falar b",
                "sistema pausar"
            ]
        );
        // O `Interrompido` do neural, parado na troca, não chega.
        assert_eq!(
            *eventos.lock().unwrap(),
            [
                EventoVoz::Marca("neural a".into()),
                EventoVoz::Marca("sistema b".into())
            ]
        );
    }

    #[test]
    fn parar_vai_ao_motor_em_uso_e_avisa() {
        let (m, registro, eventos) = montar();
        m.parar().unwrap();
        assert!(registro.lock().unwrap().is_empty());
        m.falar("a".into(), config("en-US")).unwrap();
        m.parar().unwrap();
        assert_eq!(
            *registro.lock().unwrap(),
            ["neural falar a", "neural parar"]
        );
        assert_eq!(
            eventos.lock().unwrap().last(),
            Some(&EventoVoz::Interrompido)
        );
    }

    #[test]
    fn neural_desligada_ou_sem_modelo_vai_ao_sistema() {
        let (m, registro, _) = montar();
        m.usar_neural_em(Vec::new());
        m.falar("a".into(), config("en")).unwrap();
        m.usar_neural_em(vec!["en".into()]);
        m.falar("b".into(), config("en")).unwrap();
        assert_eq!(
            *registro.lock().unwrap(),
            ["sistema falar a", "sistema parar", "neural falar b"]
        );
    }

    #[test]
    fn sem_motores_nao_ha_voz_e_idioma_sem_motor_e_erro() {
        assert!(MotorPorIdioma::novo(|_| {}, |_| None, |_| None).is_none());
        let so_neural = MotorPorIdioma::novo(
            |_| {},
            |_| None,
            |ao_evento| {
                Some(Box::new(Falso {
                    nome: "neural",
                    registro: Arc::default(),
                    ao_evento,
                }))
            },
        )
        .unwrap();
        assert!(matches!(
            so_neural.falar("x".into(), config("pt-BR")),
            Err(ErroVoz::SemVozParaIdioma(i)) if i == "pt-BR"
        ));
    }
}
