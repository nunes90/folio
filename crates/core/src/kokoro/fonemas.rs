//! Texto → fonemas IPA, pelo espeak-ng.
//!
//! A biblioteca do espeak-ng (`libespeak-ng.so.1`) é carregada durante a execução, e não ligada
//! na compilação: sem ela, o Folio abre normalmente e só a voz neural fica indisponível (a mesma
//! regra do speech-dispatcher, ADR 0007).
//!
//! O AppImage leva um espeak-ng próprio (compilado na CI só com o que os fonemas usam) em
//! `usr/lib/folio/espeak-ng`, ao lado do executável: ele vem antes do sistema, e assim a voz
//! natural funciona sem instalar nada. Fora do AppImage, vale o do sistema.

use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::ErroKokoro;

/// Quem transforma um trecho de texto (sem pontuação) em fonemas IPA.
pub trait Fonemizador: Send + Sync {
    /// `idioma` é o nome de voz do espeak-ng ("en-us", "en", "pt-br"; ver `idioma_da_voz`).
    fn fonemas(&self, trecho: &str, idioma: &str) -> Result<String, ErroKokoro>;
}

/// Pontuação que o modelo conhece (está no `tokens.txt`) e que marca pausa.
const PAUSAS: [char; 8] = [',', '.', ';', ':', '!', '?', '—', '…'];

/// Fonemas de uma frase, com a pontuação no lugar.
///
/// O espeak-ng descarta a pontuação, mas o modelo precisa dela (pausa na vírgula, entonação de
/// pergunta). A frase é cortada nas pausas, cada pedaço vai ao espeak-ng e a pontuação é
/// devolvida entre eles: "Hello, world." → "həlˈoʊ, wˈɜːld.".
///
/// A pontuação não corta quando vem antes de letra ou número: "3.5" e "1,000" são números, e o
/// espeak-ng os lê inteiros.
pub fn fonemas_com_pontuacao(
    fonemizador: &dyn Fonemizador,
    frase: &str,
    idioma: &str,
) -> Result<String, ErroKokoro> {
    Ok(ajustar(
        &fonemas_pontuados(fonemizador, frase, idioma)?,
        idioma,
    ))
}

/// Os fonemas do espeak-ng com a pontuação no lugar, sem as trocas do Kokoro (`ajustar`): o Piper
/// foi treinado com os símbolos do espeak-ng como eles saem.
pub fn fonemas_pontuados(
    fonemizador: &dyn Fonemizador,
    frase: &str,
    idioma: &str,
) -> Result<String, ErroKokoro> {
    let mut saida = String::new();
    let mut trecho = String::new();
    let mut letras = frase.chars().peekable();
    while let Some(c) = letras.next() {
        let corta = PAUSAS.contains(&c)
            && (matches!(c, '—' | '…') || letras.peek().is_none_or(|p| !p.is_alphanumeric()));
        if !corta {
            trecho.push(c);
            continue;
        }
        acrescentar(&mut saida, fonemizador, &trecho, idioma)?;
        trecho.clear();
        // Sem espaço antes da pontuação, como o modelo foi treinado ("wˈɜːld.").
        saida.truncate(saida.trim_end().len());
        saida.push(c);
        saida.push(' ');
    }
    acrescentar(&mut saida, fonemizador, &trecho, idioma)?;
    Ok(saida.trim().to_string())
}

fn acrescentar(
    saida: &mut String,
    fonemizador: &dyn Fonemizador,
    trecho: &str,
    idioma: &str,
) -> Result<(), ErroKokoro> {
    if trecho.chars().any(char::is_alphanumeric) {
        // O espeak-ng separa as orações com quebras de linha: viram espaço.
        let fonemas = fonemizador.fonemas(trecho, idioma)?;
        for palavra in fonemas.split_whitespace() {
            saida.push_str(palavra);
            saida.push(' ');
        }
    }
    Ok(())
}

/// Troca símbolos que o espeak-ng usa e o Kokoro não aprendeu no inglês (as mesmas trocas do
/// código original do Kokoro).
fn ajustar(fonemas: &str, idioma: &str) -> String {
    if !idioma.starts_with("en") {
        return fonemas.to_string();
    }
    fonemas
        .chars()
        .map(|c| match c {
            'r' => 'ɹ',
            'x' => 'k',
            'ʲ' => 'j',
            'ɬ' => 'l',
            outro => outro,
        })
        .collect()
}

