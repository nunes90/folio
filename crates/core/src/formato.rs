//! Detecção do formato de um livro pelo conteúdo (assinatura), não pela extensão.

/// Formatos que o leitor sabe abrir.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Formato {
    Epub,
    Pdf,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ErroFormato {
    #[error("o arquivo está vazio")]
    Vazio,
    #[error("formato não reconhecido (esperado EPUB ou PDF)")]
    Desconhecido,
}

/// Assinatura do cabeçalho local de um arquivo dentro de um ZIP.
const ZIP_CABECALHO_LOCAL: &[u8] = b"PK\x03\x04";
/// Tamanho da parte fixa do cabeçalho local (antes do nome do arquivo).
const ZIP_CABECALHO_TAMANHO: usize = 30;
const MIMETYPE_NOME: &[u8] = b"mimetype";
const MIMETYPE_EPUB: &[u8] = b"application/epub+zip";

const PDF_ASSINATURA: &[u8] = b"%PDF-";
/// Leitores como o Acrobat aceitam lixo antes de `%PDF-` no primeiro KiB; fazemos o mesmo.
const PDF_JANELA: usize = 1024;

/// Descobre o formato a partir dos bytes do arquivo.
///
/// Basta passar o início do arquivo: `PDF_JANELA` + alguns bytes cobrem os dois formatos.
pub fn detectar(bytes: &[u8]) -> Result<Formato, ErroFormato> {
    if bytes.is_empty() {
        return Err(ErroFormato::Vazio);
    }
    if eh_epub(bytes) {
        return Ok(Formato::Epub);
    }
    if eh_pdf(bytes) {
        return Ok(Formato::Pdf);
    }
    Err(ErroFormato::Desconhecido)
}

/// A especificação OCF exige que um EPUB seja um ZIP cujo **primeiro** arquivo se chame
/// `mimetype`, sem compressão, contendo `application/epub+zip`. Por isso dá para checar
/// lendo só o primeiro cabeçalho local, sem descompactar nada.
///
/// Cabeçalho local (inteiros little-endian):
/// - `0..4`   assinatura `PK\x03\x04`
/// - `26..28` tamanho do nome do arquivo
/// - `28..30` tamanho do campo extra
/// - `30..`   nome, depois o campo extra, depois o conteúdo
fn eh_epub(bytes: &[u8]) -> bool {
    // `get` devolve None se o slice for curto demais, em vez de dar panic como `bytes[..30]`.
    let Some(cabecalho) = bytes.get(..ZIP_CABECALHO_TAMANHO) else {
        return false;
    };
    if !cabecalho.starts_with(ZIP_CABECALHO_LOCAL) {
        return false;
    }
    let tamanho_nome = usize::from(u16::from_le_bytes([cabecalho[26], cabecalho[27]]));
    let tamanho_extra = usize::from(u16::from_le_bytes([cabecalho[28], cabecalho[29]]));

    let fim_nome = ZIP_CABECALHO_TAMANHO + tamanho_nome;
    let inicio_conteudo = fim_nome + tamanho_extra;

    bytes.get(ZIP_CABECALHO_TAMANHO..fim_nome) == Some(MIMETYPE_NOME)
        && bytes
            .get(inicio_conteudo..)
            .is_some_and(|conteudo| conteudo.starts_with(MIMETYPE_EPUB))
}

fn eh_pdf(bytes: &[u8]) -> bool {
    let janela = &bytes[..bytes.len().min(PDF_JANELA + PDF_ASSINATURA.len())];
    janela
        .windows(PDF_ASSINATURA.len())
        .any(|w| w == PDF_ASSINATURA)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Monta um cabeçalho local de ZIP com o nome, o campo extra e o conteúdo dados.
    fn zip_local(nome: &[u8], extra: &[u8], conteudo: &[u8]) -> Vec<u8> {
        let mut v = ZIP_CABECALHO_LOCAL.to_vec();
        v.resize(26, 0);
        v.extend((nome.len() as u16).to_le_bytes());
        v.extend((extra.len() as u16).to_le_bytes());
        v.extend(nome);
        v.extend(extra);
        v.extend(conteudo);
        v
    }

    #[test]
    fn epub_valido() {
        let bytes = zip_local(b"mimetype", b"", b"application/epub+zip");
        assert_eq!(detectar(&bytes), Ok(Formato::Epub));
    }

    #[test]
    fn epub_com_campo_extra_e_aceito() {
        let bytes = zip_local(b"mimetype", b"\x01\x02\x03\x04", b"application/epub+zip");
        assert_eq!(detectar(&bytes), Ok(Formato::Epub));
    }

    #[test]
    fn zip_com_outro_primeiro_arquivo_nao_e_epub() {
        let bytes = zip_local(b"META-INF/container.xml", b"", b"<container/>");
        assert_eq!(detectar(&bytes), Err(ErroFormato::Desconhecido));
    }

    #[test]
    fn mimetype_cortado_nao_e_epub() {
        let bytes = zip_local(b"mimetype", b"", b"application/epub");
        assert_eq!(detectar(&bytes), Err(ErroFormato::Desconhecido));
    }

    #[test]
    fn tamanhos_maiores_que_o_arquivo_nao_dao_panic() {
        let mut bytes = zip_local(b"mimetype", b"", b"");
        bytes[26] = 0xff;
        bytes[27] = 0xff;
        assert_eq!(detectar(&bytes), Err(ErroFormato::Desconhecido));
    }

    #[test]
    fn pdf_no_inicio() {
        assert_eq!(detectar(b"%PDF-1.7\n..."), Ok(Formato::Pdf));
    }

    #[test]
    fn pdf_depois_do_primeiro_kib_nao_conta() {
        let mut bytes = vec![b' '; PDF_JANELA + 1];
        bytes.extend(b"%PDF-1.7");
        assert_eq!(detectar(&bytes), Err(ErroFormato::Desconhecido));
    }

    #[test]
    fn pdf_no_limite_da_janela_conta() {
        let mut bytes = vec![b' '; PDF_JANELA];
        bytes.extend(b"%PDF-1.7");
        assert_eq!(detectar(&bytes), Ok(Formato::Pdf));
    }

    #[test]
    fn vazio() {
        assert_eq!(detectar(b""), Err(ErroFormato::Vazio));
    }
}
