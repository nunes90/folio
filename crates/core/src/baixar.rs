//! Baixar um modelo de voz do catálogo (`catalogo_vozes`).
//!
//! Tudo vai para `<vozes>/<id>.parcial/`; cada arquivo é conferido pelo tamanho e pelo SHA-256
//! enquanto chega. Só no fim a pasta é renomeada para `<vozes>/<id>/`, então um download
//! interrompido (cancelado, sem rede, app fechado) nunca deixa um modelo pela metade: na próxima
//! vez, a pasta parcial é apagada e tudo recomeça.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sha2::{Digest, Sha256};

use crate::catalogo_vozes::{Arquivo, Modelo};

#[derive(Debug, thiserror::Error)]
pub enum ErroBaixar {
    #[error("sem conexão com {url}: {erro}")]
    Rede { url: String, erro: String },
    #[error("{arquivo} chegou diferente do esperado")]
    Conferencia { arquivo: String },
    #[error("{arquivo}: falta {entrada} no pacote")]
    FaltaNoPacote { arquivo: String, entrada: String },
    #[error("download cancelado")]
    Cancelado,
    #[error("falha ao gravar {}", caminho.display())]
    Io {
        caminho: PathBuf,
        #[source]
        fonte: io::Error,
    },
}

/// De onde vêm os bytes. No app, HTTP (`RedeHttp`); nos testes, a memória.
pub trait Rede {
    fn abrir(&self, url: &str) -> Result<Box<dyn Read + Send>, String>;
}

/// HTTPS com os certificados do sistema.
pub struct RedeHttp(ureq::Agent);

impl RedeHttp {
    pub fn nova() -> Self {
        let tls = ureq::tls::TlsConfig::builder()
            .root_certs(ureq::tls::RootCerts::PlatformVerifier)
            .build();
        let config = ureq::Agent::config_builder()
            .tls_config(tls)
            .timeout_connect(Some(Duration::from_secs(20)))
            .timeout_recv_response(Some(Duration::from_secs(30)))
            .user_agent(concat!("Folio/", env!("CARGO_PKG_VERSION")))
            .build();
        Self(config.into())
    }
}

impl Default for RedeHttp {
    fn default() -> Self {
        Self::nova()
    }
}

impl Rede for RedeHttp {
    fn abrir(&self, url: &str) -> Result<Box<dyn Read + Send>, String> {
        let resposta = self.0.get(url).call().map_err(|e| e.to_string())?;
        Ok(Box::new(resposta.into_body().into_reader()))
    }
}

/// Quanto já chegou, de quanto (o tamanho do modelo inteiro).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Progresso {
    pub baixado: u64,
    pub total: u64,
}

/// Baixa e confere todos os arquivos do modelo e o instala em `<vozes>/<id>/`. `progresso` é
/// chamado a cada pedaço que chega; `cancelar` é conferido entre os pedaços. Se já estiver
/// instalado, não faz nada.
pub fn baixar_modelo(
    rede: &dyn Rede,
    modelo: &Modelo,
    vozes: &Path,
    progresso: &mut dyn FnMut(Progresso),
    cancelar: &AtomicBool,
) -> Result<(), ErroBaixar> {
    let destino = modelo.pasta(vozes);
    if destino.is_dir() {
        return Ok(());
    }
    let parcial = vozes.join(format!("{}.parcial", modelo.id));
    let io = |caminho: &Path| {
        let caminho = caminho.to_path_buf();
        move |fonte| ErroBaixar::Io { caminho, fonte }
    };
    if parcial.exists() {
        fs::remove_dir_all(&parcial).map_err(io(&parcial))?;
    }
    fs::create_dir_all(&parcial).map_err(io(&parcial))?;
    let resultado = (|| {
        let mut contagem = Progresso {
            baixado: 0,
            total: modelo.tamanho(),
        };
        for arquivo in modelo.arquivos {
            baixar_arquivo(rede, arquivo, &parcial, &mut contagem, progresso, cancelar)?;
        }
        fs::rename(&parcial, &destino).map_err(io(&destino))
    })();
    if resultado.is_err() {
        let _ = fs::remove_dir_all(&parcial);
    }
    resultado
}

