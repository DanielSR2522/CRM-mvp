import * as XLSX from 'xlsx';
import { suggestMapping } from './fields';
import { ImportCell, ImportSourceRow, ImportSourceType, ParsedImportFile } from './types';

export function parseImportFile(buffer: Buffer, filename: string): ParsedImportFile {
  const sourceType = detectSourceType(filename);
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The uploaded file does not contain a worksheet.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: true,
  });
  const columns = collectColumns(rawRows);
  const rows = rawRows.map((row) => normalizeRow(row, columns));

  return {
    filename,
    sourceType,
    columns,
    rows,
    sampleRows: rows.slice(0, 5),
    rowCount: rows.length,
    suggestedMapping: suggestMapping(columns),
    sourceFingerprint: createSourceFingerprint(columns),
  };
}

export function detectSourceType(filename: string): ImportSourceType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xls')) return 'xls';
  if (lower.endsWith('.csv')) return 'csv';
  throw new Error('Unsupported file type. Upload .xlsx, .xls, or .csv.');
}

export function createSourceFingerprint(columns: string[]): string {
  return columns.map((column) => column.trim().toLowerCase()).join('|');
}

function collectColumns(rows: Record<string, unknown>[]): string[] {
  const columns = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key.trim()) columns.add(key);
    });
  });
  return Array.from(columns);
}

function normalizeRow(row: Record<string, unknown>, columns: string[]): ImportSourceRow {
  return columns.reduce<ImportSourceRow>((acc, column) => {
    acc[column] = toImportCell(row[column]);
    return acc;
  }, {});
}

function toImportCell(value: unknown): ImportCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}
