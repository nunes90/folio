// Leitura em voz alta: comandos do motor de voz (crates/core/src/voz.rs) e a conversão do SSML
// que o tts.js do foliate-js produz para o formato que o speech-dispatcher entende bem.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Comando } from "./comandos";

/** Em que pé está a leitura em voz alta (igual nos dois leitores). */
export type EstadoVoz = "parado" | "falando" | "pausado";

export type EventoVoz = { tipo: "marca"; marca: string } | { tipo: "fim" } | { tipo: "interrompido" };

export interface ConfigVoz {
  idioma: string | null;
  /** -100 (mais lenta) a 100; 0 é a normal. */
  velocidade: number;
}

export function vozDisponivel(): Promise<boolean> {
  return invoke("voz_disponivel");
}

export function falar(ssml: string, config: ConfigVoz): Promise<void> {
  return invoke("falar", { ssml, config });
}

export const pausarVoz = (): Promise<void> => invoke("pausar_voz");
export const retomarVoz = (): Promise<void> => invoke("retomar_voz");
export const pararVoz = (): Promise<void> => invoke("parar_voz");

export function ouvirVoz(aoEvento: (e: EventoVoz) => void): Promise<UnlistenFn> {
  return listen<EventoVoz>("voz", (e) => aoEvento(e.payload));
}

export interface BlocoDeFala {
  ssml: string;
  /** Nomes das marcas, na ordem (os mesmos do foliate-js, para o `tts.setMark`). */
  marcas: string[];
  /** Idioma do trecho (`xml:lang` da raiz), se o livro o declara. */
  idioma: string | null;
}

const XML_NS = "http://www.w3.org/XML/1998/namespace";

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * O foliate-js gera `<speak><mark name="0"/>Frase. <mark name="1"/>Outra.</speak>`, com as
 * marcas soltas no texto. O espeak-ng (via speech-dispatcher) só emite a primeira marca nesse
 * formato; com cada frase dentro de `<s>`, emite todas. Aqui o bloco é reescrito assim, só com
 * texto e marcas (ênfase, pausas e fonemas do foliate são descartados). `null` = nada a falar.
 */
export function blocoParaFala(ssmlFoliate: string): BlocoDeFala | null {
  const doc = new DOMParser().parseFromString(ssmlFoliate, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const raiz = doc.documentElement;

  const frases: { marca: string | null; texto: string }[] = [{ marca: null, texto: "" }];
  const percorrer = (no: Node) => {
    if (no.nodeType === Node.TEXT_NODE || no.nodeType === Node.CDATA_SECTION_NODE) {
      frases.at(-1)!.texto += no.textContent ?? "";
    } else if (no instanceof Element && no.localName === "mark") {
      frases.push({ marca: no.getAttribute("name"), texto: "" });
    } else {
      no.childNodes.forEach(percorrer);
    }
  };
  raiz.childNodes.forEach(percorrer);

  const comTexto = frases
    .map((f) => ({ ...f, texto: f.texto.replace(/\s+/g, " ").trim() }))
    .filter((f) => f.texto);
  if (!comTexto.length) return null;

  const corpo = comTexto
    .map((f) => {
      const marca = f.marca === null ? "" : `<mark name="${escapar(f.marca)}"/>`;
      return `<s>${marca}${escapar(f.texto)}</s>`;
    })
    .join("");
  return {
    ssml: `<speak>${corpo}</speak>`,
    marcas: comTexto.flatMap((f) => (f.marca === null ? [] : [f.marca])),
    idioma: raiz.getAttributeNS(XML_NS, "lang") || null,
  };
}

/**
 * O bloco de fala de uma lista de frases (voz no PDF, M23): `<s><mark name="i"/>frase</s>`, como o
 * do EPUB. As marcas são os índices das frases a partir de `primeira` (ex.: retomar da 5ª frase
 * da página dá as marcas "4", "5", …). Frases vazias não entram. `null` = nada a falar.
 */
export function blocoDasFrases(
  frases: string[],
  primeira = 0,
  idioma: string | null = null,
): BlocoDeFala | null {
  const comTexto = frases
    .map((texto, i) => ({ marca: String(primeira + i), texto: texto.replace(/\s+/g, " ").trim() }))
    .filter((f) => f.texto);
  if (!comTexto.length) return null;
  const corpo = comTexto
    .map((f) => `<s><mark name="${f.marca}"/>${escapar(f.texto)}</s>`)
    .join("");
  return { ssml: `<speak>${corpo}</speak>`, marcas: comTexto.map((f) => f.marca), idioma };
}

/** Os comandos de voz da paleta, conforme o estado (iguais nos dois leitores). */
export function comandosDaVoz(
  estado: EstadoVoz,
  ler: () => void,
  pausarOuRetomar: () => void,
  parar: () => void,
): Comando[] {
  if (estado === "parado")
    return [{ id: "voz-ler", titulo: "Ler em voz alta", grupo: "Voz", executar: ler }];
  return [
    {
      id: "voz-pausar",
      titulo: estado === "pausado" ? "Continuar a leitura em voz alta" : "Pausar a leitura em voz alta",
      grupo: "Voz",
      executar: pausarOuRetomar,
    },
    { id: "voz-parar", titulo: "Parar a leitura em voz alta", grupo: "Voz", executar: parar },
  ];
}
