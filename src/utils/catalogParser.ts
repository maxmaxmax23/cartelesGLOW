import { AliasMeta, CatalogAlias, CatalogRow, FieldMapping } from '../types';

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

export interface ParsedCatalogResult {
  rows: CatalogRow[];
  columns: string[];
  aliases: CatalogAlias[];
  aliasMeta: AliasMeta | null;
}

export function parseCsv(text: string): ParsedCatalogResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount >= tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  }

  const rawHeaders = splitCsvLine(headerLine, delimiter);
  const dataLines = lines.slice(1).map((line) => splitCsvLine(line, delimiter));

  // Detect side-by-side Excel lookup layout:
  // e.g. Articulo; Desc. Articulo; L. de precio; Descripcion; Vigencia; Precio; ; Codigo; Articulo; Descripcion
  // H:J matrix where H is barcode (Codigo) and I is canonical key (Articulo) mapped into A:F.
  const normalized = rawHeaders.map((h) => h.trim().toLowerCase());
  let aliasCodeIdx = -1;
  let aliasTargetIdx = -1;

  for (let i = 1; i < normalized.length - 1; i++) {
    const h = normalized[i];
    const isCodeCol =
      h === 'codigo' ||
      h === 'código' ||
      h === 'barcode' ||
      h === 'ean' ||
      h === 'upc' ||
      (i >= 4 && (h.includes('codigo') || h.includes('código') || h.includes('barcode')));
    if (!isCodeCol) continue;

    // Look for a column after i whose header duplicates one of the left-side headers (e.g. `Articulo`)
    const leftSet = new Set(normalized.slice(0, i).filter(Boolean));
    const dupIdx = normalized.findIndex(
      (col, idx) => idx > i && col !== '' && leftSet.has(col)
    );
    const hasEmptyGapBefore = i > 0 && normalized[i - 1] === '';

    if (dupIdx !== -1) {
      aliasCodeIdx = i;
      aliasTargetIdx = dupIdx;
      break;
    } else if (hasEmptyGapBefore && i + 1 < normalized.length && normalized[i + 1] !== '') {
      aliasCodeIdx = i;
      aliasTargetIdx = i + 1;
      break;
    }
  }

  const aliases: CatalogAlias[] = [];
  let aliasMeta: AliasMeta | null = null;
  const mainEndIdx = aliasCodeIdx !== -1 ? aliasCodeIdx : rawHeaders.length;

  if (aliasCodeIdx !== -1 && aliasTargetIdx !== -1) {
    aliasMeta = {
      codeCol: rawHeaders[aliasCodeIdx].trim(),
      targetCol: rawHeaders[aliasTargetIdx].trim(),
    };
  }

  // Build deduplicated column descriptors for the main A:F table (ignoring blank separator columns)
  const usedNames = new Map<string, number>();
  const mainCols: { index: number; name: string }[] = [];

  for (let i = 0; i < mainEndIdx; i++) {
    const rawName = rawHeaders[i].trim();
    if (!rawName) continue;

    const count = (usedNames.get(rawName) || 0) + 1;
    usedNames.set(rawName, count);
    const uniqueName = count === 1 ? rawName : `${rawName} (${count})`;
    mainCols.push({ index: i, name: uniqueName });
  }

  if (mainCols.length === 0) {
    throw new Error('No valid column headers found in CSV.');
  }

  const rows: CatalogRow[] = [];

  for (const values of dataLines) {
    if (aliasCodeIdx !== -1 && aliasTargetIdx !== -1) {
      const code = (values[aliasCodeIdx] ?? '').trim();
      const target = (values[aliasTargetIdx] ?? '').trim();
      if (code && target) {
        aliases.push({ code, target });
      }
    }

    const obj: CatalogRow = {};
    let hasAnyValue = false;
    for (const col of mainCols) {
      const val = (values[col.index] ?? '').trim();
      if (val) hasAnyValue = true;
      obj[col.name] = val;
    }

    if (hasAnyValue) {
      rows.push(obj);
    }
  }

  if (rows.length === 0) {
    throw new Error('No valid data rows found in CSV.');
  }

  return {
    rows,
    columns: mainCols.map((c) => c.name),
    aliases,
    aliasMeta,
  };
}

export function parseCatalogText(
  rawText: string,
  filename = ''
): ParsedCatalogResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Input is empty.');
  }

  const looksLikeJson =
    filename.toLowerCase().endsWith('.json') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('{');

  if (looksLikeJson) {
    const parsed = JSON.parse(trimmed);
    let rawRows: unknown[] = [];
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
        throw new Error(
          'JSON object must contain an array under "items", "data", or "products".'
        );
      }
    } else {
      throw new Error('JSON must be an array of product objects.');
    }

    const rows: CatalogRow[] = rawRows
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object')
      )
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
    return { rows, columns: Array.from(colSet), aliases: [], aliasMeta: null };
  }

  return parseCsv(trimmed);
}

export function autoGuessMapping(columns: string[]): FieldMapping {
  if (columns.length === 0) {
    return { lookup: '', price: '', description: '', sku: '' };
  }

  const findCol = (
    exactCandidates: string[],
    partialPatterns: string[],
    fallback = columns[0]
  ) => {
    for (const exact of exactCandidates) {
      const found = columns.find((c) => c.toLowerCase().trim() === exact);
      if (found) return found;
    }
    for (const pattern of partialPatterns) {
      const found = columns.find((c) => c.toLowerCase().includes(pattern));
      if (found) return found;
    }
    return fallback;
  };

  return {
    lookup: findCol(
      ['articulo', 'artículo', 'barcode', 'ean', 'upc', 'codigo', 'código', 'sku', 'code', 'id'],
      ['articulo', 'barcode', 'ean', 'upc', 'gtin', 'codigo', 'sku', 'code', 'id']
    ),
    price: findCol(
      ['precio', 'price', 'pvp', 'valor', 'amount', 'cost'],
      ['precio', 'price', 'valor', 'cost', 'amount', 'pvp']
    ),
    description: findCol(
      ['desc. articulo', 'desc articulo', 'description', 'producto', 'descripcion', 'descripción', 'name', 'title', 'nombre'],
      ['desc. art', 'desc art', 'description', 'producto', 'desc', 'name', 'title', 'nombre', 'item']
    ),
    sku: findCol(
      ['sku', 'articulo', 'artículo', 'ref', 'referencia', 'code', 'codigo', 'código', 'barcode'],
      ['sku', 'articulo', 'ref', 'code', 'codigo', 'barcode']
    ),
  };
}
