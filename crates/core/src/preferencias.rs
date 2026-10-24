//! Preferências de leitura e de aparência (texto, tema, movimento), guardadas na biblioteca.
//!
//! Os valores chegam do frontend, então nada aqui confia neles: `normalizada` corrige
//! valores fora dos limites (ou NaN) em vez de falhar, e campos ausentes ou desconhecidos
//! no JSON salvo voltam ao padrão.

use serde::{Deserialize, Serialize};

/// Fonte do texto do livro. As fontes vêm com o app (licença OFL), não dependem do sistema.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Fonte {
    /// A que o livro define.
    #[default]
    Original,
    /// Literata: serifada, feita para leitura longa em tela.
    Literata,
    /// Atkinson Hyperlegible: para baixa visão.
    Atkinson,
    /// Lexend: pensada para fluência de leitura.
    Lexend,
    /// OpenDyslexic: para dislexia.
    Opendyslexic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Alinhamento {
    /// O que o livro define.
    #[default]
    Original,
    /// Alinhado à esquerda (no início da linha): espaçamento regular entre palavras,
    /// geralmente melhor para dislexia.
    Inicio,
    Justificado,
}

/// Tema de cores da interface e do livro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tema {
    /// Claro ou escuro conforme o sistema; alto contraste se o sistema pedir.
    #[default]
    Sistema,
    Claro,
    Escuro,
    Sepia,
    AltoContraste,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Movimento {
    /// Reduz animações se o sistema pedir (`prefers-reduced-motion`).
    #[default]
    Sistema,
    /// Sempre reduz, mesmo que o sistema não peça.
    Reduzido,
}

/// Animação ao virar a página (igual para EPUB e PDF).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Virada {
    /// A página nova entra deslizando, de leve, na direção da leitura.
    Deslizar,
    /// A página nova gira em 3D a partir da lombada, como uma folha.
    Virar,
    /// Só a opacidade muda: o padrão, porque a virada se repete centenas de vezes e deve
    /// ser quase imperceptível (e é o mais leve para quem é sensível a movimento).
    #[default]
    Esmaecer,
    Nenhuma,
}

/// Como o PDF é exibido.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModoPdf {
    /// Uma página por vez, como o EPUB.
    #[default]
    Paginas,
    /// Todas as páginas numa rolagem contínua.
    Rolagem,
}

/// Cor da página do PDF. O PDF é um desenho (canvas): não dá para trocar as cores do texto
/// como no EPUB, então cada opção é um efeito sobre a página já desenhada (ver
/// `ui/src/lib/paginaPdf.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PaginaPdf {
    /// Como o PDF foi feito.
    #[default]
    Original,
    /// Papel creme: o branco vira creme, o preto continua preto.
    Creme,
    /// Papel sépia, mais amarelado.
    Sepia,
    /// Claro e escuro invertidos, sem trocar as cores.
    Noite,
}

