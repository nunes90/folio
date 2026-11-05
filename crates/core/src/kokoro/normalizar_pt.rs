//! O texto em português (do Brasil) reescrito antes do espeak-ng, onde a pronúncia dele erra.
//!
//! O que o espeak-ng lia errado num livro:
//! - números: "1869" vira "mil oitocentos e sessenta e nove", mas colado numa palavra só nos fonemas,
//!   e o modelo tropeça; por extenso, as palavras vêm separadas. Por isso **todo número solto é escrito
//!   por extenso** aqui (com o ponto de milhar e a vírgula decimal do português);
//! - moeda: "R$ 5,50" saía "real dólar cinco vírgula cinquenta" → "cinco reais e cinquenta centavos";
//! - romanos: "D. Pedro II" saía "quinhentos Pedro dois" → "Dom Pedro Segundo"; "século XIX" →
//!   "século dezenove";
//! - abreviações: "Sra.", "pág.", "nº", "séc."; horas ("10h30" saía "dez agá trinta"); "50%".
//!
//! Os ordinais com º/ª ("1º", "2ª") o espeak-ng já lê bem e ficam.

use std::sync::LazyLock;

use regex::{Captures, Regex};

use super::normalizar::{re, romano, substituir};

/// O texto pronto para o espeak-ng (voz em português).
pub fn normalizar_portugues(texto: &str) -> String {
    let t = intervalos(texto);
    let t = moedas(&t);
    let t = abreviacoes(&t);
    let t = romanos(&t);
    let t = horas(&t);
    let t = porcentagens(&t);
    numeros(&t)
}

// --- números por extenso ----------------------------------------------------------------------

const UNIDADES: [&str; 20] = [
    "zero",
    "um",
    "dois",
    "três",
    "quatro",
    "cinco",
    "seis",
    "sete",
    "oito",
    "nove",
    "dez",
    "onze",
    "doze",
    "treze",
    "catorze",
    "quinze",
    "dezesseis",
    "dezessete",
    "dezoito",
    "dezenove",
];
const DEZENAS: [&str; 10] = [
    "",
    "",
    "vinte",
    "trinta",
    "quarenta",
    "cinquenta",
    "sessenta",
    "setenta",
    "oitenta",
    "noventa",
];
const CENTENAS: [&str; 10] = [
    "",
    "cento",
    "duzentos",
    "trezentos",
    "quatrocentos",
    "quinhentos",
    "seiscentos",
    "setecentos",
    "oitocentos",
    "novecentos",
];

fn unidade(n: u64, feminino: bool) -> &'static str {
    match (n, feminino) {
        (1, true) => "uma",
        (2, true) => "duas",
        _ => UNIDADES[n as usize],
    }
}

fn ate_99(n: u64, feminino: bool) -> String {
    if n < 20 {
        return unidade(n, feminino).into();
    }
    let (d, u) = (n / 10, n % 10);
    if u == 0 {
        DEZENAS[d as usize].into()
    } else {
        format!("{} e {}", DEZENAS[d as usize], unidade(u, feminino))
    }
}

fn ate_999(n: u64, feminino: bool) -> String {
    if n == 100 {
        return "cem".into();
    }
    let (c, resto) = (n / 100, n % 100);
    let centena = match (c, feminino) {
        (0, _) => String::new(),
        (1, _) => "cento".into(),
        (_, true) => CENTENAS[c as usize].replace("os", "as"),
        _ => CENTENAS[c as usize].into(),
    };
    match (centena.is_empty(), resto) {
        (true, _) => ate_99(resto, feminino),
        (false, 0) => centena,
        (false, _) => format!("{centena} e {}", ate_99(resto, feminino)),
    }
}