fn baixar_arquivo(
    rede: &dyn Rede,
    arquivo: &Arquivo,
    pasta: &Path,
    contagem: &mut Progresso,
    progresso: &mut dyn FnMut(Progresso),
    cancelar: &AtomicBool,
) -> Result<(), ErroBaixar> {
    let caminho = pasta.join(arquivo.nome);
    let io = |fonte| ErroBaixar::Io {
        caminho: caminho.clone(),
        fonte,
    };
    let rede_falhou = |erro: String| ErroBaixar::Rede {
        url: arquivo.url.to_string(),
        erro,
    };
    let diferente = || ErroBaixar::Conferencia {
        arquivo: arquivo.nome.to_string(),
    };
    if cancelar.load(Ordering::SeqCst) {
        return Err(ErroBaixar::Cancelado);
    }
    let mut origem = rede.abrir(arquivo.url).map_err(rede_falhou)?;
    let mut saida = File::create(&caminho).map_err(io)?;
    let mut hash = Sha256::new();
    let mut recebido = 0u64;
    let mut pedaco = vec![0u8; 64 * 1024];
    loop {
        if cancelar.load(Ordering::SeqCst) {
            return Err(ErroBaixar::Cancelado);
        }
        let n = match origem.read(&mut pedaco) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(rede_falhou(e.to_string())),
        };
        recebido += n as u64;
        // Maior que o esperado: não é o arquivo certo (e não vale a pena continuar).
        if recebido > arquivo.tamanho {
            return Err(diferente());
        }
        hash.update(&pedaco[..n]);
        saida.write_all(&pedaco[..n]).map_err(io)?;
        contagem.baixado += n as u64;
        progresso(*contagem);
    }
    saida.sync_all().map_err(io)?;
    drop(saida);
    if recebido != arquivo.tamanho || hex(&hash.finalize()) != arquivo.sha256 {
        return Err(diferente());
    }
    if !arquivo.extrair.is_empty() {
        extrair(arquivo, &caminho, pasta)?;
        fs::remove_file(&caminho).map_err(io)?;
    }
    Ok(())
}

