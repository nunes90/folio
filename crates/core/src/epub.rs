//! Metadados de EPUB: título, autores, idioma, identificador e capa.
//!
//! Caminho até eles: `META-INF/container.xml` aponta o pacote (OPF); o OPF tem os
//! metadados Dublin Core (`dc:title`, `dc:creator`...) e o manifesto com os arquivos.

use std::borrow::Cow;
use std::io::{Cursor, Read};

use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::{BytesRef, BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use zip::ZipArchive;

const CONTAINER: &str = "META-INF/container.xml";
/// Limites de leitura: protegem contra "zip bombs" (arquivos que descompactam para gigabytes).
const LIMITE_XML: u64 = 4 * 1024 * 1024;
const LIMITE_CAPA: u64 = 20 * 1024 * 1024;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Metadados {
    pub titulo: Option<String>,
    pub autores: Vec<String>,
    pub idioma: Option<String>,
    pub identificador: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Capa {
    pub tipo_midia: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug)]
pub struct Epub {
    pub metadados: Metadados,
    pub capa: Option<Capa>,
}

#[derive(Debug, thiserror::Error)]
pub enum ErroEpub {
    #[error("o arquivo não é um ZIP válido")]
    Zip(#[from] zip::result::ZipError),
    #[error("{0} não encontrado no EPUB")]
    Ausente(String),
    #[error("XML inválido em {arquivo}")]
    Xml {
        arquivo: String,
        #[source]
        fonte: quick_xml::Error,
    },
    #[error("{0} passa do limite de tamanho")]
    Grande(String),
    #[error("{0} não está em UTF-8")]
    Codificacao(String),
    #[error("erro ao descompactar")]
    Io(#[from] std::io::Error),
}

/// Lê os metadados e a capa. Uma capa declarada mas ausente não é erro: vira `None`.
pub fn ler(bytes: &[u8]) -> Result<Epub, ErroEpub> {
    let mut zip = ZipArchive::new(Cursor::new(bytes))?;

    let container = ler_texto(&mut zip, CONTAINER)?;
    let caminho_opf = caminho_do_opf(&container)
        .map_err(|fonte| erro_xml(CONTAINER, fonte))?
        .ok_or_else(|| ErroEpub::Ausente(format!("rootfile em {CONTAINER}")))?;

    let opf = ler_texto(&mut zip, &caminho_opf)?;
    let pacote = Pacote::analisar(&opf).map_err(|fonte| erro_xml(&caminho_opf, fonte))?;

    let capa = pacote.capa().and_then(|item| {
        let caminho = resolver(&caminho_opf, &item.href);
        match ler_bytes(&mut zip, &caminho, LIMITE_CAPA) {
            Ok(bytes) => Some(Capa {
                tipo_midia: item.tipo_midia.clone(),
                bytes,
            }),
            Err(erro) => {
                tracing::warn!(%caminho, %erro, "capa declarada mas ilegível");
                None
            }
        }
    });

    Ok(Epub {
        metadados: pacote.metadados,
        capa,
    })
}

fn erro_xml(arquivo: &str, fonte: quick_xml::Error) -> ErroEpub {
    ErroEpub::Xml {
        arquivo: arquivo.to_owned(),
        fonte,
    }
}

fn ler_bytes<R: Read + std::io::Seek>(
    zip: &mut ZipArchive<R>,
    nome: &str,
    limite: u64,
) -> Result<Vec<u8>, ErroEpub> {
    let arquivo = zip.by_name(nome).map_err(|erro| match erro {
        zip::result::ZipError::FileNotFound => ErroEpub::Ausente(nome.to_owned()),
        outro => ErroEpub::Zip(outro),
    })?;
    let mut bytes = Vec::new();
    // Lê até limite + 1: se conseguir ler o byte extra, o arquivo passou do limite.
    arquivo.take(limite + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limite {
        return Err(ErroEpub::Grande(nome.to_owned()));
    }
    Ok(bytes)
}

fn ler_texto<R: Read + std::io::Seek>(
    zip: &mut ZipArchive<R>,
    nome: &str,
) -> Result<String, ErroEpub> {
    let bytes = ler_bytes(zip, nome, LIMITE_XML)?;
    String::from_utf8(bytes).map_err(|_| ErroEpub::Codificacao(nome.to_owned()))
}

/// Valor de um atributo, já com entidades (`&amp;`...) resolvidas.
fn atributo(elemento: &BytesStart, nome: &str) -> Option<String> {
    let attr = elemento.try_get_attribute(nome).ok()??;
    attr.normalized_value(XmlVersion::Implicit1_0)
        .ok()
        .map(Cow::into_owned)
}

/// Texto de uma referência (`&amp;`, `&#233;`); referências desconhecidas são descartadas.
fn texto_da_referencia(referencia: &BytesRef) -> Option<String> {
    if let Ok(Some(c)) = referencia.resolve_char_ref() {
        return Some(c.to_string());
    }
    resolve_predefined_entity(&referencia.xml10_content()).map(str::to_owned)
}

/// Caminho do OPF, no atributo `full-path` do primeiro `<rootfile>`.
fn caminho_do_opf(container: &str) -> Result<Option<String>, quick_xml::Error> {
    let mut leitor = Reader::from_str(container);
    loop {
        match leitor.read_event()? {
            Event::Start(e) | Event::Empty(e) if e.local_name().as_ref() == "rootfile" => {
                return Ok(atributo(&e, "full-path"));
            }
            Event::Eof => return Ok(None),
            _ => {}
        }
    }
}

#[derive(Debug)]
struct Item {
    id: Option<String>,
    href: String,
    tipo_midia: String,
    propriedades: String,
}

/// O que interessa do OPF.
#[derive(Debug, Default)]
struct Pacote {
    metadados: Metadados,
    /// `id` do `dc:identifier` principal (atributo `unique-identifier` de `<package>`).
    id_unico: Option<String>,
    /// `id` do item da capa no estilo EPUB 2 (`<meta name="cover" content="...">`).
    id_capa: Option<String>,
    itens: Vec<Item>,
}

/// Elemento Dublin Core cujo texto estamos lendo.
enum Campo {
    Titulo,
    Autor,
    Idioma,
    Identificador { id: Option<String> },
}

impl Pacote {
    fn analisar(opf: &str) -> Result<Self, quick_xml::Error> {
        let mut pacote = Pacote::default();
        let mut leitor = Reader::from_str(opf);
        // Elemento aberto e o texto acumulado até agora (pode vir em pedaços, entre entidades).
        let mut lendo: Option<(Campo, String)> = None;

        loop {
            match leitor.read_event()? {
                Event::Start(e) => {
                    let campo = match e.local_name().as_ref() {
                        "title" => Some(Campo::Titulo),
                        "creator" => Some(Campo::Autor),
                        "language" => Some(Campo::Idioma),
                        "identifier" => Some(Campo::Identificador {
                            id: atributo(&e, "id"),
                        }),
                        _ => {
                            pacote.elemento(&e);
                            None
                        }
                    };
                    if let Some(campo) = campo {
                        lendo = Some((campo, String::new()));
                    }
                }
                Event::Empty(e) => pacote.elemento(&e),
                Event::Text(t) => {
                    if let Some((_, texto)) = &mut lendo {
                        texto.push_str(&t.xml10_content());
                    }
                }
                Event::CData(t) => {
                    if let Some((_, texto)) = &mut lendo {
                        texto.push_str(&t.xml10_content());
                    }
                }
                Event::GeneralRef(r) => {
                    if let (Some((_, texto)), Some(parte)) = (&mut lendo, texto_da_referencia(&r)) {
                        texto.push_str(&parte);
                    }
                }
                Event::End(_) => {
                    if let Some((campo, texto)) = lendo.take() {
                        pacote.guardar(campo, texto);
                    }
                }
                Event::Eof => break,
                _ => {}
            }
        }
        Ok(pacote)
    }

    /// Elementos que importam pelos atributos, não pelo texto.
    fn elemento(&mut self, e: &BytesStart) {
        match e.local_name().as_ref() {
            "package" => self.id_unico = atributo(e, "unique-identifier"),
            "meta" if atributo(e, "name").as_deref() == Some("cover") => {
                self.id_capa = atributo(e, "content");
            }
            "item" => {
                if let (Some(href), Some(tipo_midia)) =
                    (atributo(e, "href"), atributo(e, "media-type"))
                {
                    self.itens.push(Item {
                        id: atributo(e, "id"),
                        href,
                        tipo_midia,
                        propriedades: atributo(e, "properties").unwrap_or_default(),
                    });
                }
            }
            _ => {}
        }
    }

    fn guardar(&mut self, campo: Campo, texto: String) {
        let texto = texto.trim();
        if texto.is_empty() {
            return;
        }
        let m = &mut self.metadados;
        match campo {
            // Só o primeiro título: os seguintes costumam ser subtítulos.
            Campo::Titulo => {
                m.titulo.get_or_insert_with(|| texto.to_owned());
            }
            Campo::Autor => m.autores.push(texto.to_owned()),
            Campo::Idioma => {
                m.idioma.get_or_insert_with(|| texto.to_owned());
            }
            Campo::Identificador { id } => {
                // O identificador principal é o que `unique-identifier` aponta; senão, o primeiro.
                let principal = id.is_some() && id == self.id_unico;
                if principal || m.identificador.is_none() {
                    m.identificador = Some(texto.to_owned());
                }
            }
        }
    }

    /// Item da capa: EPUB 3 (`properties="cover-image"`), depois EPUB 2 (`<meta name="cover">`),
    /// depois qualquer imagem com "cover" no id ou no nome.
    fn capa(&self) -> Option<&Item> {
        let imagem = |item: &&Item| item.tipo_midia.starts_with("image/");
        self.itens
            .iter()
            .find(|i| {
                i.propriedades
                    .split_whitespace()
                    .any(|p| p == "cover-image")
            })
            .or_else(|| {
                let id = self.id_capa.as_deref()?;
                self.itens.iter().find(|i| i.id.as_deref() == Some(id))
            })
            .or_else(|| {
                self.itens.iter().filter(imagem).find(|i| {
                    let tem_cover = |s: &str| s.to_ascii_lowercase().contains("cover");
                    i.id.as_deref().is_some_and(tem_cover) || tem_cover(&i.href)
                })
            })
            .filter(imagem)
    }
}

/// Resolve um `href` do manifesto (relativo ao OPF e percent-encoded) para o nome no ZIP.
fn resolver(caminho_opf: &str, href: &str) -> String {
    let href = href.split('#').next().unwrap_or_default();
    let href = percent_encoding::percent_decode_str(href).decode_utf8_lossy();
    let base = caminho_opf.rsplit_once('/').map_or("", |(dir, _)| dir);

    let mut partes: Vec<&str> = Vec::new();
    for parte in base.split('/').chain(href.split('/')) {
        match parte {
            "" | "." => {}
            ".." => {
                partes.pop();
            }
            p => partes.push(p),
        }
    }
    partes.join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolver_relativo_ao_opf() {
        assert_eq!(resolver("OEBPS/content.opf", "capa.jpg"), "OEBPS/capa.jpg");
        assert_eq!(resolver("content.opf", "img/capa.jpg"), "img/capa.jpg");
        assert_eq!(resolver("a/b/content.opf", "../img/x.png"), "a/img/x.png");
        assert_eq!(
            resolver("OEBPS/content.opf", "minha%20capa.png#x"),
            "OEBPS/minha capa.png"
        );
    }

    #[test]
    fn identificador_principal_vence() {
        let opf = r#"<package unique-identifier="b"><metadata>
            <dc:identifier id="a">primeiro</dc:identifier>
            <dc:identifier id="b">principal</dc:identifier>
        </metadata></package>"#;
        let pacote = Pacote::analisar(opf).unwrap();
        assert_eq!(pacote.metadados.identificador.as_deref(), Some("principal"));
    }

    #[test]
    fn capa_por_heuristica_de_nome() {
        let opf = r#"<package><manifest>
            <item id="x" href="cover.jpg" media-type="image/jpeg"/>
        </manifest></package>"#;
        let pacote = Pacote::analisar(opf).unwrap();
        assert_eq!(pacote.capa().map(|i| i.href.as_str()), Some("cover.jpg"));
    }

    #[test]
    fn capa_que_nao_e_imagem_e_ignorada() {
        let opf = r#"<package><metadata><meta name="cover" content="c"/></metadata><manifest>
            <item id="c" href="cover.xhtml" media-type="application/xhtml+xml"/>
        </manifest></package>"#;
        assert!(Pacote::analisar(opf).unwrap().capa().is_none());
    }

    #[test]
    fn titulo_vazio_e_ignorado() {
        let opf = "<package><metadata><dc:title>  </dc:title><dc:title>Real</dc:title></metadata></package>";
        let pacote = Pacote::analisar(opf).unwrap();
        assert_eq!(pacote.metadados.titulo.as_deref(), Some("Real"));
    }
}
