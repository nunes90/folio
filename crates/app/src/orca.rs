//! Pede ao Orca que diga um texto, pelo serviço D-Bus dele: sai com a voz e as configurações de
//! quem está usando, e também no braille. Sem o Orca, não faz nada.
//!
//! O WebKitGTK quase não entrega ao Orca as regiões vivas da página (ver `lib/regioesVivas.ts`).

/// Nome do serviço, que é também o nome da interface, e caminho: 51 usa `Orca1`, conferido aqui.
/// O nome sem o número é o das versões anteriores que já tinham o serviço.
const SERVICOS: [(&str, &str); 2] = [
    ("org.gnome.Orca1.Service", "/org/gnome/Orca1/Service"),
    ("org.gnome.Orca.Service", "/org/gnome/Orca/Service"),
];

#[cfg(target_os = "linux")]
pub fn anunciar(texto: &str) {
    use gtk::gio::{self, prelude::*};

    let conexao = match gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE) {
        Ok(conexao) => conexao,
        Err(erro) => {
            tracing::debug!(%erro, "sem o barramento da sessão");
            return;
        }
    };
    for (servico, caminho) in SERVICOS {
        // Só um deles existe, e nenhum sem o Orca. `NO_AUTO_START`: não abrir o Orca para isso.
        conexao.call(
            Some(servico),
            caminho,
            servico,
            "PresentMessage",
            Some(&(texto,).to_variant()),
            None,
            gio::DBusCallFlags::NO_AUTO_START,
            2000,
            gio::Cancellable::NONE,
            |_| {},
        );
    }
}

#[cfg(not(target_os = "linux"))]
pub fn anunciar(_texto: &str) {}