// --- espeak-ng -----------------------------------------------------------------------------

/// `espeak_Initialize(output, buflength, path, options) -> taxa de amostragem ou -1`.
type FnIniciar = unsafe extern "C" fn(c_int, c_int, *const c_char, c_int) -> c_int;
/// `espeak_SetVoiceByName(nome) -> espeak_ERROR` (0 = certo).
type FnVoz = unsafe extern "C" fn(*const c_char) -> c_int;
/// `espeak_TextToPhonemes(&ponteiro, modo_do_texto, modo_dos_fonemas) -> fonemas de uma oração`.
type FnFonemas = unsafe extern "C" fn(*mut *const c_void, c_int, c_int) -> *const c_char;

/// Sem tocar áudio: só queremos os fonemas.
const AUDIO_OUTPUT_SYNCHRONOUS: c_int = 2;
/// Sem isto, o espeak-ng encerra o processo quando não acha os dados.
const ESPEAK_INITIALIZE_DONT_EXIT: c_int = 0x8000;
const ESPEAK_CHARS_UTF8: c_int = 1;
/// Fonemas em IPA (bit 1), e não nos nomes ASCII do espeak-ng.
const FONEMAS_IPA: c_int = 0x02;

/// O espeak-ng da biblioteca do sistema.
///
/// Ele guarda estado global (a voz escolhida, o texto em andamento): há um só `EspeakNg` no
/// processo (`carregar` devolve sempre o mesmo) e as chamadas passam por um `Mutex`. Iniciar o
/// espeak-ng duas vezes ao mesmo tempo derruba o processo.
pub struct EspeakNg {
    funcoes: Mutex<Funcoes>,
    /// Mantém a biblioteca carregada enquanto as funções existirem.
    _biblioteca: libloading::Library,
}

struct Funcoes {
    voz: FnVoz,
    fonemas: FnFonemas,
    /// Idioma escolhido por último (trocar de voz no espeak-ng custa caro).
    idioma: Option<String>,
}

const BIBLIOTECA: &str = "libespeak-ng.so.1";

/// A pasta do espeak-ng que vem com o app, a partir do executável (`<prefixo>/bin/folio` →
/// `<prefixo>/lib/folio/espeak-ng`), se a biblioteca estiver lá. Ela contém também a
/// `espeak-ng-data`.
fn pasta_embutida(executavel: &Path) -> Option<PathBuf> {
    let pasta = executavel.parent()?.parent()?.join("lib/folio/espeak-ng");
    pasta.join(BIBLIOTECA).is_file().then_some(pasta)
}

/// O espeak-ng do processo, depois de carregado.
static ESPEAK: Mutex<Option<Arc<EspeakNg>>> = Mutex::new(None);

impl EspeakNg {
    /// O espeak-ng do processo: na primeira vez, carrega a biblioteca e a inicia. `dados` é a
    /// pasta que contém `espeak-ng-data` (sem ela, a do espeak-ng do app, se houver, ou a do
    /// sistema); só vale na primeira vez.
    pub fn carregar(dados: Option<&Path>) -> Result<Arc<Self>, ErroKokoro> {
        let mut atual = ESPEAK.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(espeak) = atual.as_ref() {
            return Ok(Arc::clone(espeak));
        }
        let espeak = Arc::new(Self::iniciar(dados)?);
        *atual = Some(Arc::clone(&espeak));
        Ok(espeak)
    }

