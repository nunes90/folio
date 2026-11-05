//! O texto em inglês reescrito antes do espeak-ng, onde a pronúncia dele erra.
//!
//! O espeak-ng já lê bem ordinais ("3rd"), horas ("10:30"), porcentagens, "Mr." e "e.g.". Aqui
//! ficam os casos que ele lê errado num livro:
//! - moeda: "$5.50" saía "dollar five point five zero" → "5 dollars and 50 cents";
//! - anos: "1999" saía "nineteen hundred ninety nine" → "nineteen ninety-nine"; "1990s", "1905";
//! - romanos: "Chapter IV" saía "chapter roman four" → "Chapter 4"; "Henry VIII" → "Henry the 8th";
//! - abreviações que ele não conhece ("Nov. 3", "p. 42", "vol.", "fig.", "i.e.");
//! - intervalos com travessão: "1914–1918" perdia o "to".
//!
//! Os números continuam em algarismos sempre que o espeak-ng os lê bem: só os anos e as décadas
//! são escritos por extenso, porque a leitura deles depende de saber que são anos.

use std::sync::LazyLock;

use regex::{Captures, Regex};

/// O texto pronto para o espeak-ng (voz em inglês).
pub fn normalizar_ingles(texto: &str) -> String {
    let t = intervalos(texto);
    let t = moedas(&t);
    let t = abreviacoes(&t);
    let t = romanos(&t);
    let t = decadas(&t);
    anos(&t)
}

pub(super) fn re(padrao: &str) -> Regex {
    Regex::new(padrao).expect("expressão regular válida")
}

/// Troca cada ocorrência de `padrao` pelo que `trocar` devolver; `None` deixa como está. `trocar`
/// recebe também o texto antes e depois da ocorrência (o `regex` não olha em volta).
pub(super) fn substituir(
    texto: &str,
    padrao: &Regex,
    mut trocar: impl FnMut(&Captures, &str, &str) -> Option<String>,
) -> String {
    let mut saida = String::with_capacity(texto.len());
    let mut fim = 0;
    for c in padrao.captures_iter(texto) {
        let m = c.get(0).expect("o grupo 0 sempre existe");
        if let Some(novo) = trocar(&c, &texto[..m.start()], &texto[m.end()..]) {
            saida.push_str(&texto[fim..m.start()]);
            saida.push_str(&novo);
            fim = m.end();
        }
    }
    saida.push_str(&texto[fim..]);
    saida
}

// --- números por extenso (só o que anos e décadas precisam) ---------------------------------

const UNIDADES: [&str; 20] = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
];
const DEZENAS: [&str; 10] = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

/// 0 a 99 por extenso: "ninety-nine".
fn ate_99(n: u32) -> String {
    let n = n as usize;
    match n {
        0..20 => UNIDADES[n].into(),
        _ if n.is_multiple_of(10) => DEZENAS[n / 10].into(),
        _ => format!("{}-{}", DEZENAS[n / 10], UNIDADES[n % 10]),
    }
}

/// Um ano lido como ano: 1999 "nineteen ninety-nine", 1905 "nineteen oh five", 1900 "nineteen
/// hundred", 2024 "twenty twenty-four". Só de 1001 a 1999 e de 2010 a 2099: os anos 2000 a 2009
/// ("two thousand five") o espeak-ng já lê assim.
fn ano_por_extenso(n: u32) -> Option<String> {
    if !(1001..=1999).contains(&n) && !(2010..=2099).contains(&n) {
        return None;
    }
    let (seculo, resto) = (ate_99(n / 100), n % 100);
    Some(match resto {
        0 => format!("{seculo} hundred"),
        1..=9 => format!("{seculo} oh {}", UNIDADES[resto as usize]),
        _ => format!("{seculo} {}", ate_99(resto)),
    })
}

/// O plural de uma dezena: "nineties", "tens".
fn dezena_no_plural(dezena: u32) -> String {
    match DEZENAS[dezena as usize] {
        "" => "tens".into(),
        d => format!("{}ies", d.trim_end_matches('y')),
    }
}

/// O ordinal em algarismos, que o espeak-ng lê bem: 1st, 2nd, 3rd, 8th, 11th, 22nd.
fn ordinal(n: u32) -> String {
    let sufixo = match (n % 10, n % 100) {
        (_, 11..=13) => "th",
        (1, _) => "st",
        (2, _) => "nd",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{n}{sufixo}")
}

// --- as regras --------------------------------------------------------------------------------

/// "1914–1918", "pages 10—20" → "1914 to 1918". O hífen fica: "Listing 1-2" é um nome.
fn intervalos(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| re(r"(\d)\s?[–—]\s?(\d)"));
    RE.replace_all(texto, "$1 to $2").into_owned()
}