/// Um número inteiro por extenso, até 999 trilhões: 1869 "mil oitocentos e sessenta e nove", 2024
/// "dois mil e vinte e quatro", 1500 "mil e quinhentos". `feminino`: "duas", "duzentas" (horas,
/// libras). `None` acima do limite.
pub(crate) fn por_extenso(n: u64, feminino: bool) -> Option<String> {
    if n == 0 {
        return Some("zero".into());
    }
    if n >= 1_000_000_000_000_000 {
        return None;
    }
    const ESCALAS: [(u64, &str, &str); 3] = [
        (1_000_000_000_000, "trilhão", "trilhões"),
        (1_000_000_000, "bilhão", "bilhões"),
        (1_000_000, "milhão", "milhões"),
    ];
    let mut partes = Vec::new();
    let mut ultimo = 0;
    let mut resto = n;
    for (valor, singular, plural) in ESCALAS {
        let q = resto / valor;
        if q > 0 {
            // "milhão" é masculino: "dois milhões" mesmo antes de palavra feminina.
            let nome = if q == 1 { singular } else { plural };
            partes.push(format!("{} {nome}", ate_999(q, false)));
            ultimo = q;
            resto %= valor;
        }
    }
    let milhares = resto / 1000;
    if milhares > 0 {
        partes.push(if milhares == 1 {
            "mil".into()
        } else {
            format!("{} mil", ate_999(milhares, feminino))
        });
        ultimo = milhares;
        resto %= 1000;
    }
    if resto > 0 {
        partes.push(ate_999(resto, feminino));
        ultimo = resto;
    }
    // O "e" antes do último grupo só se ele for menor que 100 ou centena redonda: "mil e
    // quinhentos", "dois mil e vinte", mas "mil oitocentos e sessenta".
    let ultima = partes.pop()?;
    if partes.is_empty() {
        return Some(ultima);
    }
    let ligacao = if ultimo < 100 || ultimo % 100 == 0 {
        " e "
    } else {
        " "
    };
    Some(format!("{}{ligacao}{ultima}", partes.join(" ")))
}

/// "1.500" e "1500" → 1500 (o ponto é de milhar).
fn inteiro(texto: &str) -> Option<u64> {
    texto.replace('.', "").parse().ok()
}

/// A parte depois da vírgula, algarismo a algarismo nos zeros à esquerda: "05" → "zero cinco",
/// "14" → "catorze".
fn decimais(texto: &str) -> Option<String> {
    let zeros = texto.chars().take_while(|&c| c == '0').count();
    let mut palavras = vec!["zero".to_string(); zeros];
    let resto = &texto[zeros..];
    if !resto.is_empty() {
        palavras.push(por_extenso(resto.parse().ok()?, false)?);
    }
    Some(palavras.join(" "))
}

const ORDINAIS: [&str; 11] = [
    "", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono",
    "décimo",
];

// --- as regras --------------------------------------------------------------------------------

/// "1914–1918" → "1914 a 1918".
fn intervalos(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| re(r"(\d)\s?[–—]\s?(\d)"));
    RE.replace_all(texto, "$1 a $2").into_owned()
}

/// "R$ 5,50" → "cinco reais e cinquenta centavos"; "R$ 3,5 milhões" → "três vírgula cinco milhões
/// de reais"; "US$ 1" → "um dólar"; "€ 20" → "vinte euros".
fn moedas(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"(R\$|US\$|€|£)\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s?(mil|milhões|milhão|bilhões|bilhão|mi|bi)\b)?",
        )
    });
    substituir(texto, &RE, |c, _, _| {
        let (moeda, moedas, feminino) = match &c[1] {
            "R$" => ("real", "reais", false),
            "US$" => ("dólar", "dólares", false),
            "€" => ("euro", "euros", false),
            _ => ("libra", "libras", true),
        };
        let n = inteiro(&c[2])?;
        let decimal = c.get(3).map(|d| d.as_str());
        if let Some(mult) = c.get(4) {
            let mult = match mult.as_str() {
                "mi" => "milhões",
                "bi" => "bilhões",
                outro => outro,
            };
            let numero = match decimal {
                Some(d) => format!("{} vírgula {}", por_extenso(n, false)?, decimais(d)?),
                None => por_extenso(n, mult == "mil" && feminino)?,
            };
            // "dois mil reais", mas "três milhões de reais".
            let de = if mult == "mil" { "" } else { "de " };
            return Some(format!("{numero} {mult} {de}{moedas}"));
        }
        let nome = if n == 1 { moeda } else { moedas };
        let reais = format!("{} {nome}", por_extenso(n, feminino)?);
        match decimal {
            None => Some(reais),
            Some(d) if d.len() == 2 => {
                let cent: u64 = d.parse().ok()?;
                let nome_cent = if cent == 1 { "centavo" } else { "centavos" };
                let centavos = format!("{} {nome_cent}", por_extenso(cent, false)?);
                Some(match (n, cent) {
                    (_, 0) => reais,
                    (0, _) => centavos,
                    _ => format!("{reais} e {centavos}"),
                })
            }
            Some(d) => Some(format!(
                "{} vírgula {} {moedas}",
                por_extenso(n, false)?,
                decimais(d)?
            )),
        }
    })
}