    fn iniciar(dados: Option<&Path>) -> Result<Self, ErroKokoro> {
        let embutida = dados
            .is_none()
            .then(|| std::env::current_exe().ok())
            .flatten()
            .and_then(|exe| pasta_embutida(&exe));
        // SAFETY: carregar a biblioteca roda os construtores dela; a do espeak-ng não tem
        // efeitos além de iniciar variáveis próprias.
        let biblioteca = match &embutida {
            Some(pasta) => unsafe { libloading::Library::new(pasta.join(BIBLIOTECA)) },
            None => unsafe { libloading::Library::new(BIBLIOTECA) }
                .or_else(|_| unsafe { libloading::Library::new("libespeak-ng.so") }),
        }
        .map_err(ErroKokoro::SemEspeak)?;
        let dados = dados.or(embutida.as_deref());
        // SAFETY: as assinaturas são as do `speak_lib.h` do espeak-ng.
        let (iniciar, voz, fonemas) = unsafe {
            (
                *biblioteca
                    .get::<FnIniciar>(b"espeak_Initialize\0")
                    .map_err(ErroKokoro::SemEspeak)?,
                *biblioteca
                    .get::<FnVoz>(b"espeak_SetVoiceByName\0")
                    .map_err(ErroKokoro::SemEspeak)?,
                *biblioteca
                    .get::<FnFonemas>(b"espeak_TextToPhonemes\0")
                    .map_err(ErroKokoro::SemEspeak)?,
            )
        };
        let caminho = dados
            .map(|d| CString::new(d.as_os_str().as_encoded_bytes()))
            .transpose()
            .map_err(|_| ErroKokoro::EspeakNaoIniciou)?;
        let ponteiro = caminho.as_ref().map_or(std::ptr::null(), |c| c.as_ptr());
        // SAFETY: `ponteiro` é nulo ou uma string C válida durante a chamada.
        let taxa = unsafe {
            iniciar(
                AUDIO_OUTPUT_SYNCHRONOUS,
                0,
                ponteiro,
                ESPEAK_INITIALIZE_DONT_EXIT,
            )
        };
        if taxa <= 0 {
            return Err(ErroKokoro::EspeakNaoIniciou);
        }
        tracing::info!(
            pasta = embutida.as_ref().map(|p| p.display().to_string()),
            "espeak-ng carregado ({})",
            if embutida.is_some() {
                "o do app"
            } else {
                "o do sistema"
            }
        );
        Ok(Self {
            funcoes: Mutex::new(Funcoes {
                voz,
                fonemas,
                idioma: None,
            }),
            _biblioteca: biblioteca,
        })
    }
}

impl<F: Fonemizador + ?Sized> Fonemizador for Arc<F> {
    fn fonemas(&self, trecho: &str, idioma: &str) -> Result<String, ErroKokoro> {
        F::fonemas(self, trecho, idioma)
    }
}

