const MAX_SHEET_NAME_LENGTH = 31;

/**
 * Sheet names both Excel and LibreOffice accept: 1 to 31 characters, none of `\ / ? * [ ] :`,
 * and unique regardless of case. XLSX and ODS share the rule so a workbook opens in either.
 */
export function validateSheetNames(names: readonly string[]): void {
  for (const name of names) {
    if (!name || name.length > MAX_SHEET_NAME_LENGTH || /[\\/?*[\]:]/.test(name)) {
      throw new Error(`Invalid spreadsheet sheet name: ${JSON.stringify(name)}.`);
    }
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    throw new Error("Spreadsheet sheet names must be unique.");
  }
}