/// "$5.50" → "5 dollars and 50 cents"; "£3.5M" → "3.5 million pounds"; "€1" → "1 euro".
fn moedas(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"([$£€])\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(million|billion|trillion|thousand|bn|[MBKmk])\b)?",
        )
    });
    substituir(texto, &RE, |c, _, _| {
        let (moeda, moedas, centavo, centavos) = match &c[1] {
            "$" => ("dollar", "dollars", "cent", "cents"),
            "£" => ("pound", "pounds", "penny", "pence"),
            _ => ("euro", "euros", "cent", "cents"),
        };
        let inteiro = &c[2];
        let decimal = c.get(3).map(|d| d.as_str());
        if let Some(mult) = c.get(4) {
            let mult = match mult.as_str() {
                "M" | "m" => "million",
                "B" | "bn" => "billion",
                "K" | "k" => "thousand",
                outro => outro,
            };
            let numero = decimal.map_or(inteiro.to_string(), |d| format!("{inteiro}.{d}"));
            return Some(format!("{numero} {mult} {moedas}"));
        }
        let n: u64 = inteiro.replace(',', "").parse().ok()?;
        let nome = if n == 1 { moeda } else { moedas };
        Some(match decimal {
            None => format!("{inteiro} {nome}"),
            Some(d) if d.len() == 2 => {
                let cent: u32 = d.parse().ok()?;
                let nome_cent = if cent == 1 { centavo } else { centavos };
                match (n, cent) {
                    (_, 0) => format!("{inteiro} {nome}"),
                    (0, _) => format!("{cent} {nome_cent}"),
                    _ => format!("{inteiro} {nome} and {cent} {nome_cent}"),
                }
            }
            Some(d) => format!("{inteiro}.{d} {moedas}"),
        })
    })
}

/// Abreviações que o espeak-ng lê pela letra ou pela palavra cortada.
fn abreviacoes(texto: &str) -> String {
    // Seguidas de espaço: o ponto delas não é fim de frase.
    static SIMPLES: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"\b(Mrs|Mr|Ms|Dr|Prof|Jr|Sr|vs|cf|vols?|Vols?|figs?|Figs?|ch|Ch|approx|eds?|Eds?)\.(\s)",
        )
    });
    // Só antes de um número (sem ele, "No." e "p." são outra coisa).
    static ANTES_DE_NUMERO: LazyLock<Regex> = LazyLock::new(|| {
        re(r"\b(Nos?|nos?|pp?|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.\s?(\d)")
    });
    static SANTO: LazyLock<Regex> = LazyLock::new(|| re(r"\bSt\.(\s+[A-Z])"));
    static LATIM: LazyLock<Regex> = LazyLock::new(|| re(r"\b(e\.g|i\.e)\.(,?)"));

    let t = SIMPLES.replace_all(texto, |c: &Captures| {
        let palavra = match &c[1] {
            "Mr" => "Mister",
            "Mrs" => "Missus",
            "Ms" => "Miz",
            "Dr" => "Doctor",
            "Prof" => "Professor",
            "Jr" => "Junior",
            "Sr" => "Senior",
            "vs" => "versus",
            "cf" => "compare",
            "vol" => "volume",
            "Vol" => "Volume",
            "vols" => "volumes",
            "Vols" => "Volumes",
            "fig" => "figure",
            "Fig" => "Figure",
            "figs" => "figures",
            "Figs" => "Figures",
            "ch" => "chapter",
            "Ch" => "Chapter",
            "approx" => "approximately",
            "ed" => "edition",
            "Ed" => "Edition",
            "eds" | "Eds" => "editors",
            outra => outra,
        };
        format!("{palavra}{}", &c[2])
    });
    let t = ANTES_DE_NUMERO.replace_all(&t, |c: &Captures| {
        let palavra = match &c[1] {
            "No" => "Number",
            "no" => "number",
            "Nos" => "Numbers",
            "nos" => "numbers",
            "p" => "page",
            "pp" => "pages",
            "Jan" => "January",
            "Feb" => "February",
            "Mar" => "March",
            "Apr" => "April",
            "Jun" => "June",
            "Jul" => "July",
            "Aug" => "August",
            "Sep" | "Sept" => "September",
            "Oct" => "October",
            "Nov" => "November",
            _ => "December",
        };
        format!("{palavra} {}", &c[2])
    });
    let t = SANTO.replace_all(&t, "Saint$1");
    LATIM
        .replace_all(&t, |c: &Captures| {
            let dito = if &c[1] == "e.g" {
                "for example"
            } else {
                "that is"
            };
            format!("{dito}{}", &c[2])
        })
        .into_owned()
}

