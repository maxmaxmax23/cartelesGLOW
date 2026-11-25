import * as XLSX from 'xlsx';
import { AliasMeta, CatalogAlias, CatalogRow, FieldMapping } from '../types';

export interface ParsedCatalogResult {
  rows: CatalogRow[];
  columns: string[];
  aliases: CatalogAlias[];
  aliasMeta: AliasMeta | null;
  sheetNames?: string[];
  selectedSheet?: string;
}

function cleanCellText(value: string): string {
  return value.replace(/\u00A0/g, ' ').trim();
}

function normalizeHeader(h: string): string {
  return cleanCellText(h)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

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
      result.push(cleanCellText(current));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(cleanCellText(current));
  return result;
}

function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  // If UTF-8 produced replacement characters (\uFFFD), Excel likely exported ANSI / Windows-1252
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('windows-1252').decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function formatExcelCell(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const w = cell.w ? cell.w.trim() : '';
    // Prevent scientific notation like 7.70101E+12 from corrupting EAN/UPC barcodes
    if (!w || /[eE][+-]?\d+/.test(w)) {
      if (Number.isInteger(cell.v)) {
        return cell.v.toLocaleString('fullwide', { useGrouping: false });
      }
      return String(cell.v);
    }
    return w;
  }
  if (cell.w !== undefined && cell.w !== null) {
    return cleanCellText(String(cell.w));
  }
  if (cell.v !== undefined && cell.v !== null) {
    return cleanCellText(String(cell.v));
  }
  return '';
}

function sheetToGrid(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: string[][] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    let rowHasValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const val = formatExcelCell(sheet[addr] as XLSX.CellObject | undefined);
      if (val) rowHasValue = true;
      row.push(val);
    }
    if (rowHasValue) {
      grid.push(row);
    }
  }
  return grid;
}

function findHeaderRowIndex(grid: string[][]): number {
  const keywords = ['articulo', 'codigo', 'precio', 'desc', 'sku', 'barcode', 'price'];
  const scanLimit = Math.min(10, grid.length);
  for (let r = 0; r < scanLimit; r++) {
    const row = grid[r];
    const nonEmpty = row.filter((c) => c.trim() !== '').length;
    if (nonEmpty < 2) continue;
    const hitCount = row.filter((c) => {
      const n = normalizeHeader(c);
      return keywords.some((k) => n.includes(k));
    }).length;
    if (hitCount >= 2) return r;
  }
  return 0;
}

export function parseTabularGrid(grid: string[][]): ParsedCatalogResult {
  if (grid.length < 2) {
    throw new Error('Spreadsheet must include a header row and at least one data row.');
  }

  const headerIdx = findHeaderRowIndex(grid);
  const rawHeaders = grid[headerIdx];
  const dataLines = grid.slice(headerIdx + 1);

  // Detect side-by-side Excel lookup layout:
  // e.g. Articulo; Desc. Articulo; L. de precio; Descripcion; Vigencia; Precio; ; Codigo; Articulo; Descripcion
  const normalized = rawHeaders.map((h) => normalizeHeader(h));
  let aliasCodeIdx = -1;
  let aliasTargetIdx = -1;

  for (let i = 1; i < normalized.length - 1; i++) {
    const h = normalized[i];
    const isCodeCol =
      h === 'codigo' ||
      h === 'barcode' ||
      h === 'ean' ||
      h === 'upc' ||
      (i >= 4 && (h.includes('codigo') || h.includes('barcode') || h.includes('ean')));
    if (!isCodeCol) continue;

    const leftSet = new Set(normalized.slice(0, i).filter(Boolean));
    const nextCol = i + 1 < normalized.length ? normalized[i + 1] : '';
    const hasEmptyGapBefore = i > 0 && normalized[i - 1] === '';

    if (nextCol !== '' && leftSet.has(nextCol)) {
      aliasCodeIdx = i;
      aliasTargetIdx = i + 1;
      break;
    }

    const dupIdx = normalized.findIndex(
      (col, idx) =>
        idx > i &&
        col !== '' &&
        leftSet.has(col) &&
        !col.includes('desc')
    );

    if (dupIdx !== -1) {
      aliasCodeIdx = i;
      aliasTargetIdx = dupIdx;
      break;
    } else if (hasEmptyGapBefore && nextCol !== '') {
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
      codeCol: cleanCellText(rawHeaders[aliasCodeIdx] ?? ''),
      targetCol: cleanCellText(rawHeaders[aliasTargetIdx] ?? ''),
    };
  }

  const usedNames = new Map<string, number>();
  const mainCols: { index: number; name: string }[] = [];

  for (let i = 0; i < mainEndIdx; i++) {
    const rawName = (rawHeaders[i] ?? '').trim();
    if (!rawName) continue;

    const count = (usedNames.get(rawName) || 0) + 1;
    usedNames.set(rawName, count);
    const uniqueName = count === 1 ? rawName : `${rawName} (${count})`;
    mainCols.push({ index: i, name: uniqueName });
  }

  if (mainCols.length === 0) {
    throw new Error('No valid column headers found.');
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
    throw new Error('No valid data rows found.');
  }

  return {
    rows,
    columns: mainCols.map((c) => c.name),
    aliases,
    aliasMeta,
  };
}

