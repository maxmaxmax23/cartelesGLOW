import { CatalogRow, FieldMapping } from '../types';

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsv(text: string): CatalogRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount >= tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  }

  const headers = splitCsvLine(headerLine, delimiter).map((h, idx) => h || `column_${idx + 1}`);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const obj: CatalogRow = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    return obj;
  });
}

export function parseCatalogText(
  rawText: string,
  filename = ''
): { rows: CatalogRow[]; columns: string[] } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Input is empty.');
  }

  let rawRows: unknown[] = [];

  const looksLikeJson =
    filename.toLowerCase().endsWith('.json') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('{');

  if (looksLikeJson) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      rawRows = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const candidate =
        (parsed as Record<string, unknown>).items ??
        (parsed as Record<string, unknown>).data ??
        (parsed as Record<string, unknown>).products ??
        (parsed as Record<string, unknown>).rows;
      if (Array.isArray(candidate)) {
        rawRows = candidate;
      } else {
        throw new Error('JSON object must contain an array under "items", "data", or "products".');
      }
    } else {
      throw new Error('JSON must be an array of product objects.');
    }

    const rows: CatalogRow[] = rawRows
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => {
        const row: CatalogRow = {};
        for (const [k, v] of Object.entries(item)) {
          row[k] = v === null || v === undefined ? '' : String(v);
        }
        return row;
      });

    if (rows.length === 0) {
      throw new Error('No valid product objects found in JSON.');
    }

    const colSet = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
    return { rows, columns: Array.from(colSet) };
  }

  const rows = parseCsv(trimmed);
  if (rows.length === 0) {
    throw new Error('No rows parsed from CSV.');
  }
  const columns = Object.keys(rows[0]);
  return { rows, columns };
}

export function autoGuessMapping(columns: string[]): FieldMapping {
  if (columns.length === 0) {
    return { lookup: '', price: '', description: '', sku: '' };
  }
  const findCol = (patterns: string[], fallback = columns[0]) =>
    columns.find((c) => patterns.some((p) => c.toLowerCase().includes(p))) || fallback;

  return {
    lookup: findCol(['barcode', 'ean', 'upc', 'gtin', 'sku', 'code', 'id']),
    price: findCol(['price', 'precio', 'valor', 'cost', 'amount', 'pvp']),
    description: findCol(['desc', 'name', 'title', 'producto', 'nombre', 'item']),
    sku: findCol(['sku', 'ref', 'code', 'barcode']),
  };
}
