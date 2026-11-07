//! A voz natural (neural) no app: o estado da voz, o catálogo, o download e a amostra.
//!
//! O download roda numa thread própria (leva minutos) e avisa pelo evento `voz-natural`. A
//! lógica (catálogo, conferência, instalação) fica no core; aqui só se liga ao Tauri.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use folio_core::baixar::{self, ErroBaixar, RedeHttp};
use folio_core::catalogo_vozes::{self, MODELOS, Modelo};
use folio_core::kokoro::EspeakNg;
use folio_core::preferencias::PreferenciasLeitura;
use folio_core::voz::MotorDeVoz;
use folio_core::voz_neural::{ConfigNeural, MotorNeural};
use folio_core::voz_por_idioma::MotorPorIdioma;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Os motores de voz. `motor` escolhe pelo idioma; `neural` é o mesmo motor neural que está
/// dentro dele, para configurar e tocar amostras.
pub struct EstadoVoz {
    pub motor: Option<MotorPorIdioma>,
    pub neural: Arc<MotorNeural>,
    /// `<dados>/vozes`: um modelo por pasta.
    pub vozes: PathBuf,
    /// O download em andamento (a bandeira de cancelar), se houver.
    baixando: Mutex<Option<(&'static str, Arc<AtomicBool>)>>,
}

impl EstadoVoz {
    pub fn novo(motor: Option<MotorPorIdioma>, neural: Arc<MotorNeural>, dados: &Path) -> Self {
        Self {
            motor,
            neural,
            vozes: dados.join("vozes"),
            baixando: Mutex::new(None),
        }
    }

    pub fn motor(&self) -> Result<&dyn MotorDeVoz, String> {
        self.motor
            .as_ref()
            .map(|m| m as &dyn MotorDeVoz)
            .ok_or_else(|| {
                "a leitura em voz alta precisa do speech-dispatcher ou da voz natural".to_string()
            })
    }