/// Abreviações que o espeak-ng lê pela letra ou pela palavra cortada.
fn abreviacoes(texto: &str) -> String {
    // Seguidas de espaço: o ponto delas não é fim de frase.
    static SIMPLES: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"\b(Srta|Sras?|Srs?|Dras?|Drs?|Profas?|Profs?|págs?|Págs?|caps?|Cap|vols?|Vol|séc|Séc|Sto|Sta|Av)\.(\s)",
        )
    });
    static NUMERO: LazyLock<Regex> = LazyLock::new(|| re(r"(?:\b[nN]\.?º|\b[nN]o\.)\s?(\d)"));
    static PAGINA: LazyLock<Regex> = LazyLock::new(|| re(r"\bp\.\s?(\d)"));
    // "D." antes de um nome: Dom ou Dona (pela última letra do nome).
    static DOM: LazyLock<Regex> = LazyLock::new(|| re(r"\bD\.\s+(\p{Lu}\p{Ll}*)"));
    static EXEMPLO: LazyLock<Regex> = LazyLock::new(|| re(r"\b(?:p\.\s?ex\.|ex\.:)"));

    let t = SIMPLES.replace_all(texto, |c: &Captures| {
        let palavra = match &c[1] {
            "Sr" => "Senhor",
            "Srs" => "Senhores",
            "Sra" => "Senhora",
            "Sras" => "Senhoras",
            "Srta" => "Senhorita",
            "Dr" => "Doutor",
            "Drs" => "Doutores",
            "Dra" => "Doutora",
            "Dras" => "Doutoras",
            "Prof" => "Professor",
            "Profs" => "Professores",
            "Profa" => "Professora",
            "Profas" => "Professoras",
            "pág" => "página",
            "págs" => "páginas",
            "Pág" => "Página",
            "Págs" => "Páginas",
            "cap" => "capítulo",
            "caps" => "capítulos",
            "Cap" => "Capítulo",
            "vol" => "volume",
            "vols" => "volumes",
            "Vol" => "Volume",
            "séc" => "século",
            "Séc" => "Século",
            "Sto" => "Santo",
            "Sta" => "Santa",
            "Av" => "Avenida",
            outra => outra,
        };
        format!("{palavra}{}", &c[2])
    });
    let t = NUMERO.replace_all(&t, "número $1");
    let t = PAGINA.replace_all(&t, "página $1");
    let t = DOM.replace_all(&t, |c: &Captures| {
        let titulo = if c[1].ends_with('a') { "Dona" } else { "Dom" };
        format!("{titulo} {}", &c[1])
    });
    let t = EXEMPLO.replace_all(&t, |c: &Captures| {
        if c[0].ends_with(':') {
            "por exemplo:".to_string()
        } else {
            "por exemplo".to_string()
        }
    });
    t.into_owned()
}

/// "capítulo IV" → "capítulo quatro", "século XIX" → "século dezenove"; "Pedro II" → "Pedro
/// Segundo", "Luís XIV" → "Luís Catorze" (ordinal até 10, como se fala).
fn romanos(texto: &str) -> String {
    static DEPOIS_DE_PALAVRA: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"\b((?i:capítulo|parte|livro|volume|tomo|ato|cena|canto|seção|secção|título|século|lição|tema))(\s+)([IVXLCDM]+)\b",
        )
    });
    // Um nome seguido de um romano: reis e papas. "I" sozinho vale ("Pedro I"); "V" e "X"
    // sozinhos, não ("a letra X").
    static REGNAL: LazyLock<Regex> = LazyLock::new(|| re(r"\b(\p{Lu}\p{Ll}+)(\s+)(I|[IVX]{2,})\b"));
    let t = substituir(texto, &DEPOIS_DE_PALAVRA, |c, _, _| {
        let n = romano(&c[3])?;
        Some(format!(
            "{}{}{}",
            &c[1],
            &c[2],
            por_extenso(n.into(), false)?
        ))
    });
    substituir(&t, &REGNAL, |c, _, _| {
        let n = romano(&c[3])?;
        let feminino = c[1].ends_with('a');
        let numero = match ORDINAIS.get(n as usize).filter(|o| !o.is_empty()) {
            Some(o) if feminino => format!("{}a", o.trim_end_matches('o')),
            Some(o) => (*o).to_string(),
            None => por_extenso(n.into(), feminino)?,
        };
        let mut letras = numero.chars();
        let maiuscula = letras
            .next()
            .map(|p| p.to_uppercase().chain(letras).collect::<String>())?;
        Some(format!("{}{}{maiuscula}", &c[1], &c[2]))
    })
}

