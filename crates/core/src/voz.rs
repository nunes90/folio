//! Leitura em voz alta por um "motor de voz" trocável.
//!
//! Hoje há um motor: o speech-dispatcher do sistema, pelo protocolo SSIP (texto num socket
//! local, sem biblioteca em C). Um motor neural local poderia entrar depois (ver "Futuro" no
//! ROADMAP) implementando o mesmo trait.
//!
//! O frontend manda um bloco de texto por vez (um parágrafo) em SSML, com um `<mark>` antes
//! de cada frase, do jeito que o `tts.js` do foliate-js produz. O motor avisa quando cada marca
//! é alcançada (para destacar a frase) e quando o bloco termina (para pedir o próximo).
//!
//! Organização: `Estado` é uma máquina de estados pura (testada aqui embaixo, sem socket);
//! `SpeechDispatcher` só executa as ações dela numa conexão real.

use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::ssip::{self, Conexao};

/// O que o motor avisa a quem o usa.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "tipo", content = "marca", rename_all = "kebab-case")]
pub enum EventoVoz {
    /// A fala chegou a uma `<mark name="...">` do SSML.
    Marca(String),
    /// O bloco terminou normalmente.
    Fim,
    /// A fala foi interrompida (parar, ou a conexão com o sistema de voz caiu).
    Interrompido,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct ConfigVoz {
    /// Idioma do texto (ex.: "pt-BR"), para o sistema escolher a voz.
    pub idioma: Option<String>,
    /// Velocidade de -100 (mais lenta) a 100 (mais rápida); 0 é a normal.
    pub velocidade: i8,
}

#[derive(Debug, thiserror::Error)]
pub enum ErroVoz {
    #[error("o sistema de voz (speech-dispatcher) não está disponível")]
    Indisponivel(#[source] std::io::Error),
    #[error("o motor de voz foi encerrado")]
    Encerrado,
}

/// Um motor de voz. `&self` em todos os métodos: os comandos vão por um canal para a thread
/// do motor, então ele pode ser usado de várias threads sem `Mutex`.
pub trait MotorDeVoz: Send + Sync {
    /// Fala um bloco SSML. Se outro bloco estiver sendo falado, ele é interrompido antes.
    fn falar(&self, ssml: String, config: ConfigVoz) -> Result<(), ErroVoz>;
    fn pausar(&self) -> Result<(), ErroVoz>;
    fn retomar(&self) -> Result<(), ErroVoz>;
    fn parar(&self) -> Result<(), ErroVoz>;
}

// --- máquina de estados pura ---------------------------------------------------------------

/// Pedidos ao servidor de voz (independentes do protocolo concreto).
#[derive(Debug, Clone, PartialEq, Eq)]
enum Pedido {
    Idioma(String),
    Velocidade(i8),
    /// Anuncia que um texto vem a seguir; o servidor responde "pode mandar".
    Falar,
    /// As linhas do texto (já escapadas para o protocolo).
    Dados(Vec<String>),
    Cancelar,
    Pausar,
    Retomar,
}

/// Respostas e eventos do servidor que importam. `String` é o id da mensagem falada.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Resposta {
    PodeMandar,
    Inicio(String),
    Marca(String, String),
    Fim(String),
    /// O servidor recusou um comando (código 4xx ou 5xx).
    Recusado,
    /// Qualquer outra (confirmações de configuração, cancelamento, pausa...).
    Outra,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Acao {
    Enviar(Pedido),
    Emitir(EventoVoz),
}

#[derive(Debug, Default)]
struct Estado {
    /// Há um bloco nosso em andamento (enviado e ainda não terminado).
    falando: bool,
    /// SSML esperando o "pode mandar" do servidor.
    pendente: Option<String>,
    /// Parar chegou antes do "pode mandar": o texto ainda precisa ser enviado (o servidor
    /// espera por ele) e cancelado logo em seguida.
    cancelar_apos_envio: bool,
    /// Id da mensagem em andamento, conhecido a partir do evento de início.
    atual: Option<String>,
    /// Id de uma mensagem cancelada: eventos atrasados dela são ignorados.
    ignorar: Option<String>,
}

impl Estado {
    fn falar(&mut self, ssml: String, config: ConfigVoz) -> Vec<Acao> {
        let mut acoes = Vec::new();
        if self.pendente.is_some() {
            // O servidor ainda nem pediu o texto anterior: basta trocá-lo.
            self.pendente = Some(ssml);
            self.cancelar_apos_envio = false;
            return acoes;
        }
        if self.falando {
            acoes.push(Acao::Enviar(Pedido::Cancelar));
            self.ignorar = self.atual.take();
        }
        if let Some(idioma) = config.idioma {
            acoes.push(Acao::Enviar(Pedido::Idioma(idioma)));
        }
        acoes.push(Acao::Enviar(Pedido::Velocidade(
            config.velocidade.clamp(-100, 100),
        )));
        acoes.push(Acao::Enviar(Pedido::Falar));
        self.pendente = Some(ssml);
        self.falando = true;
        acoes
    }

