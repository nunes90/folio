//! Fonemas → números que o modelo entende, pela tabela `tokens.txt`.

use std::collections::HashMap;

use super::ErroKokoro;

/// O modelo aceita até 512 posições, das quais duas são o início e o fim (o token 0).
pub const MAX_TOKENS: usize = 510;

/// A tabela de fonemas do modelo: um símbolo por linha, seguido do número ("ˈ 156"). A linha
/// do espaço começa com o próprio espaço ("  16").
#[derive(Debug, Clone)]
pub struct Vocabulario(HashMap<char, i64>);

impl Vocabulario {
    pub fn ler(texto: &str) -> Result<Self, ErroKokoro> {
        let mut tabela = HashMap::new();
        for linha in texto.lines().filter(|l| !l.is_empty()) {
            let invalida = || ErroKokoro::ArquivoInvalido(format!("tokens.txt: “{linha}”"));
            let (simbolo, numero) = linha.rsplit_once(' ').ok_or_else(invalida)?;
            let mut letras = simbolo.chars();
            let (Some(c), None) = (letras.next(), letras.next()) else {
                return Err(invalida());
            };
            tabela.insert(c, numero.parse().map_err(|_| invalida())?);
        }
        if tabela.is_empty() {
            return Err(ErroKokoro::ArquivoInvalido("tokens.txt vazio".into()));
        }
        Ok(Self(tabela))
    }

    /// Os números dos fonemas, sem o início e o fim. Símbolos que o modelo não conhece são
    /// deixados de fora (como no código original do Kokoro).
    pub fn ids(&self, fonemas: &str) -> Vec<i64> {
        fonemas
            .chars()
            .filter_map(|c| self.0.get(&c).copied())
            .collect()
    }

    fn id(&self, c: char) -> Option<i64> {
        self.0.get(&c).copied()
    }
}

/// Divide os números de uma frase em pedaços de até `max`, para frases mais longas que o
/// modelo aceita. Corta depois da última pontuação que couber; sem ela, no último espaço; sem
/// espaço, no limite.
pub fn dividir(vocabulario: &Vocabulario, ids: &[i64], max: usize) -> Vec<Vec<i64>> {
    let pausas: Vec<i64> = [',', ';', ':', '.', '!', '?', '—', '…']
        .iter()
        .filter_map(|&c| vocabulario.id(c))
        .collect();
    let espaco = vocabulario.id(' ');
    let mut pedacos = Vec::new();
    let mut resto = ids;
    while resto.len() > max {
        let janela = &resto[..max];
        let corte = janela
            .iter()
            .rposition(|id| pausas.contains(id))
            .or_else(|| janela.iter().rposition(|id| Some(*id) == espaco))
            .map_or(max, |i| i + 1);
        pedacos.push(aparar(&resto[..corte], espaco));
        resto = &resto[corte..];
    }
    pedacos.push(aparar(resto, espaco));
    pedacos.retain(|p| !p.is_empty());
    pedacos
}

fn aparar(ids: &[i64], espaco: Option<i64>) -> Vec<i64> {
    let e = |id: &i64| Some(*id) == espaco;
    let inicio = ids.iter().position(|id| !e(id)).unwrap_or(ids.len());
    let fim = ids.iter().rposition(|id| !e(id)).map_or(inicio, |i| i + 1);
    ids[inicio..fim].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TABELA: &str = "; 1\n: 2\n, 3\n. 4\n  16\na 43\nb 44\nˈ 156\n";

    #[test]
    fn le_a_tabela_inclusive_o_espaco() {
        let v = Vocabulario::ler(TABELA).unwrap();
        assert_eq!(v.ids("ˈab, a."), vec![156, 43, 44, 3, 16, 43, 4]);
    }

    #[test]
    fn simbolo_desconhecido_fica_de_fora() {
        let v = Vocabulario::ler(TABELA).unwrap();
        assert_eq!(v.ids("aɮb"), vec![43, 44]);
    }

    #[test]
    fn tabela_invalida_e_recusada() {
        assert!(Vocabulario::ler("").is_err());
        assert!(Vocabulario::ler("ab 3\n").is_err());
        assert!(Vocabulario::ler("a x\n").is_err());
        assert!(Vocabulario::ler("a\n").is_err());
    }

    #[test]
    fn frase_curta_fica_inteira() {
        let v = Vocabulario::ler(TABELA).unwrap();
        let ids = v.ids("ab a");
        assert_eq!(dividir(&v, &ids, 10), vec![ids]);
    }

    #[test]
    fn corta_depois_da_ultima_pontuacao_que_cabe() {
        let v = Vocabulario::ler(TABELA).unwrap();
        // "ab, ab ab. ab" com no máximo 9: corta depois do ponto (posição 9).
        let ids = v.ids("ab, ab ab. ab");
        let pedacos = dividir(&v, &ids, 10);
        assert_eq!(pedacos, vec![v.ids("ab, ab ab."), v.ids("ab")]);
    }

    #[test]
    fn sem_pontuacao_corta_no_espaco_e_sem_espaco_no_limite() {
        let v = Vocabulario::ler(TABELA).unwrap();
        let ids = v.ids("abab abab");
        assert_eq!(dividir(&v, &ids, 6), vec![v.ids("abab"), v.ids("abab")]);
        let ids = v.ids("abababab");
        assert_eq!(
            dividir(&v, &ids, 3),
            vec![v.ids("aba"), v.ids("bab"), v.ids("ab")]
        );
    }

    #[test]
    fn todos_os_pedacos_cabem() {
        let v = Vocabulario::ler(TABELA).unwrap();
        let ids = v.ids(&"ab ab, ".repeat(300));
        let pedacos = dividir(&v, &ids, MAX_TOKENS);
        assert!(pedacos.len() > 1);
        assert!(
            pedacos
                .iter()
                .all(|p| !p.is_empty() && p.len() <= MAX_TOKENS)
        );
    }
}