/// O valor de um numeral romano bem formado ("IV" = 4); `None` se não for ("IIII", "VX", "IC").
pub(super) fn romano(texto: &str) -> Option<u32> {
    let valor = |c| match c {
        'I' => Some(1),
        'V' => Some(5),
        'X' => Some(10),
        'L' => Some(50),
        'C' => Some(100),
        'D' => Some(500),
        'M' => Some(1000),
        _ => None,
    };
    let digitos: Vec<u32> = texto.chars().map(valor).collect::<Option<_>>()?;
    let mut total = 0;
    for (i, &d) in digitos.iter().enumerate() {
        if digitos.get(i + 1).is_some_and(|&p| p > d) {
            total -= d as i64;
        } else {
            total += d as i64;
        }
    }
    let n = u32::try_from(total).ok().filter(|&n| n > 0)?;
    // Só a forma canônica: de volta, tem de dar o mesmo texto.
    (para_romano(n) == texto).then_some(n)
}

fn para_romano(mut n: u32) -> String {
    const TABELA: [(u32, &str); 13] = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ];
    let mut s = String::new();
    for (v, r) in TABELA {
        while n >= v {
            s.push_str(r);
            n -= v;
        }
    }
    s
}

/// "Chapter IV" → "Chapter 4", "World War II" → "World War 2"; "Henry VIII" → "Henry the 8th".
fn romanos(texto: &str) -> String {
    // Depois destas palavras, até "I", "V" e "X" sozinhos são números.
    static DEPOIS_DE_PALAVRA: LazyLock<Regex> = LazyLock::new(|| {
        re(
            r"\b((?i:chapter|part|book|volume|act|scene|appendix|section|canto|psalm|article|phase|stage|war|episode|season|level|round))(\s+)([IVXLCDM]+)\b",
        )
    });
    // Um nome seguido de um romano de 2+ letras (o "I" sozinho seria o pronome): reis e papas.
    static REGNAL: LazyLock<Regex> = LazyLock::new(|| re(r"\b([A-Z][a-z]+)(\s+)([IVX]{2,})\b"));
    let t = substituir(texto, &DEPOIS_DE_PALAVRA, |c, _, _| {
        let n = romano(&c[3])?;
        Some(format!("{}{}{n}", &c[1], &c[2]))
    });
    substituir(&t, &REGNAL, |c, _, _| {
        let n = romano(&c[3])?;
        Some(format!("{}{}the {}", &c[1], &c[2], ordinal(n)))
    })
}

/// "1990s" → "nineteen nineties"; "1900s" → "nineteen hundreds"; "the '60s" → "the sixties".
fn decadas(texto: &str) -> String {
    static COMPLETA: LazyLock<Regex> = LazyLock::new(|| re(r"\b(1\d|20)(\d)0(?:'|’)?s\b"));
    static CURTA: LazyLock<Regex> = LazyLock::new(|| re(r"(?:'|’)?\b([1-9])0(?:'|’)?s\b"));
    let t = substituir(texto, &COMPLETA, |c, antes, _| {
        if antes.ends_with(|ch: char| ch.is_ascii_digit()) {
            return None;
        }
        let seculo: u32 = c[1].parse().ok()?;
        let dezena: u32 = c[2].parse().ok()?;
        Some(match (seculo, dezena) {
            (20, 0) => "two thousands".into(),
            (_, 0) => format!("{} hundreds", ate_99(seculo)),
            _ => format!("{} {}", ate_99(seculo), dezena_no_plural(dezena)),
        })
    });
    substituir(&t, &CURTA, |c, antes, _| {
        if antes.ends_with(|ch: char| ch.is_ascii_digit() || ch == '.' || ch == ',') {
            return None;
        }
        Some(dezena_no_plural(c[1].parse().ok()?))
    })
}

