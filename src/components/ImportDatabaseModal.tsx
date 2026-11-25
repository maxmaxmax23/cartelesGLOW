import React, { useEffect, useState } from 'react';
import { CatalogRow, FieldMapping } from '../types';
import { autoGuessMapping, parseCatalogText } from '../utils/catalogParser';

interface ImportDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCatalog: CatalogRow[];
  initialColumns: string[];
  initialFilename: string;
  initialMapping: FieldMapping;
  pendingFile?: { text: string; filename: string } | null;
  onApply: (payload: {
    catalog: CatalogRow[];
    columns: string[];
    filename: string;
    mapping: FieldMapping;
  }) => void;
}

export const ImportDatabaseModal: React.FC<ImportDatabaseModalProps> = ({
  isOpen,
  onClose,
  initialCatalog,
  initialColumns,
  initialFilename,
  initialMapping,
  pendingFile,
  onApply,
}) => {
  const [sourceMode, setSourceMode] = useState<'file' | 'paste'>('file');
  const [filename, setFilename] = useState(initialFilename);
  const [rows, setRows] = useState<CatalogRow[]>(initialCatalog);
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [mapping, setMapping] = useState<FieldMapping>(initialMapping);
  const [pasteText, setPasteText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSourceMode('file');

    if (pendingFile) {
      try {
        const parsed = parseCatalogText(pendingFile.text, pendingFile.filename);
        setFilename(pendingFile.filename);
        setRows(parsed.rows);
        setColumns(parsed.columns);
        setMapping(autoGuessMapping(parsed.columns));
      } catch (err) {
        setFilename(pendingFile.filename);
        setErrorMsg(err instanceof Error ? err.message : 'Could not parse CSV or JSON format.');
        setRows(initialCatalog);
        setColumns(initialColumns);
        setMapping(initialMapping);
      }
    } else {
      setFilename(initialFilename);
      setRows(initialCatalog);
      setColumns(initialColumns);
      setMapping(initialMapping);
    }
  }, [isOpen, pendingFile, initialCatalog, initialColumns, initialFilename, initialMapping]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const loadTextData = (text: string, name: string) => {
    try {
      const parsed = parseCatalogText(text, name);
      setFilename(name);
      setRows(parsed.rows);
      setColumns(parsed.columns);
      setMapping(autoGuessMapping(parsed.columns));
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not parse CSV or JSON format.');
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = typeof e.target?.result === 'string' ? e.target.result : '';
      loadTextData(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      setErrorMsg('Paste CSV rows or a JSON array before parsing.');
      return;
    }
    loadTextData(pasteText, 'pasted_catalog');
  };

  const missingLookupCount = rows.filter(
    (r) => !String(r[mapping.lookup] || '').trim()
  ).length;
  const validCount = rows.length - missingLookupCount;

  const handleApply = () => {
    onApply({
      catalog: rows,
      columns,
      filename,
      mapping,
    });
    onClose();
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-gutter-md sm:p-gutter-xl bg-light-inverse-surface/50 backdrop-blur-[1px] overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="w-full max-w-3xl rounded-xl bg-light-surface-container-lowest border border-light-outline-variant shadow-xl flex flex-col overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <header className="px-gutter-xl py-gutter-lg border-b border-light-outline-variant flex items-center justify-between gap-gutter-md bg-light-surface-container-lowest">
          <div className="flex items-center gap-gutter-md">
            <div className="w-10 h-10 rounded-md bg-light-secondary-container text-light-on-secondary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-headline-md" aria-hidden="true">
                database
              </span>
            </div>
            <div>
              <h2
                id="import-modal-title"
                className="font-headline text-headline-md text-light-on-surface"
              >
                Import CSV or JSON Database
              </h2>
              <p className="font-body text-body-md text-light-on-surface-variant">
                Upload your product catalog and map columns for barcode auto-fill.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="inline-flex items-center justify-center w-9 h-9 rounded bg-light-surface-container-lowest text-light-on-surface-variant border border-light-outline-variant hover:bg-light-surface-container-low hover:text-light-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-primary transition-colors duration-state-change cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
              close
            </span>
          </button>
        </header>

        {/* Modal Body */}
        <div className="p-gutter-xl flex flex-col gap-gutter-xl max-h-[75vh] overflow-y-auto">
          {/* Source Mode Switcher & Dropzone */}
          <section className="flex flex-col gap-gutter-md">
            <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
              <div
                role="tablist"
                aria-label="Import source"
                className="inline-grid grid-cols-2 gap-gutter-xs p-gutter-xs rounded-md bg-light-surface-container border border-light-outline-variant"
              >
                <button
                  role="tab"
                  type="button"
                  aria-selected={sourceMode === 'file'}
                  onClick={() => setSourceMode('file')}
                  className={`px-gutter-md py-1 rounded-sm font-body text-label-md whitespace-nowrap transition-colors duration-state-change cursor-pointer ${
                    sourceMode === 'file'
                      ? 'bg-light-surface-container-lowest text-light-primary shadow-sm'
                      : 'text-light-on-surface-variant hover:text-light-on-surface'
                  }`}
                >
                  Upload File
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={sourceMode === 'paste'}
                  onClick={() => setSourceMode('paste')}
                  className={`px-gutter-md py-1 rounded-sm font-body text-label-md whitespace-nowrap transition-colors duration-state-change cursor-pointer ${
                    sourceMode === 'paste'
                      ? 'bg-light-surface-container-lowest text-light-primary shadow-sm'
                      : 'text-light-on-surface-variant hover:text-light-on-surface'
                  }`}
                >
                  Paste CSV / JSON
                </button>
              </div>

              <span className="inline-flex items-center gap-1.5 px-gutter-md py-1 rounded-full bg-success-container text-on-success-container font-mono text-mono-sm">
                <span className="material-symbols-outlined text-body-md" aria-hidden="true">
                  check_circle
                </span>
                <span>
                  {filename} · {rows.length} rows
                </span>
              </span>
            </div>

            {sourceMode === 'file' ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`cursor-pointer rounded-lg border border-dashed px-gutter-xl py-gutter-lg flex items-center justify-between gap-gutter-lg transition-colors duration-state-change ${
                  isDragging
                    ? 'border-light-primary bg-light-surface-container'
                    : 'border-light-outline bg-light-surface-container-low hover:bg-light-surface-container'
                }`}
              >
                <div className="flex items-center gap-gutter-md">
                  <div className="w-11 h-11 rounded-md bg-light-surface-container-lowest border border-light-outline-variant flex items-center justify-center text-light-primary shrink-0">
                    <span className="material-symbols-outlined text-headline-md" aria-hidden="true">
                      upload_file
                    </span>
                  </div>
                  <div>
                    <p className="font-body text-title-md text-light-on-surface">
                      Drop a .csv or .json file here, or browse
                    </p>
                    <p className="font-body text-body-md text-light-on-surface-variant">
                      Comma or semicolon CSV with headers, or a JSON array of product objects.
                    </p>
                  </div>
                </div>
                <span className="shrink-0 px-gutter-md py-gutter-sm rounded bg-light-surface-container-lowest border border-light-outline-variant font-body text-label-lg text-light-on-surface whitespace-nowrap">
                  Browse File
                </span>
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            ) : (
              <div className="flex flex-col gap-gutter-sm">
                <textarea
                  rows={4}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder='[{"barcode":"7701012030014","sku":"SKU101203","price":"$52.900","description":"SET DE ESFERAS Y ADORNOS X31 BLUE"}]'
                  className="w-full rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-md font-mono text-mono-sm text-light-on-surface focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParsePaste}
                    className="inline-flex items-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-light-surface-container text-light-on-surface border border-light-outline-variant hover:bg-light-surface-container-high font-body text-label-md whitespace-nowrap cursor-pointer"
                  >
                    Parse Pasted Data
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-md bg-light-error-container text-light-on-error-container px-gutter-md py-gutter-sm font-body text-label-md flex items-center gap-gutter-sm"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  error
                </span>
                <span>{errorMsg}</span>
              </div>
            )}
          </section>

          {/* Column Mapping */}
          <section className="flex flex-col gap-gutter-md">
            <div className="flex items-center justify-between">
              <h3 className="font-body text-title-md text-light-on-surface">
                Map Columns to Sticker Fields
              </h3>
              <span className="font-body text-label-sm text-light-on-surface-variant">
                Auto-detected from file headers
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-md">
              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Barcode / Lookup
                </span>
                <select
                  value={mapping.lookup}
                  onChange={(e) => setMapping({ ...mapping, lookup: e.target.value })}
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-sm font-mono text-mono-md text-light-on-surface focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Price
                </span>
                <select
                  value={mapping.price}
                  onChange={(e) => setMapping({ ...mapping, price: e.target.value })}
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-sm font-mono text-mono-md text-light-on-surface focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Description
                </span>
                <select
                  value={mapping.description}
                  onChange={(e) => setMapping({ ...mapping, description: e.target.value })}
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-sm font-mono text-mono-md text-light-on-surface focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Display SKU
                </span>
                <select
                  value={mapping.sku}
                  onChange={(e) => setMapping({ ...mapping, sku: e.target.value })}
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-sm font-mono text-mono-md text-light-on-surface focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Live Mapped Preview Table */}
          <section className="flex flex-col gap-gutter-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-body text-title-md text-light-on-surface">
                Mapped Preview
              </h3>
              <span className="font-body text-label-sm text-light-on-surface-variant">
                Showing first {Math.min(5, rows.length)} records
              </span>
            </div>

            <div className="rounded-md border border-light-outline-variant overflow-x-auto bg-light-surface-container-lowest">
              <table className="w-full text-left border-collapse">
                <thead className="bg-light-surface-container-low border-b border-light-outline-variant">
                  <tr>
                    <th className="px-gutter-md py-gutter-sm font-body text-label-md text-light-on-surface-variant">
                      Lookup Key
                    </th>
                    <th className="px-gutter-md py-gutter-sm font-body text-label-md text-light-on-surface-variant">
                      Price
                    </th>
                    <th className="px-gutter-md py-gutter-sm font-body text-label-md text-light-on-surface-variant">
                      Description
                    </th>
                    <th className="px-gutter-md py-gutter-sm font-body text-label-md text-light-on-surface-variant">
                      Display SKU
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-outline-variant">
                  {rows.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="hover:bg-light-surface-container-low/50">
                      <td className="px-gutter-md py-gutter-sm font-mono text-mono-sm text-light-on-surface tabular-nums">
                        {row[mapping.lookup] || '—'}
                      </td>
                      <td className="px-gutter-md py-gutter-sm font-body text-label-lg text-light-on-surface tabular-nums">
                        {row[mapping.price] || '—'}
                      </td>
                      <td className="px-gutter-md py-gutter-sm font-body text-body-md text-light-on-surface-variant">
                        {row[mapping.description] || '—'}
                      </td>
                      <td className="px-gutter-md py-gutter-sm font-mono text-mono-sm text-light-on-surface-variant">
                        {row[mapping.sku] || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <footer className="px-gutter-xl py-gutter-lg bg-light-surface-container-low border-t border-light-outline-variant flex flex-wrap items-center justify-between gap-gutter-md">
          <p className="font-mono text-mono-sm text-light-on-surface-variant tabular-nums">
            {validCount} valid records · {missingLookupCount} missing lookup keys
          </p>
          <div className="flex items-center gap-gutter-sm">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-light-surface-container-lowest text-light-on-surface border border-light-outline-variant hover:bg-light-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-primary transition-colors duration-state-change whitespace-nowrap cursor-pointer"
            >
              <span className="font-body text-label-lg">Cancel</span>
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={rows.length === 0}
              className="inline-flex items-center justify-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-primary transition-colors duration-state-change whitespace-nowrap cursor-pointer"
            >
              <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                check
              </span>
              <span className="font-body text-label-lg">Apply Database</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
