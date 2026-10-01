import { strToU8, zipSync } from "fflate";
import type { ExportCell, ExportTable } from "./csv";

const MIME_TYPE = "application/vnd.oasis.opendocument.spreadsheet";

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("\r", "&#13;");
}

function xmlAttribute(value: string): string {
  return xmlText(value).replaceAll("\n", "&#10;").replaceAll("\t", "&#9;");
}

function cellXml(value: ExportCell): string {
  if (value === null) return "<table:table-cell/>";
  if (typeof value === "number") {
    return `<table:table-cell office:value-type="float" office:value="${value}"><text:p>${value}</text:p></table:table-cell>`;
  }
  // ODF has no OOXML _xHHHH_ escapes. Store the logical value explicitly and preserve
  // whitespace in the paragraph too, so consumers do not collapse notes or identifiers.
  const paragraph = xmlText(value)
    .replaceAll(" ", "<text:s/>")
    .replaceAll("\t", "<text:tab/>")
    .replaceAll("\n", "<text:line-break/>");
  return `<table:table-cell office:value-type="string" office:string-value="${xmlAttribute(value)}"><text:p>${paragraph}</text:p></table:table-cell>`;
}

/** Minimal ODF 1.3 data workbook: typed cells, no formulas, exact string values. */
export function writeOds(
  tables: readonly (readonly [string, ExportTable])[],
): Uint8Array<ArrayBuffer> {
  const sheets = tables
    .map(([name, table]) => {
      const rows = [table.headers, ...table.rows]
        .map((row) => `<table:table-row>${row.map(cellXml).join("")}</table:table-row>`)
        .join("");
      return `<table:table table:name="${xmlAttribute(name)}"><table:table-column table:number-columns-repeated="${table.headers.length}"/>${rows}</table:table>`;
    })
    .join("");
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3"><office:body><office:spreadsheet>${sheets}</office:spreadsheet></office:body></office:document-content>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${MIME_TYPE}" manifest:version="1.3"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:styles/></office:document-styles>`;
  // ODF requires mimetype first, without compression or ZIP extra fields.
  return zipSync({
    mimetype: [strToU8(MIME_TYPE), { level: 0 }],
    "content.xml": strToU8(content),
    "styles.xml": strToU8(styles),
    "META-INF/manifest.xml": strToU8(manifest),
  });
}