/// "10h30" → "dez horas e trinta"; "1h" → "uma hora".
fn horas(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| re(r"\b(\d{1,2})h(\d{2})?\b"));
    substituir(texto, &RE, |c, _, _| {
        let h: u64 = c[1].parse().ok()?;
        let m: u64 = c.get(2).map_or(Ok(0), |m| m.as_str().parse()).ok()?;
        if h > 24 || m > 59 {
            return None;
        }
        let nome = if h == 1 { "hora" } else { "horas" };
        let horas = format!("{} {nome}", por_extenso(h, true)?);
        Some(if m == 0 {
            horas
        } else {
            format!("{horas} e {}", por_extenso(m, false)?)
        })
    })
}

/// "50%" → "cinquenta por cento"; "2,5%" → "dois vírgula cinco por cento".
fn porcentagens(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| re(r"\b(\d+)(?:,(\d+))?\s?%"));
    substituir(texto, &RE, |c, _, _| {
        let n = por_extenso(c[1].parse().ok()?, false)?;
        Some(match c.get(2) {
            Some(d) => format!("{n} vírgula {} por cento", decimais(d.as_str())?),
            None => format!("{n} por cento"),
        })
    })
}

/// Pontuação colada e, do outro lado dela, outro algarismo: "2.0.1", "10:30", "1/2".
fn colado(mut letras: impl Iterator<Item = char>) -> bool {
    matches!(letras.next(), Some('.' | ':' | ',' | '/' | '-'))
        && letras.next().is_some_and(|d| d.is_ascii_digit())
}