export function parseCsv(text: string): ParsedCatalogResult {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\uFEFF/, '').trim())
    .filter((l) => l.length > 0);

  if (rawLines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  let lines = rawLines;
  let explicitDelimiter: string | null = null;
  const sepMatch = /^sep=(.)$/i.exec(rawLines[0]);
  if (sepMatch) {
    explicitDelimiter = sepMatch[1];
    lines = rawLines.slice(1);
  }

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }

  let delimiter = explicitDelimiter ?? ',';
  if (!explicitDelimiter) {
    const sample = lines.slice(0, 10).join('\n');
    const commaCount = (sample.match(/,/g) || []).length;
    const semiCount = (sample.match(/;/g) || []).length;
    const tabCount = (sample.match(/\t/g) || []).length;

    if (semiCount > commaCount && semiCount >= tabCount) {
      delimiter = ';';
    } else if (tabCount > commaCount && tabCount > semiCount) {
      delimiter = '\t';
    }
  }

  const grid = lines.map((line) => splitCsvLine(line, delimiter));
  return parseTabularGrid(grid);
}

export function parseExcelBuffer(
  buffer: ArrayBuffer,
  preferredSheet?: string
): ParsedCatalogResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellNF: true, cellText: true });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('Excel workbook contains no sheets.');
  }

  let targetSheetName = preferredSheet;
  if (!targetSheetName || !sheetNames.includes(targetSheetName)) {
    // Prefer a sheet named "db" (case-insensitive), matching standard Excel template
    const dbSheet = sheetNames.find((s) => s.trim().toLowerCase() === 'db');
    targetSheetName = dbSheet || sheetNames[0];
  }

  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) {
    throw new Error(`Sheet "${targetSheetName}" could not be read.`);
  }

  const grid = sheetToGrid(sheet);
  const parsed = parseTabularGrid(grid);
  return {
    ...parsed,
    sheetNames,
    selectedSheet: targetSheetName,
  };
}

export function parseCatalogFileBuffer(
  buffer: ArrayBuffer,
  filename: string,
  preferredSheet?: string
): ParsedCatalogResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) {
    return parseExcelBuffer(buffer, preferredSheet);
  }
  const text = decodeCsvBuffer(buffer);
  return parseCatalogText(text, filename);
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
      const found = columns.find((c) => normalizeHeader(c) === exact);
      if (found) return found;
    }
    for (const pattern of partialPatterns) {
      const found = columns.find((c) => normalizeHeader(c).includes(pattern));
      if (found) return found;
    }
    return fallback;
  };

  return {
    lookup: findCol(
      ['articulo', 'barcode', 'ean', 'upc', 'codigo', 'sku', 'code', 'id'],
      ['articulo', 'barcode', 'ean', 'upc', 'gtin', 'codigo', 'sku', 'code', 'id']
    ),
    price: findCol(
      ['precio', 'price', 'pvp', 'valor', 'amount', 'cost'],
      ['precio', 'price', 'valor', 'cost', 'amount', 'pvp']
    ),
    description: findCol(
      ['desc. articulo', 'desc articulo', 'description', 'producto', 'descripcion', 'name', 'title', 'nombre'],
      ['desc. art', 'desc art', 'description', 'producto', 'desc', 'name', 'title', 'nombre', 'item']
    ),
    sku: findCol(
      ['sku', 'articulo', 'ref', 'referencia', 'code', 'codigo', 'barcode'],
      ['sku', 'articulo', 'ref', 'code', 'codigo', 'barcode']
    ),
  };
}
