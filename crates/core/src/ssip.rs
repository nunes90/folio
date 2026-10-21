//! Cliente mínimo do SSIP, o protocolo do speech-dispatcher (linhas de texto num socket local).
//!
//! Escrito à mão em vez de usar o crate `ssip-client`, que (na 0.10.2) perde marcas de índice,
//! nem sempre trata o tempo limite de leitura como "nada chegou" e descarta linhas já lidas
//! quando o tempo limite cai no meio de uma resposta.
//!
//! Formato das respostas: zero ou mais linhas `NNN-dado` seguidas de uma linha `NNN texto`,
//! onde NNN é o código. Exemplo (evento de marca de índice):
//!
//! ```text
//! 700-171        <- id da mensagem
//! 700-18         <- id do cliente
//! 700-a          <- nome da marca
//! 700 INDEX MARK
//! ```

use std::io::{self, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Resposta {
    pub codigo: u16,
    /// As linhas `NNN-dado`, sem o prefixo.
    pub linhas: Vec<String>,
    /// O texto da linha final (ex.: "OK MESSAGE QUEUED").
    pub texto: String,
}

/// Junta os bytes recebidos e devolve as respostas completas. O que ainda não formou uma
/// resposta inteira fica guardado para a próxima leitura (o socket entrega pedaços).
#[derive(Debug, Default)]
pub(crate) struct Decodificador {
    buffer: Vec<u8>,
    linhas: Vec<String>,
}

impl Decodificador {
    pub fn alimentar(&mut self, bytes: &[u8]) -> Vec<Resposta> {
        self.buffer.extend_from_slice(bytes);
        let mut respostas = Vec::new();
        while let Some(fim) = self.buffer.iter().position(|&b| b == b'\n') {
            let bruta: Vec<u8> = self.buffer.drain(..=fim).collect();
            let linha = String::from_utf8_lossy(&bruta);
            let linha = linha.trim_end_matches(['\r', '\n']);
            // Linhas malformadas são ignoradas em vez de derrubar a conexão.
            let (Some(codigo), Some(resto)) = (linha.get(..3), linha.get(3..)) else {
                continue;
            };
            let Ok(codigo) = codigo.parse::<u16>() else {
                continue;
            };
            if let Some(dado) = resto.strip_prefix('-') {
                self.linhas.push(dado.to_owned());
            } else if let Some(texto) = resto.strip_prefix(' ') {
                respostas.push(Resposta {
                    codigo,
                    linhas: std::mem::take(&mut self.linhas),
                    texto: texto.to_owned(),
                });
            }
        }
        respostas
    }
}

pub(crate) struct Conexao {
    socket: UnixStream,
    decodificador: Decodificador,
}

impl Conexao {
    /// Conecta ao socket do speech-dispatcher. `espera` é o tempo máximo de cada leitura.
    pub fn conectar(espera: Duration) -> io::Result<Self> {
        let socket = UnixStream::connect(caminho_do_socket()?)?;
        socket.set_read_timeout(Some(espera))?;
        Ok(Self {
            socket,
            decodificador: Decodificador::default(),
        })
    }

    pub fn comando(&mut self, linha: &str) -> io::Result<()> {
        self.socket.write_all(format!("{linha}\r\n").as_bytes())
    }

    /// Envia o texto de uma fala. As linhas já devem vir escapadas (ver `voz::linhas_ssip`).
    pub fn dados(&mut self, linhas: &[String]) -> io::Result<()> {
        let mut texto = String::new();
        for linha in linhas {
            texto.push_str(linha);
            texto.push_str("\r\n");
        }
        texto.push_str(".\r\n");
        self.socket.write_all(texto.as_bytes())
    }

    /// Espera até o tempo de leitura e devolve as respostas completas (pode ser nenhuma).
    pub fn receber(&mut self) -> io::Result<Vec<Resposta>> {
        let mut buffer = [0u8; 4096];
        match self.socket.read(&mut buffer) {
            Ok(0) => Err(io::ErrorKind::UnexpectedEof.into()),
            Ok(n) => Ok(self.decodificador.alimentar(&buffer[..n])),
            Err(e)
                if matches!(
                    e.kind(),
                    io::ErrorKind::WouldBlock
                        | io::ErrorKind::TimedOut
                        | io::ErrorKind::Interrupted
                ) =>
            {
                Ok(Vec::new())
            }
            Err(e) => Err(e),
        }
    }
}

/// `SPEECHD_ADDRESS=unix_socket:/caminho` se definida; senão o padrão do speech-dispatcher.
fn caminho_do_socket() -> io::Result<PathBuf> {
    if let Some(caminho) = std::env::var("SPEECHD_ADDRESS")
        .ok()
        .and_then(|e| e.strip_prefix("unix_socket:").map(PathBuf::from))
    {
        return Ok(caminho);
    }
    let runtime = std::env::var_os("XDG_RUNTIME_DIR")
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "XDG_RUNTIME_DIR não definida"))?;
    Ok(PathBuf::from(runtime).join("speech-dispatcher/speechd.sock"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Transcript real do speech-dispatcher 0.12 (falar com uma marca).
    const TRANSCRIPT: &str = "230 OK RECEIVING DATA\r\n225-171\r\n225 OK MESSAGE QUEUED\r\n\
        701-171\r\n701-18\r\n701 BEGIN\r\n700-171\r\n700-18\r\n700-a\r\n700 INDEX MARK\r\n\
        702-171\r\n702-18\r\n702 END\r\n";

    fn esperado() -> Vec<Resposta> {
        let r = |codigo, linhas: &[&str], texto: &str| Resposta {
            codigo,
            linhas: linhas.iter().map(|s| s.to_string()).collect(),
            texto: texto.into(),
        };
        vec![
            r(230, &[], "OK RECEIVING DATA"),
            r(225, &["171"], "OK MESSAGE QUEUED"),
            r(701, &["171", "18"], "BEGIN"),
            r(700, &["171", "18", "a"], "INDEX MARK"),
            r(702, &["171", "18"], "END"),
        ]
    }

    #[test]
    fn decodifica_transcript_inteiro() {
        assert_eq!(
            Decodificador::default().alimentar(TRANSCRIPT.as_bytes()),
            esperado()
        );
    }

    #[test]
    fn decodifica_byte_a_byte_sem_perder_nada() {
        // O socket pode entregar qualquer pedaço; respostas incompletas esperam o resto.
        let mut d = Decodificador::default();
        let respostas: Vec<_> = TRANSCRIPT
            .as_bytes()
            .iter()
            .flat_map(|b| d.alimentar(std::slice::from_ref(b)))
            .collect();
        assert_eq!(respostas, esperado());
    }

    #[test]
    fn linhas_malformadas_sao_ignoradas() {
        let mut d = Decodificador::default();
        let r = d.alimentar("lixo\r\nxy\r\n12\r\nabc OK\r\né!é algo\r\n210 OK\r\n".as_bytes());
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].codigo, 210);
    }

    #[test]
    fn aceita_utf8_nos_dados() {
        let mut d = Decodificador::default();
        let r = d.alimentar("700-1\r\n700-2\r\n700-ação\r\n700 INDEX MARK\r\n".as_bytes());
        assert_eq!(r[0].linhas[2], "ação");
    }
}