/// Os números soltos por extenso: "1.500" → "mil e quinhentos", "3,14" → "três vírgula catorze".
/// Não quando fazem parte de outra coisa: versões e endereços ("2.0.1", "192.168.0.1"), horas
/// com dois-pontos, ordinais ("1º"), nem colados a letras ("x86", "10h" já foi).
fn numeros(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| re(r"\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\b"));
    substituir(texto, &RE, |c, antes, depois| {
        if colado(antes.chars().rev()) || colado(depois.chars()) {
            return None;
        }
        let n = por_extenso(inteiro(&c[1])?, false)?;
        Some(match c.get(2) {
            Some(d) => format!("{n} vírgula {}", decimais(d.as_str())?),
            None => n,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeros_por_extenso() {
        let e = |n| por_extenso(n, false).unwrap();
        assert_eq!(e(0), "zero");
        assert_eq!(e(1), "um");
        assert_eq!(e(16), "dezesseis");
        assert_eq!(e(21), "vinte e um");
        assert_eq!(e(100), "cem");
        assert_eq!(e(101), "cento e um");
        assert_eq!(e(342), "trezentos e quarenta e dois");
        assert_eq!(e(1000), "mil");
        assert_eq!(e(1500), "mil e quinhentos");
        assert_eq!(e(1869), "mil oitocentos e sessenta e nove");
        assert_eq!(e(2024), "dois mil e vinte e quatro");
        assert_eq!(e(1_000_000), "um milhão");
        assert_eq!(e(2_300_000), "dois milhões e trezentos mil");
        assert_eq!(e(2_350_000), "dois milhões trezentos e cinquenta mil");
        assert_eq!(e(1_001_000), "um milhão e mil");
        assert_eq!(e(3_000_000_007), "três bilhões e sete");
        assert_eq!(por_extenso(2, true).unwrap(), "duas");
        assert_eq!(por_extenso(221, true).unwrap(), "duzentas e vinte e uma");
        assert_eq!(por_extenso(2_000_000, true).unwrap(), "dois milhões");
        assert!(por_extenso(u64::MAX, false).is_none());
    }

    #[test]
    fn moedas() {
        let n = normalizar_portugues;
        assert_eq!(
            n("pagou R$ 5,50."),
            "pagou cinco reais e cinquenta centavos."
        );
        assert_eq!(n("R$ 1 e R$ 1,01"), "um real e um real e um centavo");
        assert_eq!(n("só R$ 0,99"), "só noventa e nove centavos");
        assert_eq!(n("R$ 1.000,00"), "mil reais");
        assert_eq!(n("R$ 3,5 milhões"), "três vírgula cinco milhões de reais");
        assert_eq!(n("R$ 2 mil"), "dois mil reais");
        assert_eq!(n("US$ 20"), "vinte dólares");
        assert_eq!(n("£ 2"), "duas libras");
    }

    #[test]
    fn anos_e_numeros() {
        let n = normalizar_portugues;
        assert_eq!(
            n("Em 1869, ele"),
            "Em mil oitocentos e sessenta e nove, ele"
        );
        assert_eq!(n("1.500 pessoas"), "mil e quinhentos pessoas");
        assert_eq!(n("pi é 3,14"), "pi é três vírgula catorze");
        assert_eq!(n("3,05 m"), "três vírgula zero cinco m");
        assert_eq!(
            n("de 1914–1918"),
            "de mil novecentos e catorze a mil novecentos e dezoito"
        );
        // Ficam: versões, horas com dois-pontos, ordinais, colados a letras.
        assert_eq!(n("versão 2.0.1"), "versão 2.0.1");
        assert_eq!(n("às 10:30"), "às 10:30");
        assert_eq!(n("o 1º lugar e a 2ª vez"), "o 1º lugar e a 2ª vez");
        assert_eq!(n("x86 e mp3"), "x86 e mp3");
    }

    #[test]
    fn romanos() {
        let n = normalizar_portugues;
        assert_eq!(n("Capítulo IV"), "Capítulo quatro");
        assert_eq!(n("no século XIX"), "no século dezenove");
        assert_eq!(n("D. Pedro II"), "Dom Pedro Segundo");
        assert_eq!(n("Pedro I e Luís XIV"), "Pedro Primeiro e Luís Catorze");
        assert_eq!(n("D. Maria I"), "Dona Maria Primeira");
        assert_eq!(n("João Paulo II"), "João Paulo Segundo");
        // "V" e "X" sozinhos ficam.
        assert_eq!(n("a letra X e a Vitamina C"), "a letra X e a Vitamina C");
    }

    #[test]
    fn abreviacoes_horas_porcentagem() {
        let n = normalizar_portugues;
        assert_eq!(
            n("O Sr. Silva e a Sra. Ana"),
            "O Senhor Silva e a Senhora Ana"
        );
        assert_eq!(
            n("Dr. Bacamarte e a Profa. Lúcia"),
            "Doutor Bacamarte e a Professora Lúcia"
        );
        assert_eq!(
            n("ver pág. 42, p. 7 e nº 5"),
            "ver página quarenta e dois, página sete e número cinco"
        );
        assert_eq!(n("o séc. XIX"), "o século dezenove");
        assert_eq!(n("às 10h30 e à 1h"), "às dez horas e trinta e à uma hora");
        assert_eq!(n("às 21h"), "às vinte e uma horas");
        assert_eq!(
            n("50% e 2,5%"),
            "cinquenta por cento e dois vírgula cinco por cento"
        );
        assert_eq!(
            n("frutas, p. ex. maçã; ex.: pera"),
            "frutas, por exemplo maçã; por exemplo: pera"
        );
    }

    #[test]
    fn texto_comum_nao_muda() {
        let t = "Algum tempo hesitei se devia abrir estas memórias pelo princípio ou pelo fim.";
        assert_eq!(normalizar_portugues(t), t);
    }

    proptest::proptest! {
        #[test]
        fn nunca_da_panic(t in "[0-9R$US€£.,:/%h–— a-zA-ZIVXºªéçã]{0,80}") {
            normalizar_portugues(&t);
        }
    }
}