/// Um número de 4 algarismos solto é lido como ano: "in 1999" → "in nineteen ninety-nine".
/// Não quando é parte de outro número (1999.5, 1,999, 10:1999), uma porcentagem ou uma página.
fn anos(texto: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| re(r"\b\d{4}\b"));
    static PALAVRA_ANTES: LazyLock<Regex> = LazyLock::new(|| {
        re(r"(?i)\b(page|pages|number|numbers|line|lines|room|listing|port|no\.|p\.|pp\.)\s*$")
    });
    substituir(texto, &RE, |c, antes, depois| {
        let colado_antes = antes.ends_with(|ch: char| ".,:/-$£€#".contains(ch));
        let colado_depois = depois.starts_with('%')
            || depois.starts_with(" %")
            || ([".", ",", ":", "/"].iter()).any(|p| {
                depois.starts_with(p) && depois[1..].starts_with(|ch: char| ch.is_ascii_digit())
            });
        if colado_antes || colado_depois || PALAVRA_ANTES.is_match(antes) {
            return None;
        }
        ano_por_extenso(c[0].parse().ok()?)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moedas() {
        let n = normalizar_ingles;
        assert_eq!(n("He paid $5.50."), "He paid 5 dollars and 50 cents.");
        assert_eq!(
            n("It was $1, then $1.01"),
            "It was 1 dollar, then 1 dollar and 1 cent"
        );
        assert_eq!(n("only $0.99"), "only 99 cents");
        assert_eq!(n("$1,000 or $20.00"), "1,000 dollars or 20 dollars");
        assert_eq!(
            n("£3.5M and €2bn"),
            "3.5 million pounds and 2 billion euros"
        );
        assert_eq!(n("£2.50"), "2 pounds and 50 pence");
        assert_eq!(n("$5 more"), "5 dollars more");
        assert_eq!(n("€20 off"), "20 euros off");
        assert_eq!(n("$3.141"), "3.141 dollars");
    }

    #[test]
    fn anos_e_decadas() {
        let n = normalizar_ingles;
        assert_eq!(n("In 1999 he left."), "In nineteen ninety-nine he left.");
        assert_eq!(
            n("in 1905, 1900 and 2024"),
            "in nineteen oh five, nineteen hundred and twenty twenty-four"
        );
        assert_eq!(n("in 1066"), "in ten sixty-six");
        assert_eq!(n("in 2005"), "in 2005");
        assert_eq!(n("1914–1918"), "nineteen fourteen to nineteen eighteen");
        assert_eq!(
            n("the 1990s and 1960's"),
            "the nineteen nineties and nineteen sixties"
        );
        assert_eq!(
            n("the 1900s, the 2000s, the 2010s"),
            "the nineteen hundreds, the two thousands, the twenty tens"
        );
        assert_eq!(n("the ’60s and the 80s"), "the sixties and the eighties");
        // Não são anos.
        assert_eq!(n("1,999 people"), "1,999 people");
        assert_eq!(n("1999.5 and 1999%"), "1999.5 and 1999%");
        assert_eq!(n("on page 1234"), "on page 1234");
        assert_eq!(n("p. 1234"), "page 1234");
        assert_eq!(n("12345"), "12345");
        // Preço também: "nineteen ninety-nine dollars" é como se fala.
        assert_eq!(n("$1999"), "nineteen ninety-nine dollars");
        assert_eq!(n("in 1000"), "in 1000");
        assert_eq!(n("port 8080"), "port 8080");
    }

    #[test]
    fn romanos() {
        let n = normalizar_ingles;
        assert_eq!(n("Chapter IV. The End"), "Chapter 4. The End");
        assert_eq!(n("CHAPTER XII"), "CHAPTER 12");
        assert_eq!(n("Part I and Book V"), "Part 1 and Book 5");
        assert_eq!(n("World War II ended."), "World War 2 ended.");
        assert_eq!(
            n("Henry VIII and Louis XIV"),
            "Henry the 8th and Louis the 14th"
        );
        assert_eq!(n("John Paul II"), "John Paul the 2nd");
        // O pronome, e o que não é romano bem formado, ficam.
        assert_eq!(n("Then I went."), "Then I went.");
        assert_eq!(n("Chapter IIII"), "Chapter IIII");
        assert_eq!(n("Remember MIX"), "Remember MIX");
    }

    #[test]
    fn abreviacoes() {
        let n = normalizar_ingles;
        assert_eq!(
            n("Mr. Smith met Dr. Jones"),
            "Mister Smith met Doctor Jones"
        );
        assert_eq!(
            n("On Nov. 3 and Sept. 11"),
            "On November 3 and September 11"
        );
        assert_eq!(
            n("See p. 42 and pp. 10–20"),
            "See page 42 and pages 10 to 20"
        );
        assert_eq!(n("vol. 2, fig. 3, No. 5"), "volume 2, figure 3, Number 5");
        assert_eq!(
            n("tools, e.g., a hammer; i.e. this"),
            "tools, for example, a hammer; that is this"
        );
        assert_eq!(n("St. Paul"), "Saint Paul");
        // Sem número depois, "No." é a palavra; no fim da frase, o ponto fica.
        assert_eq!(n("No. I won't."), "No. I won't.");
        assert_eq!(n("Ask the Dr."), "Ask the Dr.");
    }

    proptest::proptest! {
        // Texto qualquer (inclusive com os símbolos que as regras procuram) não dá panic.
        #[test]
        fn nunca_da_panic(t in "[0-9$£€.,:/%'’–— a-zA-ZIVXé]{0,80}") {
            normalizar_ingles(&t);
        }
    }

    #[test]
    fn texto_comum_nao_muda() {
        let t = "It was the best of times, it was the worst of times; 3rd of 21 at 10:30.";
        assert_eq!(normalizar_ingles(t), t);
        assert_eq!(normalizar_ingles("Listing 1-2"), "Listing 1-2");
    }
}