/// Limites (mínimo, máximo) de cada valor numérico.
pub mod limites {
    pub const TAMANHO: (f64, f64) = (0.75, 3.0);
    pub const ENTRELINHA: (f64, f64) = (1.0, 2.5);
    pub const ESPACO_LETRAS: (f64, f64) = (0.0, 0.3);
    pub const ESPACO_PALAVRAS: (f64, f64) = (0.0, 1.0);
    pub const LARGURA: (u32, u32) = (320, 1600);
    pub const COLUNAS: (u8, u8) = (1, 2);
    pub const VELOCIDADE_VOZ: (i8, i8) = (-100, 100);
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
// `default` no struct: campos ausentes no JSON (ex.: salvo por uma versão antiga) usam o padrão.
#[serde(rename_all = "camelCase", default)]
pub struct PreferenciasLeitura {
    pub fonte: Fonte,
    /// Multiplicador do tamanho do texto (soma-se à escala de texto do sistema).
    pub tamanho: f64,
    /// Altura da linha, em múltiplos do tamanho da fonte.
    pub entrelinha: f64,
    /// Espaço extra entre letras, em `em`.
    pub espaco_letras: f64,
    /// Espaço extra entre palavras, em `em`.
    pub espaco_palavras: f64,
    /// Largura máxima de cada coluna de texto, em px (CSS).
    pub largura_maxima: u32,
    /// Máximo de colunas lado a lado quando a janela é larga.
    pub colunas: u8,
    pub alinhamento: Alinhamento,
    pub hifenizacao: bool,
    pub tema: Tema,
    pub movimento: Movimento,
    /// Velocidade da leitura em voz alta, de -100 (mais lenta) a 100; 0 é a normal do sistema.
    pub velocidade_voz: i8,
    pub virada: Virada,
    pub modo_pdf: ModoPdf,
    pub pagina_pdf: PaginaPdf,
}

impl Default for PreferenciasLeitura {
    fn default() -> Self {
        Self {
            fonte: Fonte::Original,
            tamanho: 1.0,
            entrelinha: 1.5,
            espaco_letras: 0.0,
            espaco_palavras: 0.0,
            largura_maxima: 720,
            colunas: 2,
            alinhamento: Alinhamento::Original,
            hifenizacao: false,
            tema: Tema::Sistema,
            movimento: Movimento::Sistema,
            velocidade_voz: 0,
            virada: Virada::Esmaecer,
            modo_pdf: ModoPdf::Paginas,
            pagina_pdf: PaginaPdf::Original,
        }
    }
}

impl PreferenciasLeitura {
    /// Valores fora dos limites são trazidos para dentro; NaN volta ao padrão.
    pub fn normalizada(self) -> Self {
        let padrao = Self::default();
        let limitar = |valor: f64, (min, max): (f64, f64), padrao: f64| {
            if valor.is_nan() {
                padrao
            } else {
                valor.clamp(min, max)
            }
        };
        Self {
            tamanho: limitar(self.tamanho, limites::TAMANHO, padrao.tamanho),
            entrelinha: limitar(self.entrelinha, limites::ENTRELINHA, padrao.entrelinha),
            espaco_letras: limitar(
                self.espaco_letras,
                limites::ESPACO_LETRAS,
                padrao.espaco_letras,
            ),
            espaco_palavras: limitar(
                self.espaco_palavras,
                limites::ESPACO_PALAVRAS,
                padrao.espaco_palavras,
            ),
            largura_maxima: self
                .largura_maxima
                .clamp(limites::LARGURA.0, limites::LARGURA.1),
            colunas: self.colunas.clamp(limites::COLUNAS.0, limites::COLUNAS.1),
            velocidade_voz: self
                .velocidade_voz
                .clamp(limites::VELOCIDADE_VOZ.0, limites::VELOCIDADE_VOZ.1),
            ..self
        }
    }

    /// Lê o JSON salvo. JSON inválido (ex.: de uma versão futura com outra estrutura) vira o
    /// padrão, para que preferências corrompidas nunca impeçam a leitura.
    pub fn de_json(json: &str) -> Self {
        match serde_json::from_str::<Self>(json) {
            Ok(p) => p.normalizada(),
            Err(erro) => {
                tracing::warn!(%erro, "preferências de leitura inválidas; usando o padrão");
                Self::default()
            }
        }
    }