    fn parar(&mut self) -> Vec<Acao> {
        if !self.falando {
            return Vec::new();
        }
        self.falando = false;
        if self.pendente.is_some() {
            self.cancelar_apos_envio = true;
        } else {
            self.ignorar = self.atual.take();
            return vec![
                Acao::Enviar(Pedido::Cancelar),
                Acao::Emitir(EventoVoz::Interrompido),
            ];
        }
        vec![Acao::Emitir(EventoVoz::Interrompido)]
    }

    fn pausar(&mut self) -> Vec<Acao> {
        self.se_falando(Pedido::Pausar)
    }

    fn retomar(&mut self) -> Vec<Acao> {
        self.se_falando(Pedido::Retomar)
    }

    fn se_falando(&self, pedido: Pedido) -> Vec<Acao> {
        if self.falando && self.pendente.is_none() {
            vec![Acao::Enviar(pedido)]
        } else {
            Vec::new()
        }
    }

    fn resposta(&mut self, resposta: Resposta) -> Vec<Acao> {
        let antiga = |id: &str| self.ignorar.as_deref() == Some(id);
        match resposta {
            Resposta::PodeMandar => {
                let Some(ssml) = self.pendente.take() else {
                    return Vec::new();
                };
                let mut acoes = vec![Acao::Enviar(Pedido::Dados(linhas_ssip(&ssml)))];
                if std::mem::take(&mut self.cancelar_apos_envio) {
                    acoes.push(Acao::Enviar(Pedido::Cancelar));
                }
                acoes
            }
            Resposta::Inicio(id) if !antiga(&id) && self.falando => {
                self.atual = Some(id);
                Vec::new()
            }
            Resposta::Marca(id, nome) if !antiga(&id) && self.falando => {
                vec![Acao::Emitir(EventoVoz::Marca(nome))]
            }
            Resposta::Fim(id) if !antiga(&id) && self.falando && self.pendente.is_none() => {
                self.falando = false;
                self.atual = None;
                vec![Acao::Emitir(EventoVoz::Fim)]
            }
            Resposta::Fim(id) if antiga(&id) => {
                self.ignorar = None;
                Vec::new()
            }
            // A fala foi recusada no lugar do "pode mandar" (ex.: idioma ou SSML inválido):
            // sem isto o motor ficaria "falando" para sempre.
            Resposta::Recusado if self.pendente.is_some() => {
                self.pendente = None;
                self.cancelar_apos_envio = false;
                if std::mem::take(&mut self.falando) {
                    vec![Acao::Emitir(EventoVoz::Interrompido)]
                } else {
                    Vec::new()
                }
            }
            _ => Vec::new(),
        }
    }
}

/// Divide o texto em linhas para o SSIP. O fim do texto é uma linha com só um ponto, então
/// toda linha que começa com ponto ganha outro na frente (o servidor remove o extra).
fn linhas_ssip(texto: &str) -> Vec<String> {
    texto
        .lines()
        .map(|linha| {
            let linha = linha.trim_end_matches('\r');
            if linha.starts_with('.') {
                format!(".{linha}")
            } else {
                linha.to_owned()
            }
        })
        .collect()
}

// --- adaptador SSIP (speech-dispatcher) ----------------------------------------------------

enum Comando {
    Falar(String, ConfigVoz),
    Pausar,
    Retomar,
    Parar,
}

/// Motor que fala pelo speech-dispatcher do sistema.
pub struct SpeechDispatcher {
    comandos: mpsc::Sender<Comando>,
}

/// Quanto a thread espera por uma resposta antes de olhar se chegaram comandos.
const ESPERA_LEITURA: Duration = Duration::from_millis(50);

impl SpeechDispatcher {
    /// Conecta ao speech-dispatcher. Falha (sem derrubar nada) se ele não estiver instalado
    /// ou rodando. `ao_evento` é chamado na thread do motor.
    pub fn conectar(ao_evento: impl Fn(EventoVoz) + Send + 'static) -> Result<Self, ErroVoz> {
        let mut conexao = Conexao::conectar(ESPERA_LEITURA).map_err(ErroVoz::Indisponivel)?;
        // As confirmações destes comandos chegam pelo laço e são ignoradas lá.
        for comando in [
            "SET self CLIENT_NAME folio:folio:leitura",
            "SET self NOTIFICATION all on",
            "SET self SSML_MODE on",
        ] {
            conexao.comando(comando).map_err(ErroVoz::Indisponivel)?;
        }

        let (comandos, recebidos) = mpsc::channel();
        thread::Builder::new()
            .name("motor-de-voz".into())
            .spawn(move || laco(conexao, recebidos, ao_evento))
            .map_err(ErroVoz::Indisponivel)?;
        tracing::info!("motor de voz conectado ao speech-dispatcher");
        Ok(Self { comandos })
    }

