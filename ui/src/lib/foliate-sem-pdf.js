// Substitui o `./pdf.js` do foliate-js (ver vite.config.ts). O pdf.js dele traz 13 MB de
// vendor/pdfjs, e PDFs nem chegam ao foliate: o core em Rust separa os formatos antes.
export const makePDF = () => {
  throw new Error("PDF não é aberto pelo foliate-js");
};