/// Tira do `.tgz` só as entradas listadas, com os nomes de destino.
fn extrair(arquivo: &Arquivo, pacote: &Path, pasta: &Path) -> Result<(), ErroBaixar> {
    let io = |caminho: &Path| {
        let caminho = caminho.to_path_buf();
        move |fonte| ErroBaixar::Io { caminho, fonte }
    };
    let leitor = flate2::read::GzDecoder::new(File::open(pacote).map_err(io(pacote))?);
    let mut tar = tar::Archive::new(leitor);
    let mut faltam: Vec<_> = arquivo.extrair.to_vec();
    for entrada in tar.entries().map_err(io(pacote))? {
        let mut entrada = entrada.map_err(io(pacote))?;
        let caminho = entrada.path().map_err(io(pacote))?.into_owned();
        let Some(i) = faltam
            .iter()
            .position(|(no_pacote, _)| caminho == Path::new(no_pacote))
        else {
            continue;
        };
        let (_, destino) = faltam.swap_remove(i);
        let destino = pasta.join(destino);
        let mut saida = File::create(&destino).map_err(io(&destino))?;
        io::copy(&mut entrada, &mut saida).map_err(io(&destino))?;
        if faltam.is_empty() {
            break;
        }
    }
    match faltam.first() {
        Some((entrada, _)) => Err(ErroBaixar::FaltaNoPacote {
            arquivo: arquivo.nome.to_string(),
            entrada: entrada.to_string(),
        }),
        None => Ok(()),
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalogo_vozes::{Genero, VozDoCatalogo};
    use std::collections::HashMap;
    use std::sync::Mutex;

    /// Rede na memória: url → bytes; conta os pedidos.
    #[derive(Default)]
    struct RedeFalsa {
        arquivos: HashMap<String, Vec<u8>>,
        pedidos: Mutex<Vec<String>>,
    }

    impl Rede for RedeFalsa {
        fn abrir(&self, url: &str) -> Result<Box<dyn Read + Send>, String> {
            self.pedidos.lock().unwrap().push(url.to_string());
            self.arquivos
                .get(url)
                .map(|b| Box::new(io::Cursor::new(b.clone())) as Box<dyn Read + Send>)
                .ok_or_else(|| "404".to_string())
        }
    }

    fn sha(bytes: &[u8]) -> String {
        hex(&Sha256::digest(bytes))
    }

    fn tgz(entradas: &[(&str, &[u8])]) -> Vec<u8> {
        let mut tar = tar::Builder::new(flate2::write::GzEncoder::new(
            Vec::new(),
            flate2::Compression::fast(),
        ));
        for (nome, conteudo) in entradas {
            let mut cab = tar::Header::new_gnu();
            cab.set_size(conteudo.len() as u64);
            cab.set_mode(0o644);
            cab.set_cksum();
            tar.append_data(&mut cab, nome, *conteudo).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap()
    }

    const VOZES: &[VozDoCatalogo] = &[VozDoCatalogo {
        id: "v",
        nome: "V",
        idioma: "en-US",
        genero: Genero::Feminina,
    }];

    /// Monta um modelo de teste com dois arquivos (um deles um pacote) e a rede que os serve.
    fn cenario() -> (Modelo, RedeFalsa) {
        let a = b"conteudo de a".to_vec();
        let pacote = tgz(&[
            ("p/lib/biblioteca.so", b"binario"),
            ("p/LEIAME", b"ignorado"),
            ("p/LICENSE", b"licenca"),
        ]);
        let arquivos: &'static [Arquivo] = Box::leak(Box::new([
            Arquivo {
                nome: "a.bin",
                url: "https://x/a.bin",
                sha256: Box::leak(sha(&a).into_boxed_str()),
                tamanho: a.len() as u64,
                extrair: &[],
            },
            Arquivo {
                nome: "p.tgz",
                url: "https://x/p.tgz",
                sha256: Box::leak(sha(&pacote).into_boxed_str()),
                tamanho: pacote.len() as u64,
                extrair: &[
                    ("p/lib/biblioteca.so", "lib.so"),
                    ("p/LICENSE", "LICENSE-p"),
                ],
            },
        ]));
        let modelo = Modelo {
            id: "teste",
            nome: "Teste",
            tipo: crate::catalogo_vozes::Tipo::Kokoro,
            licenca: "MIT",
            arquivos,
            vozes: VOZES,
        };
        let mut rede = RedeFalsa::default();
        rede.arquivos.insert("https://x/a.bin".into(), a);
        rede.arquivos.insert("https://x/p.tgz".into(), pacote);
        (modelo, rede)
    }

    fn nomes(pasta: &Path) -> Vec<String> {
        let mut v: Vec<_> = fs::read_dir(pasta)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn baixa_confere_extrai_e_instala() {
        let (modelo, rede) = cenario();
        let dir = tempfile::tempdir().unwrap();
        let mut avisos = Vec::new();
        baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |p| avisos.push(p),
            &AtomicBool::new(false),
        )
        .unwrap();
        assert!(modelo.instalado(dir.path()));
        assert_eq!(nomes(dir.path()), ["teste"]);
        let pasta = modelo.pasta(dir.path());
        assert_eq!(nomes(&pasta), ["LICENSE-p", "a.bin", "lib.so"]);
        assert_eq!(fs::read(pasta.join("lib.so")).unwrap(), b"binario");
        let ultimo = avisos.last().unwrap();
        assert_eq!(ultimo.baixado, modelo.tamanho());
        assert_eq!(ultimo.total, modelo.tamanho());
        assert!(avisos.windows(2).all(|w| w[0].baixado <= w[1].baixado));

        // Já instalado: nada é pedido de novo.
        let antes = rede.pedidos.lock().unwrap().len();
        baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |_| {},
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(rede.pedidos.lock().unwrap().len(), antes);
    }

    #[test]
    fn arquivo_diferente_nao_instala_nada() {
        let (modelo, mut rede) = cenario();
        rede.arquivos
            .insert("https://x/a.bin".into(), b"conteudo de b".to_vec());
        let dir = tempfile::tempdir().unwrap();
        let erro = baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |_| {},
            &AtomicBool::new(false),
        )
        .unwrap_err();
        assert!(matches!(erro, ErroBaixar::Conferencia { arquivo } if arquivo == "a.bin"));
        assert!(nomes(dir.path()).is_empty());
    }

    #[test]
    fn maior_que_o_esperado_para_no_meio() {
        let (modelo, mut rede) = cenario();
        rede.arquivos
            .insert("https://x/a.bin".into(), vec![0; 1_000_000]);
        let dir = tempfile::tempdir().unwrap();
        let mut chegou = 0;
        let erro = baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |p| chegou = p.baixado,
            &AtomicBool::new(false),
        )
        .unwrap_err();
        assert!(matches!(erro, ErroBaixar::Conferencia { .. }));
        assert!(chegou < 100_000);
    }

    #[test]
    fn sem_rede_e_cancelar_limpam_a_pasta_parcial() {
        let (modelo, mut rede) = cenario();
        rede.arquivos.remove("https://x/p.tgz");
        let dir = tempfile::tempdir().unwrap();
        let erro = baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |_| {},
            &AtomicBool::new(false),
        )
        .unwrap_err();
        assert!(matches!(erro, ErroBaixar::Rede { url, .. } if url == "https://x/p.tgz"));
        assert!(nomes(dir.path()).is_empty());

        let (modelo, rede) = cenario();
        let cancelar = AtomicBool::new(false);
        let erro = baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |_| cancelar.store(true, Ordering::SeqCst),
            &cancelar,
        )
        .unwrap_err();
        assert!(matches!(erro, ErroBaixar::Cancelado));
        assert!(nomes(dir.path()).is_empty());
    }

    #[test]
    fn sobra_de_um_download_interrompido_e_apagada() {
        let (modelo, rede) = cenario();
        let dir = tempfile::tempdir().unwrap();
        let parcial = dir.path().join("teste.parcial");
        fs::create_dir_all(&parcial).unwrap();
        fs::write(parcial.join("lixo"), b"x").unwrap();
        baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |_| {},
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(nomes(dir.path()), ["teste"]);
        assert!(!modelo.pasta(dir.path()).join("lixo").exists());
    }

    #[test]
    fn falta_no_pacote() {
        let (mut modelo, mut rede) = cenario();
        let pacote = tgz(&[("p/LICENSE", b"licenca")]);
        let mut arquivos = modelo.arquivos.to_vec();
        arquivos[1].sha256 = Box::leak(sha(&pacote).into_boxed_str());
        arquivos[1].tamanho = pacote.len() as u64;
        modelo.arquivos = Box::leak(arquivos.into_boxed_slice());
        rede.arquivos.insert("https://x/p.tgz".into(), pacote);
        let dir = tempfile::tempdir().unwrap();
        let erro = baixar_modelo(
            &rede,
            &modelo,
            dir.path(),
            &mut |_| {},
            &AtomicBool::new(false),
        )
        .unwrap_err();
        assert!(
            matches!(erro, ErroBaixar::FaltaNoPacote { entrada, .. } if entrada == "p/lib/biblioteca.so")
        );
        assert!(nomes(dir.path()).is_empty());
    }

    /// Baixa o Kokoro de verdade (~152 MB): `FOLIO_BAIXAR=<pasta> cargo test -p folio-core
    /// --release -- --ignored kokoro_baixado_de_verdade`.
    #[test]
    #[ignore]
    fn kokoro_baixado_de_verdade() {
        let Some(pasta) = std::env::var_os("FOLIO_BAIXAR") else {
            return;
        };
        let pasta = PathBuf::from(pasta);
        let mut ultimo = 0;
        baixar_modelo(
            &RedeHttp::nova(),
            &crate::catalogo_vozes::KOKORO,
            &pasta,
            &mut |p| {
                let pct = p.baixado * 100 / p.total;
                if pct != ultimo {
                    ultimo = pct;
                    eprint!("\r{pct}%");
                }
            },
            &AtomicBool::new(false),
        )
        .unwrap();
        assert!(crate::catalogo_vozes::KOKORO.instalado(&pasta));
    }
}