    fn enviar(&self, comando: Comando) -> Result<(), ErroVoz> {
        self.comandos.send(comando).map_err(|_| ErroVoz::Encerrado)
    }
}

impl MotorDeVoz for SpeechDispatcher {
    fn falar(&self, ssml: String, config: ConfigVoz) -> Result<(), ErroVoz> {
        self.enviar(Comando::Falar(ssml, config))
    }
    fn pausar(&self) -> Result<(), ErroVoz> {
        self.enviar(Comando::Pausar)
    }
    fn retomar(&self) -> Result<(), ErroVoz> {
        self.enviar(Comando::Retomar)
    }
    fn parar(&self) -> Result<(), ErroVoz> {
        self.enviar(Comando::Parar)
    }
}

/// Uma só thread lê e escreve na conexão: respostas aos comandos e eventos da fala chegam
/// misturados pelo mesmo socket.
fn laco(mut conexao: Conexao, comandos: mpsc::Receiver<Comando>, ao_evento: impl Fn(EventoVoz)) {
    let mut estado = Estado::default();
    let resultado = (|| -> std::io::Result<()> {
        loop {
            loop {
                let acoes = match comandos.try_recv() {
                    Ok(Comando::Falar(ssml, config)) => estado.falar(ssml, config),
                    Ok(Comando::Pausar) => estado.pausar(),
                    Ok(Comando::Retomar) => estado.retomar(),
                    Ok(Comando::Parar) => estado.parar(),
                    Err(mpsc::TryRecvError::Empty) => break,
                    // O dono do motor o descartou: encerra a conexão e a thread.
                    Err(mpsc::TryRecvError::Disconnected) => {
                        let _ = conexao.comando("QUIT");
                        return Ok(());
                    }
                };
                executar(&mut conexao, acoes, &ao_evento)?;
            }
            for resposta in conexao.receber()? {
                let acoes = estado.resposta(traduzir(resposta));
                executar(&mut conexao, acoes, &ao_evento)?;
            }
        }
    })();
    if let Err(erro) = resultado {
        tracing::warn!(%erro, "conexão com o speech-dispatcher perdida");
        ao_evento(EventoVoz::Interrompido);
    }
}

fn executar(
    conexao: &mut Conexao,
    acoes: Vec<Acao>,
    ao_evento: &impl Fn(EventoVoz),
) -> std::io::Result<()> {
    for acao in acoes {
        match acao {
            Acao::Emitir(evento) => ao_evento(evento),
            Acao::Enviar(Pedido::Dados(linhas)) => conexao.dados(&linhas)?,
            Acao::Enviar(pedido) => conexao.comando(&match pedido {
                Pedido::Idioma(idioma) => format!("SET self LANGUAGE {idioma}"),
                Pedido::Velocidade(v) => format!("SET self RATE {v}"),
                Pedido::Falar => "SPEAK".into(),
                // `self` = só as mensagens deste programa: o Orca e outros não são afetados.
                Pedido::Cancelar => "CANCEL self".into(),
                Pedido::Pausar => "PAUSE self".into(),
                Pedido::Retomar => "RESUME self".into(),
                Pedido::Dados(_) => unreachable!("tratado acima"),
            })?,
        }
    }
    Ok(())
}

fn traduzir(resposta: ssip::Resposta) -> Resposta {
    let id = || resposta.linhas.first().cloned().unwrap_or_default();
    match resposta.codigo {
        230 => Resposta::PodeMandar,
        701 => Resposta::Inicio(id()),
        700 => match resposta.linhas.get(2) {
            Some(nome) => Resposta::Marca(id(), nome.clone()),
            None => Resposta::Outra,
        },
        702 => Resposta::Fim(id()),
        400..=599 => {
            tracing::warn!(codigo = resposta.codigo, texto = %resposta.texto, "speech-dispatcher recusou um comando");
            Resposta::Recusado
        }
        _ => Resposta::Outra,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> ConfigVoz {
        ConfigVoz {
            idioma: Some("pt-BR".into()),
            velocidade: 10,
        }
    }

    fn enviado(acoes: &[Acao], pedido: &Pedido) -> bool {
        acoes.contains(&Acao::Enviar(pedido.clone()))
    }

    /// Fala um bloco até o servidor começar a mensagem `id`.
    fn falando(estado: &mut Estado, ssml: &str, id: &str) {
        estado.falar(ssml.into(), config());
        estado.resposta(Resposta::PodeMandar);
        estado.resposta(Resposta::Inicio(id.into()));
    }

    #[test]
    fn fluxo_normal_de_um_bloco() {
        let mut e = Estado::default();
        let acoes = e.falar("<speak>Oi.</speak>".into(), config());
        assert_eq!(
            acoes,
            [
                Acao::Enviar(Pedido::Idioma("pt-BR".into())),
                Acao::Enviar(Pedido::Velocidade(10)),
                Acao::Enviar(Pedido::Falar),
            ]
        );
        assert_eq!(
            e.resposta(Resposta::PodeMandar),
            [Acao::Enviar(Pedido::Dados(vec![
                "<speak>Oi.</speak>".into()
            ]))]
        );
        assert!(e.resposta(Resposta::Inicio("7".into())).is_empty());
        assert_eq!(
            e.resposta(Resposta::Marca("7".into(), "0".into())),
            [Acao::Emitir(EventoVoz::Marca("0".into()))]
        );
        assert_eq!(
            e.resposta(Resposta::Fim("7".into())),
            [Acao::Emitir(EventoVoz::Fim)]
        );
        // Terminado: pausar não faz nada.
        assert!(e.pausar().is_empty());
    }

    #[test]
    fn falar_durante_outra_fala_cancela_e_ignora_eventos_atrasados() {
        let mut e = Estado::default();
        falando(&mut e, "a", "1");
        let acoes = e.falar("b".into(), config());
        assert_eq!(acoes.first(), Some(&Acao::Enviar(Pedido::Cancelar)));
        assert!(enviado(&acoes, &Pedido::Falar));

        // O fim atrasado da mensagem cancelada não encerra a nova.
        assert!(
            e.resposta(Resposta::Marca("1".into(), "x".into()))
                .is_empty()
        );
        assert!(e.resposta(Resposta::Fim("1".into())).is_empty());
        e.resposta(Resposta::PodeMandar);
        e.resposta(Resposta::Inicio("2".into()));
        assert_eq!(
            e.resposta(Resposta::Fim("2".into())),
            [Acao::Emitir(EventoVoz::Fim)]
        );
    }

    #[test]
    fn parar_cancela_e_avisa() {
        let mut e = Estado::default();
        falando(&mut e, "a", "1");
        assert_eq!(
            e.parar(),
            [
                Acao::Enviar(Pedido::Cancelar),
                Acao::Emitir(EventoVoz::Interrompido)
            ]
        );
        assert!(e.resposta(Resposta::Fim("1".into())).is_empty());
        assert!(e.parar().is_empty(), "parar de novo não faz nada");
    }

    #[test]
    fn parar_antes_do_pode_mandar_envia_e_cancela_em_seguida() {
        // O servidor já espera o texto: mandar Cancelar no lugar dele seria lido como texto.
        let mut e = Estado::default();
        e.falar("a".into(), config());
        assert_eq!(e.parar(), [Acao::Emitir(EventoVoz::Interrompido)]);
        assert_eq!(
            e.resposta(Resposta::PodeMandar),
            [
                Acao::Enviar(Pedido::Dados(vec!["a".into()])),
                Acao::Enviar(Pedido::Cancelar)
            ]
        );
        // Eventos dessa mensagem cancelada não viram marcas nem fim.
        assert!(e.resposta(Resposta::Inicio("1".into())).is_empty());
        assert!(
            e.resposta(Resposta::Marca("1".into(), "0".into()))
                .is_empty()
        );
        assert!(e.resposta(Resposta::Fim("1".into())).is_empty());
    }

    #[test]
    fn falar_de_novo_antes_do_pode_mandar_troca_o_texto() {
        let mut e = Estado::default();
        e.falar("a".into(), config());
        assert!(e.falar("b".into(), config()).is_empty());
        assert_eq!(
            e.resposta(Resposta::PodeMandar),
            [Acao::Enviar(Pedido::Dados(vec!["b".into()]))]
        );
    }

    #[test]
    fn pausar_e_retomar_so_com_fala_em_andamento() {
        let mut e = Estado::default();
        assert!(e.pausar().is_empty());
        e.falar("a".into(), config());
        assert!(e.pausar().is_empty(), "ainda esperando o pode mandar");
        e.resposta(Resposta::PodeMandar);
        assert_eq!(e.pausar(), [Acao::Enviar(Pedido::Pausar)]);
        assert_eq!(e.retomar(), [Acao::Enviar(Pedido::Retomar)]);
    }

    #[test]
    fn sem_idioma_nao_envia_idioma_e_velocidade_e_limitada() {
        let mut e = Estado::default();
        let acoes = e.falar(
            "a".into(),
            ConfigVoz {
                idioma: None,
                velocidade: -128,
            },
        );
        assert_eq!(
            acoes,
            [
                Acao::Enviar(Pedido::Velocidade(-100)),
                Acao::Enviar(Pedido::Falar)
            ]
        );
    }

    #[test]
    fn fala_recusada_nao_trava_o_motor() {
        let mut e = Estado::default();
        e.falar("a".into(), config());
        assert_eq!(
            e.resposta(Resposta::Recusado),
            [Acao::Emitir(EventoVoz::Interrompido)]
        );
        // Livre de novo: uma nova fala segue o fluxo normal.
        assert!(enviado(&e.falar("b".into(), config()), &Pedido::Falar));
    }

    #[test]
    fn recusa_sem_fala_pendente_e_ignorada() {
        let mut e = Estado::default();
        falando(&mut e, "a", "1");
        // Ex.: um SET de velocidade recusado no meio da fala.
        assert!(e.resposta(Resposta::Recusado).is_empty());
        assert_eq!(
            e.resposta(Resposta::Fim("1".into())),
            [Acao::Emitir(EventoVoz::Fim)]
        );
    }

    #[test]
    fn linhas_que_comecam_com_ponto_sao_escapadas() {
        assert_eq!(
            linhas_ssip("<speak>\n...e então\n.\r\nfim</speak>"),
            ["<speak>", "....e então", "..", "fim</speak>"]
        );
    }

    #[test]
    fn evento_serializa_como_o_frontend_espera() {
        let json = |e| serde_json::to_string(&e).unwrap();
        assert_eq!(
            json(EventoVoz::Marca("3".into())),
            r#"{"tipo":"marca","marca":"3"}"#
        );
        assert_eq!(json(EventoVoz::Fim), r#"{"tipo":"fim"}"#);
    }

    /// Teste com o speech-dispatcher de verdade (fala em voz alta!). Não roda na CI:
    /// `cargo test -p folio-core -- --ignored fala_de_verdade`
    #[test]
    #[ignore]
    fn fala_de_verdade() {
        let (tx, rx) = mpsc::channel();
        let motor = SpeechDispatcher::conectar(move |e| tx.send(e).unwrap()).unwrap();
        // Cada frase dentro de <s>: o espeak-ng só emite todas as marcas assim.
        let ssml = r#"<speak><s><mark name="0"/>Primeira frase.</s><s><mark name="1"/>Segunda frase.</s></speak>"#;
        motor.falar(ssml.into(), config()).unwrap();
        let mut eventos = Vec::new();
        while let Ok(e) = rx.recv_timeout(Duration::from_secs(10)) {
            let fim = e == EventoVoz::Fim;
            eventos.push(e);
            if fim {
                break;
            }
        }
        assert_eq!(
            eventos,
            [
                EventoVoz::Marca("0".into()),
                EventoVoz::Marca("1".into()),
                EventoVoz::Fim
            ]
        );
    }
}