    /// Aplica as preferências (voz do inglês, usar em inglês e em português) e o que está
    /// instalado.
    pub fn aplicar(&self, preferencias: &PreferenciasLeitura) {
        let modelo = &catalogo_vozes::KOKORO;
        // A voz de cada idioma: a escolhida (inglês e português) ou a primeira do catálogo.
        let vozes: Vec<(String, String)> = modelo
            .idiomas()
            .into_iter()
            .filter_map(|base| {
                let escolhida = match base.as_str() {
                    "en" => modelo.voz(&preferencias.voz_natural),
                    "pt" => modelo.voz(&preferencias.voz_natural_portugues),
                    _ => None,
                };
                let voz = escolhida.or_else(|| modelo.voz_do_idioma(&base))?;
                Some((base, voz.id.to_string()))
            })
            .collect();
        let ligados: Vec<String> = [
            ("en", preferencias.voz_natural_em_ingles),
            ("pt", preferencias.voz_natural_em_portugues),
        ]
        .into_iter()
        .filter(|&(_, ligado)| ligado)
        .map(|(base, _)| base.to_string())
        .collect();
        let instalada = modelo.instalado(&self.vozes);
        tracing::info!(?vozes, instalada, ?ligados, "voz natural");
        self.neural.configurar(instalada.then(|| ConfigNeural {
            pasta: modelo.pasta(&self.vozes),
            vozes,
        }));
        if let Some(motor) = &self.motor {
            motor.usar_neural_em(ligados);
        }
    }
}

/// Lê as preferências gravadas e as aplica (depois de baixar ou remover um modelo).
fn reaplicar(app: &AppHandle) {
    let preferencias = app
        .state::<crate::comandos::EstadoBiblioteca>()
        .lock()
        .unwrap()
        .preferencias_leitura()
        .unwrap_or_default();
    app.state::<EstadoVoz>().aplicar(&preferencias);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeloNoCatalogo {
    #[serde(flatten)]
    modelo: &'static Modelo,
    tamanho: u64,
    instalado: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VozesNaturais {
    modelos: Vec<ModeloNoCatalogo>,
    /// O modelo sendo baixado agora.
    baixando: Option<&'static str>,
    /// O espeak-ng (pronúncia) está instalado no sistema? Sem ele, a voz natural não fala.
    espeak: bool,
}

#[tauri::command]
pub fn vozes_naturais(voz: State<'_, EstadoVoz>) -> VozesNaturais {
    VozesNaturais {
        modelos: MODELOS
            .iter()
            .map(|m| ModeloNoCatalogo {
                modelo: m,
                tamanho: m.tamanho(),
                instalado: m.instalado(&voz.vozes),
            })
            .collect(),
        baixando: voz.baixando.lock().unwrap().as_ref().map(|(id, _)| *id),
        espeak: EspeakNg::carregar(None)
            .inspect_err(|erro| tracing::warn!(%erro, "espeak-ng indisponível"))
            .is_ok(),
    }
}

/// O que o evento `voz-natural` avisa sobre o download.
#[derive(Clone, Serialize)]
#[serde(tag = "tipo", rename_all = "kebab-case")]
enum AvisoDownload {
    Progresso {
        modelo: &'static str,
        baixado: u64,
        total: u64,
    },
    Concluido {
        modelo: &'static str,
    },
    Cancelado {
        modelo: &'static str,
    },
    Falhou {
        modelo: &'static str,
        erro: String,
    },
}

/// Começa a baixar o modelo numa thread; o andamento chega pelo evento `voz-natural`.
#[tauri::command]
pub fn baixar_voz_natural(
    app: AppHandle,
    voz: State<'_, EstadoVoz>,
    modelo: String,
) -> Result<(), String> {
    let modelo = catalogo_vozes::modelo(&modelo).ok_or("modelo desconhecido")?;
    let cancelar = {
        let mut baixando = voz.baixando.lock().unwrap();
        if baixando.is_some() {
            return Err("já há uma voz sendo baixada".into());
        }
        let cancelar = Arc::new(AtomicBool::new(false));
        *baixando = Some((modelo.id, Arc::clone(&cancelar)));
        cancelar
    };
    let vozes = voz.vozes.clone();
    std::thread::Builder::new()
        .name("baixar-voz".into())
        .spawn(move || {
            tracing::info!(modelo = modelo.id, "baixando a voz natural");
            let emitir = |aviso| {
                if let Err(erro) = app.emit("voz-natural", aviso) {
                    tracing::warn!(%erro, "falha ao enviar o andamento do download");
                }
            };
            let mut ultimo = Instant::now();
            let resultado = std::fs::create_dir_all(&vozes)
                .map_err(|fonte| ErroBaixar::Io {
                    caminho: vozes.clone(),
                    fonte,
                })
                .and_then(|()| {
                    baixar::baixar_modelo(
                        &RedeHttp::nova(),
                        modelo,
                        &vozes,
                        // No máximo ~6 avisos por segundo: chegam pedaços de 64 KB.
                        &mut |p| {
                            if ultimo.elapsed() >= Duration::from_millis(150) {
                                ultimo = Instant::now();
                                emitir(AvisoDownload::Progresso {
                                    modelo: modelo.id,
                                    baixado: p.baixado,
                                    total: p.total,
                                });
                            }
                        },
                        &cancelar,
                    )
                });
            *app.state::<EstadoVoz>().baixando.lock().unwrap() = None;
            let id = modelo.id;
            match resultado {
                Ok(()) => {
                    tracing::info!(modelo = id, "voz natural instalada");
                    reaplicar(&app);
                    emitir(AvisoDownload::Concluido { modelo: id });
                }
                Err(ErroBaixar::Cancelado) => {
                    tracing::info!(modelo = id, "download da voz cancelado");
                    emitir(AvisoDownload::Cancelado { modelo: id });
                }
                Err(erro) => {
                    tracing::warn!(
                        erro = &erro as &dyn std::error::Error,
                        modelo = id,
                        "falha ao baixar a voz natural"
                    );
                    emitir(AvisoDownload::Falhou {
                        modelo: id,
                        erro: erro.to_string(),
                    });
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cancelar_download_voz(voz: State<'_, EstadoVoz>) {
    if let Some((_, cancelar)) = voz.baixando.lock().unwrap().as_ref() {
        cancelar.store(true, Ordering::SeqCst);
    }
}

/// Apaga o modelo baixado. A voz natural para e some até baixar de novo.
#[tauri::command]
pub fn remover_voz_natural(
    app: AppHandle,
    voz: State<'_, EstadoVoz>,
    modelo: String,
) -> Result<(), String> {
    let modelo = catalogo_vozes::modelo(&modelo).ok_or("modelo desconhecido")?;
    let _ = voz.neural.parar();
    voz.neural.configurar(None);
    let resultado = modelo.remover(&voz.vozes).map_err(|e| {
        tracing::warn!(erro = %e, modelo = modelo.id, "falha ao remover a voz natural");
        e.to_string()
    });
    reaplicar(&app);
    resultado
}

/// Uma frase com a voz `voz`, para ouvir antes de escolher. Responde quando o áudio começa,
/// com a duração em milissegundos (`async`: na primeira vez o modelo carrega, ~1 s, e a janela
/// não pode congelar).
#[tauri::command(async)]
pub fn ouvir_amostra_voz(voz: State<'_, EstadoVoz>, id: String) -> Result<u64, String> {
    let (_, escolhida) = catalogo_vozes::voz(&id).ok_or("voz desconhecida")?;
    let texto = match escolhida.idioma {
        "en-GB" => "Hello. This is how I sound when I read your books aloud.",
        "pt-BR" => "Olá. É assim que eu leio os seus livros em voz alta.",
        _ => "Hi. This is how I sound when I read your books aloud.",
    };
    voz.neural
        .amostra(texto, escolhida.id)
        .map(|d| d.as_millis() as u64)
        .map_err(|e| {
            tracing::warn!(erro = %e, "falha ao tocar a amostra");
            e.to_string()
        })
}