    pub fn para_json(&self) -> String {
        serde_json::to_string(self).expect("serializar structs simples não falha")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn padrao_ja_e_normalizado() {
        let p = PreferenciasLeitura::default();
        assert_eq!(p.clone().normalizada(), p);
    }

    #[test]
    fn normaliza_valores_fora_dos_limites() {
        let p = PreferenciasLeitura {
            tamanho: 10.0,
            entrelinha: 0.1,
            espaco_letras: -1.0,
            espaco_palavras: f64::NAN,
            largura_maxima: 5,
            colunas: 9,
            ..Default::default()
        }
        .normalizada();
        assert_eq!(p.tamanho, limites::TAMANHO.1);
        assert_eq!(p.entrelinha, limites::ENTRELINHA.0);
        assert_eq!(p.espaco_letras, 0.0);
        assert_eq!(p.espaco_palavras, 0.0, "NaN volta ao padrão");
        assert_eq!(p.largura_maxima, limites::LARGURA.0);
        assert_eq!(p.colunas, 2);
    }

    #[test]
    fn json_ida_e_volta() {
        let p = PreferenciasLeitura {
            fonte: Fonte::Opendyslexic,
            alinhamento: Alinhamento::Inicio,
            tamanho: 1.25,
            ..Default::default()
        };
        assert_eq!(PreferenciasLeitura::de_json(&p.para_json()), p);
    }

    #[test]
    fn formato_do_json_e_o_que_o_frontend_espera() {
        let json = PreferenciasLeitura {
            fonte: Fonte::Opendyslexic,
            ..Default::default()
        }
        .para_json();
        assert!(json.contains(r#""fonte":"opendyslexic""#), "{json}");
        assert!(json.contains(r#""espacoLetras":0.0"#), "{json}");
        assert!(json.contains(r#""alinhamento":"original""#), "{json}");
    }

    #[test]
    fn campos_ausentes_usam_o_padrao() {
        let p = PreferenciasLeitura::de_json(r#"{"tamanho": 1.5}"#);
        assert_eq!(p.tamanho, 1.5);
        assert_eq!(p.entrelinha, PreferenciasLeitura::default().entrelinha);
    }

    #[test]
    fn preferencias_salvas_antes_dos_temas_continuam_validas() {
        // JSON como o M4a gravava: sem `tema` nem `movimento`.
        let p = PreferenciasLeitura::de_json(r#"{"fonte":"lexend","tamanho":1.2}"#);
        assert_eq!(p.fonte, Fonte::Lexend);
        assert_eq!(p.tema, Tema::Sistema);
        assert_eq!(p.movimento, Movimento::Sistema);
    }

    #[test]
    fn tema_e_movimento_no_json() {
        let json = PreferenciasLeitura {
            tema: Tema::AltoContraste,
            movimento: Movimento::Reduzido,
            ..Default::default()
        }
        .para_json();
        assert!(json.contains(r#""tema":"alto-contraste""#), "{json}");
        assert!(json.contains(r#""movimento":"reduzido""#), "{json}");
    }

    #[test]
    fn velocidade_da_voz_no_json_e_limitada() {
        let p = PreferenciasLeitura::de_json(r#"{"velocidadeVoz": 30}"#);
        assert_eq!(p.velocidade_voz, 30);
        let p = PreferenciasLeitura {
            velocidade_voz: i8::MIN,
            ..Default::default()
        }
        .normalizada();
        assert_eq!(p.velocidade_voz, -100);
    }

    #[test]
    fn virada_e_modo_do_pdf_tem_padrao_e_vao_no_json() {
        // JSON de versões anteriores (sem os campos) usa os padrões sugeridos.
        let p = PreferenciasLeitura::de_json(r#"{"tamanho": 1.2}"#);
        assert_eq!(p.virada, Virada::Esmaecer);
        assert_eq!(p.modo_pdf, ModoPdf::Paginas);

        let json = PreferenciasLeitura {
            virada: Virada::Virar,
            modo_pdf: ModoPdf::Rolagem,
            ..Default::default()
        }
        .para_json();
        assert!(json.contains(r#""virada":"virar""#), "{json}");
        assert!(json.contains(r#""modoPdf":"rolagem""#), "{json}");
    }

    #[test]
    fn pagina_do_pdf_tem_padrao_original_e_vai_no_json() {
        // Preferências salvas antes do M12 (sem o campo) mantêm o PDF como foi feito.
        let p = PreferenciasLeitura::de_json(r#"{"tamanho": 1.2}"#);
        assert_eq!(p.pagina_pdf, PaginaPdf::Original);

        for (pagina, texto) in [
            (PaginaPdf::Creme, "creme"),
            (PaginaPdf::Sepia, "sepia"),
            (PaginaPdf::Noite, "noite"),
        ] {
            let json = PreferenciasLeitura {
                pagina_pdf: pagina,
                ..Default::default()
            }
            .para_json();
            assert!(
                json.contains(&format!(r#""paginaPdf":"{texto}""#)),
                "{json}"
            );
            assert_eq!(PreferenciasLeitura::de_json(&json).pagina_pdf, pagina);
        }
    }

    #[test]
    fn json_invalido_vira_padrao() {
        assert_eq!(
            PreferenciasLeitura::de_json("{"),
            PreferenciasLeitura::default()
        );
        assert_eq!(
            PreferenciasLeitura::de_json(r#"{"fonte": "comic-sans"}"#),
            PreferenciasLeitura::default()
        );
    }

    #[test]
    fn json_com_valores_extremos_e_normalizado() {
        let p = PreferenciasLeitura::de_json(r#"{"tamanho": 99, "colunas": 0}"#);
        assert_eq!(p.tamanho, limites::TAMANHO.1);
        assert_eq!(p.colunas, 1);
    }
}