impl Fonemizador for EspeakNg {
    fn fonemas(&self, trecho: &str, idioma: &str) -> Result<String, ErroKokoro> {
        let mut f = self.funcoes.lock().unwrap_or_else(|e| e.into_inner());
        if f.idioma.as_deref() != Some(idioma) {
            let nome = CString::new(idioma)
                .map_err(|_| ErroKokoro::IdiomaDesconhecido(idioma.to_string()))?;
            // SAFETY: `nome` é uma string C válida durante a chamada.
            if unsafe { (f.voz)(nome.as_ptr()) } != 0 {
                return Err(ErroKokoro::IdiomaDesconhecido(idioma.to_string()));
            }
            f.idioma = Some(idioma.to_string());
        }
        // Um caractere nulo no meio cortaria o texto: vira espaço.
        let texto = CString::new(trecho.replace('\0', " ")).expect("sem nulos");
        let mut ponteiro = texto.as_ptr() as *const c_void;
        let mut saida = String::new();
        // Cada chamada devolve uma oração e avança o ponteiro; no fim, ele vira nulo.
        while !ponteiro.is_null() {
            // SAFETY: `ponteiro` aponta para dentro de `texto`, que vive até o fim do laço; o
            // resultado é uma string C do espeak-ng, válida até a próxima chamada (copiada já).
            let oracao = unsafe {
                let r = (f.fonemas)(&mut ponteiro, ESPEAK_CHARS_UTF8, FONEMAS_IPA);
                if r.is_null() {
                    break;
                }
                CStr::from_ptr(r).to_string_lossy().into_owned()
            };
            saida.push_str(oracao.trim());
            saida.push(' ');
        }
        Ok(saida.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn espeak_do_app_fica_ao_lado_do_executavel() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("usr/bin/folio");
        assert_eq!(pasta_embutida(&exe), None);
        let pasta = dir.path().join("usr/lib/folio/espeak-ng");
        std::fs::create_dir_all(&pasta).unwrap();
        // Só a pasta não basta: precisa da biblioteca.
        assert_eq!(pasta_embutida(&exe), None);
        std::fs::write(pasta.join(BIBLIOTECA), b"").unwrap();
        assert_eq!(pasta_embutida(&exe), Some(pasta));
        assert_eq!(pasta_embutida(Path::new("folio")), None);
    }

    /// Põe cada trecho entre colchetes, para o teste ver onde a frase foi cortada.
    struct Colchetes;
    impl Fonemizador for Colchetes {
        fn fonemas(&self, trecho: &str, _idioma: &str) -> Result<String, ErroKokoro> {
            Ok(format!("[{}]", trecho.trim()))
        }
    }

    /// Num idioma sem trocas de símbolo (as do inglês mexeriam no texto de volta).
    fn pontuar(frase: &str) -> String {
        fonemas_com_pontuacao(&Colchetes, frase, "teste").unwrap()
    }

    #[test]
    fn devolve_a_pontuacao_entre_os_trechos() {
        assert_eq!(pontuar("Hello, world."), "[Hello], [world].");
        assert_eq!(pontuar("Who? Me!"), "[Who]? [Me]!");
        assert_eq!(pontuar("one; two: three"), "[one]; [two]: [three]");
    }

    #[test]
    fn numeros_com_ponto_e_virgula_nao_sao_cortados() {
        assert_eq!(pontuar("It cost 3.5 or 1,000."), "[It cost 3.5 or 1,000].");
    }

    #[test]
    fn travessao_e_reticencias_cortam_mesmo_colados() {
        assert_eq!(pontuar("Wait—what…"), "[Wait]— [what]…");
    }

    #[test]
    fn pontuacao_sem_texto_nao_chama_o_espeak() {
        assert_eq!(pontuar("…"), "…");
        assert_eq!(pontuar("“Yes,” he said."), "[“Yes], [” he said].");
    }

    #[test]
    fn oracoes_em_linhas_viram_espaco() {
        struct DuasLinhas;
        impl Fonemizador for DuasLinhas {
            fn fonemas(&self, _: &str, _: &str) -> Result<String, ErroKokoro> {
                Ok("ɪn ʃˈɔːɹt\nðə pˈiəɹɪəd\n".into())
            }
        }
        let f = fonemas_com_pontuacao(&DuasLinhas, "In short the period.", "en-us").unwrap();
        assert_eq!(f, "ɪn ʃˈɔːɹt ðə pˈiəɹɪəd.");
    }

    #[test]
    fn ajustes_so_no_ingles() {
        assert_eq!(ajustar("rxʲɬ", "en-us"), "ɹkjl");
        assert_eq!(ajustar("rxʲɬ", "pt-br"), "rxʲɬ");
    }

    proptest! {
        #[test]
        fn qualquer_texto_nao_entra_em_panico(texto in "\\PC*") {
            let _ = pontuar(&texto);
        }
    }

    /// Mostra os fonemas que o modelo recebe (sem a normalização): `FOLIO_FONEMAS_TEXTO=<frase>
    /// [FOLIO_FONEMAS_IDIOMA=pt-br] cargo test -p folio-core -- --ignored fonemas_de_uma_frase
    /// --nocapture`.
    #[test]
    #[ignore = "ferramenta: precisa da libespeak-ng"]
    fn fonemas_de_uma_frase() {
        let texto = std::env::var("FOLIO_FONEMAS_TEXTO").expect("FOLIO_FONEMAS_TEXTO=<frase>");
        let idioma = std::env::var("FOLIO_FONEMAS_IDIOMA").unwrap_or_else(|_| "en-us".into());
        let espeak = EspeakNg::carregar(None).unwrap();
        eprintln!(
            "{}",
            fonemas_com_pontuacao(espeak.as_ref(), &texto, &idioma).unwrap()
        );
    }

    /// Com o espeak-ng do sistema: `cargo test -p folio-core -- --ignored espeak`.
    #[test]
    #[ignore = "precisa da libespeak-ng instalada"]
    fn espeak_de_verdade() {
        let espeak = EspeakNg::carregar(None).unwrap();
        assert!(Arc::ptr_eq(&espeak, &EspeakNg::carregar(None).unwrap()));
        assert_eq!(espeak.fonemas("test", "en-us").unwrap(), "tˈɛst");
        let frase = fonemas_com_pontuacao(espeak.as_ref(), "Hello, world.", "en-us").unwrap();
        assert_eq!(frase, "həlˈoʊ, wˈɜːld.");
        assert!(matches!(
            espeak.fonemas("x", "nao-existe"),
            Err(ErroKokoro::IdiomaDesconhecido(_))
        ));
        // Toda voz que o Kokoro lê tem uma voz do espeak-ng que existe (o "en-gb" não existia
        // com esse nome, e as vozes britânicas não falavam).
        for voz in super::super::VOZES {
            if let Some(idioma) = super::super::idioma_da_voz(voz) {
                assert!(espeak.fonemas("test", idioma).is_ok(), "{voz}: {idioma}");
            }
        }
    }
}
