import React, { useMemo, useRef, useState } from 'react';
import {
  AliasMeta,
  BorderStyle,
  CatalogAlias,
  CatalogRow,
  FieldMapping,
  GridConfig,
  PendingImportFile,
  StickerSlot,
  StudioTab,
  TemplateConfig,
} from '../types';

interface InspectorSidebarProps {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  activeSlot: number;
  slotData: StickerSlot;
  autoAdvance: boolean;
  onAutoAdvanceChange: (val: boolean) => void;
  scannerInputRef: React.RefObject<HTMLInputElement | null>;
  catalog: CatalogRow[];
  columns: string[];
  aliases: CatalogAlias[];
  aliasMeta: AliasMeta | null;
  mapping: FieldMapping;
  dbFilename: string;
  scanFeedback: { message: string; isSuccess: boolean } | null;
  onApplyCatalogItem: (item: CatalogRow, matchedCode?: string) => void;
  onScanNotFound: (query: string) => void;
  onUpdateSlotField: (field: keyof StickerSlot, value: string) => void;
  onDuplicateActiveToAll: () => void;
  onClearActiveSlot: () => void;
  grid: GridConfig;
  onUpdateGrid: (next: GridConfig) => void;
  template: TemplateConfig;
  onUpdateTemplate: (next: TemplateConfig) => void;
  onUpdateMapping: (next: FieldMapping) => void;
  onOpenImportModal: (pendingFile?: PendingImportFile) => void;
  autoSave: boolean;
  hasSavedSettings: boolean;
  hasUnsavedChanges: boolean;
  settingsNotice: string | null;
  onToggleAutoSave: (val: boolean) => void;
  onSaveSettings: () => void;
  onResetSavedSettings: () => void;
}

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  activeTab,
  onTabChange,
  activeSlot,
  slotData,
  autoAdvance,
  onAutoAdvanceChange,
  scannerInputRef,
  catalog,
  columns,
  aliases,
  aliasMeta,
  mapping,
  dbFilename,
  scanFeedback,
  onApplyCatalogItem,
  onScanNotFound,
  onUpdateSlotField,
  onDuplicateActiveToAll,
  onClearActiveSlot,
  grid,
  onUpdateGrid,
  template,
  onUpdateTemplate,
  onUpdateMapping,
  onOpenImportModal,
  autoSave,
  hasSavedSettings,
  hasUnsavedChanges,
  settingsNotice,
  onToggleAutoSave,
  onSaveSettings,
  onResetSavedSettings,
}) => {
  const [scanQuery, setScanQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [isDataDragging, setIsDataDragging] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState('');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const tabs: { id: StudioTab; label: string }[] = [
    { id: 'scan', label: 'Scan' },
    { id: 'grid', label: 'Grid' },
    { id: 'template', label: 'Design' },
    { id: 'data', label: 'Data' },
  ];

  // O(1) lookup indexes mirroring Excel:
  // B2 = SI.ND(BUSCARV(A2; db!$H:$J; 2; 0); BUSCARV(A2; db!$A:$F; 1; 0))
  // C2 = BUSCARV(B2; db!$A$2:$F$54000; 2; FALSO)
  const {
    productByPrimaryCol,
    productByKey,
    productByNumericKey,
    aliasToTarget,
    aliasByNumericCode,
    targetToAliases,
  } = useMemo(() => {
    const primaryCol = columns[0] || mapping.lookup;
    const primaryMap = new Map<string, CatalogRow>();
    const pMap = new Map<string, CatalogRow>();
    const numMap = new Map<string, CatalogRow>();

    const indexNumeric = (rawKey: string, row: CatalogRow) => {
      if (/^\d+$/.test(rawKey)) {
        const stripped = rawKey.replace(/^0+/, '') || '0';
        if (!numMap.has(stripped)) {
          numMap.set(stripped, row);
        }
      }
    };

    for (const row of catalog) {
      const colAVal = String(row[primaryCol] || '').trim().toLowerCase();
      if (colAVal && !primaryMap.has(colAVal)) {
        primaryMap.set(colAVal, row);
      }
      if (colAVal && !pMap.has(colAVal)) {
        pMap.set(colAVal, row);
      }
      indexNumeric(colAVal, row);

      const lookupVal = String(row[mapping.lookup] || '').trim().toLowerCase();
      if (lookupVal && !pMap.has(lookupVal)) {
        pMap.set(lookupVal, row);
      }
      indexNumeric(lookupVal, row);

      const skuVal = String(row[mapping.sku] || '').trim().toLowerCase();
      if (skuVal && !pMap.has(skuVal)) {
        pMap.set(skuVal, row);
      }
      indexNumeric(skuVal, row);

      const barcodeVal = String(row.barcode || '').trim().toLowerCase();
      if (barcodeVal && !pMap.has(barcodeVal)) {
        pMap.set(barcodeVal, row);
      }
      indexNumeric(barcodeVal, row);
    }

    const aToT = new Map<string, string>();
    const aNumToT = new Map<string, string>();
    const tToA = new Map<string, string[]>();
    for (const alias of aliases) {
      const code = alias.code.trim().toLowerCase();
      const target = alias.target.trim().toLowerCase();
      if (!code || !target) continue;
      if (!aToT.has(code)) {
        aToT.set(code, target);
      }
      if (/^\d+$/.test(code)) {
        const strippedCode = code.replace(/^0+/, '') || '0';
        if (!aNumToT.has(strippedCode)) {
          aNumToT.set(strippedCode, target);
        }
      }
      const list = tToA.get(target);
      if (list) {
        list.push(alias.code.trim());
      } else {
        tToA.set(target, [alias.code.trim()]);
      }
    }

    return {
      productByPrimaryCol: primaryMap,
      productByKey: pMap,
      productByNumericKey: numMap,
      aliasToTarget: aToT,
      aliasByNumericCode: aNumToT,
      targetToAliases: tToA,
    };
  }, [catalog, aliases, columns, mapping.lookup, mapping.sku]);

  const autocompleteMatches = useMemo(() => {
    const q = scanQuery.trim().toLowerCase();
    if (!q) return [];

    const results: { row: CatalogRow; matchedAlias?: string }[] = [];
    const seen = new Set<CatalogRow>();

    // Exact H:J alias or A:F key match first
    const exactAliasTarget = aliasToTarget.get(q);
    if (exactAliasTarget) {
      const hit = productByKey.get(exactAliasTarget);
      if (hit) {
        seen.add(hit);
        results.push({ row: hit, matchedAlias: scanQuery.trim() });
      }
    }
    const directHit = productByKey.get(q);
    if (directHit && !seen.has(directHit)) {
      seen.add(directHit);
      results.push({ row: directHit });
    }

    // Partial match across main columns and H:J barcode aliases (capped at 6)
    for (const row of catalog) {
      if (results.length >= 6) break;
      if (seen.has(row)) continue;

      const v1 = String(row[mapping.lookup] || '').toLowerCase();
      const v2 = String(row[mapping.description] || '').toLowerCase();
      const v3 = String(row[mapping.sku] || '').toLowerCase();

      if (v1.includes(q) || v2.includes(q) || v3.includes(q)) {
        seen.add(row);
        results.push({ row });
        continue;
      }

      const rowKey = v1 || v3;
      const rowAliases = rowKey ? targetToAliases.get(rowKey) : undefined;
      if (rowAliases) {
        const matchedCode = rowAliases.find((c) => c.toLowerCase().includes(q));
        if (matchedCode) {
          seen.add(row);
          results.push({ row, matchedAlias: matchedCode });
        }
      }
    }

    return results;
  }, [scanQuery, catalog, mapping, aliasToTarget, productByKey, targetToAliases]);

  const filteredCatalogPreview = useMemo(() => {
    const q = catalogFilter.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((row) => {
      const v1 = String(row[mapping.lookup] || '').toLowerCase();
      const v2 = String(row[mapping.description] || '').toLowerCase();
      const v3 = String(row[mapping.sku] || '').toLowerCase();
      if (v1.includes(q) || v2.includes(q) || v3.includes(q)) return true;
      const rowKey = v1 || v3;
      const rowAliases = rowKey ? targetToAliases.get(rowKey) : undefined;
      return Boolean(rowAliases?.some((c) => c.toLowerCase().includes(q)));
    });
  }, [catalog, catalogFilter, mapping, targetToAliases]);

  const handleSelectSuggestion = (item: CatalogRow, matchedAlias?: string) => {
    onApplyCatalogItem(item, matchedAlias);
    setScanQuery('');
    setDropdownOpen(false);
    setHighlightedIdx(-1);
  };

  const handleScannerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (autocompleteMatches.length > 0) {
        e.preventDefault();
        setDropdownOpen(true);
        setHighlightedIdx((prev) => (prev + 1) % autocompleteMatches.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (autocompleteMatches.length > 0) {
        e.preventDefault();
        setDropdownOpen(true);
        setHighlightedIdx((prev) =>
          prev <= 0 ? autocompleteMatches.length - 1 : prev - 1
        );
      }
      return;
    }

    if (e.key === 'Escape') {
      setDropdownOpen(false);
      setHighlightedIdx(-1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownOpen && highlightedIdx >= 0 && autocompleteMatches[highlightedIdx]) {
        const picked = autocompleteMatches[highlightedIdx];
        handleSelectSuggestion(picked.row, picked.matchedAlias);
        return;
      }

      const raw = scanQuery.trim();
      if (!raw) return;
      const q = raw.toLowerCase();

      // Primary Search (H:J): match scanned barcode in H -> get I -> look up in A:F
      let match: CatalogRow | undefined;
      let matchedAliasCode: string | undefined;

      const resolveRowByKey = (key: string): CatalogRow | undefined => {
        const direct = productByPrimaryCol.get(key) || productByKey.get(key);
        if (direct) return direct;
        if (/^\d+$/.test(key)) {
          return productByNumericKey.get(key.replace(/^0+/, '') || '0');
        }
        return undefined;
      };

      const aliasTarget = aliasToTarget.get(q);
      if (aliasTarget) {
        match = resolveRowByKey(aliasTarget);
        if (match) matchedAliasCode = raw;
      }

      // Secondary Search (A:F): direct key lookup if not found in H:J
      if (!match) {
        match = productByPrimaryCol.get(q) || productByKey.get(q);
      }

      // Numeric leading-zero safeguard if exact H:J and A:F both missed
      if (!match && /^\d+$/.test(q)) {
        const stripped = q.replace(/^0+/, '') || '0';
        const altTarget = aliasByNumericCode.get(stripped);
        if (altTarget) {
          match = resolveRowByKey(altTarget);
          if (match) matchedAliasCode = raw;
        }
        if (!match) {
          match = productByNumericKey.get(stripped);
        }
      }

      // Stage 3: partial match fallback (if typed manually)
      if (!match && autocompleteMatches[0]) {
        match = autocompleteMatches[0].row;
        matchedAliasCode = autocompleteMatches[0].matchedAlias;
      }

      if (match) {
        handleSelectSuggestion(match, matchedAliasCode);
      } else {
        onScanNotFound(raw);
        setDropdownOpen(false);
      }
    }
  };

  const wMm = (
    (210 - grid.marginX * 2 - grid.gapX * Math.max(0, grid.cols - 1)) /
    grid.cols
  ).toFixed(1);
  const hMm = (
    (297 - grid.marginY * 2 - grid.gapY * Math.max(0, grid.rows - 1)) /
    grid.rows
  ).toFixed(1);

  const gridPresets = [
    { cols: 2, rows: 5, label: '2 × 5 (10 labels)' },
    { cols: 2, rows: 4, label: '2 × 4 (8 labels)' },
    { cols: 3, rows: 5, label: '3 × 5 (15 labels)' },
    { cols: 3, rows: 7, label: '3 × 7 (21 labels)' },
  ];

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        onUpdateTemplate({ ...template, logoUrl: ev.target.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDropOnDataCard = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDataDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result instanceof ArrayBuffer) {
        onOpenImportModal({ buffer: ev.target.result, filename: file.name });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <aside className="no-print lg:col-span-4 xl:col-span-3 bg-light-surface-container-low border-b lg:border-b-0 lg:border-r border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-lg">
      <div className="flex flex-col gap-gutter-lg">
        {/* Inspector Tabs */}
        <div
          role="tablist"
          aria-label="Studio controls"
          className="grid grid-cols-4 gap-gutter-xs p-gutter-xs rounded-md bg-light-surface-container border border-light-outline-variant"
        >
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                id={`tab-${tab.id}`}
                aria-selected={isSelected}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onTabChange(tab.id)}
                className={`px-gutter-xs py-1.5 rounded-sm font-body text-label-md whitespace-nowrap transition-colors duration-state-change cursor-pointer ${
                  isSelected
                    ? 'bg-light-surface-container-lowest text-light-primary shadow-sm'
                    : 'text-light-on-surface-variant hover:text-light-on-surface'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: SCAN & FILL */}
        {activeTab === 'scan' && (
          <div
            role="tabpanel"
            id="panel-scan"
            aria-labelledby="tab-scan"
            className="flex flex-col gap-gutter-lg"
          >
            {/* Barcode Scanner Card */}
            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg shadow-sm flex flex-col gap-gutter-md">
              <header className="flex items-center justify-between">
                <div className="flex items-center gap-gutter-xs">
                  <span className="material-symbols-outlined text-title-md text-light-primary" aria-hidden="true">
                    barcode_scanner
                  </span>
                  <h2 className="font-body text-title-md text-light-on-surface">
                    USB / BT Scanner
                  </h2>
                </div>
                <span className="font-mono text-mono-sm bg-light-secondary-container text-light-on-secondary-container px-gutter-sm py-0.5 rounded-full tabular-nums">
                  Slot #{activeSlot + 1}
                </span>
              </header>

              <div className="relative">
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-body text-label-md text-light-on-surface-variant">
                    Scan barcode or search SKU
                  </span>
                  <div className="relative flex items-center">
                    <span
                      className="material-symbols-outlined text-title-lg text-light-primary absolute left-3 pointer-events-none"
                      aria-hidden="true"
                    >
                      barcode
                    </span>
                    <input
                      ref={scannerInputRef}
                      id="scanner-input"
                      type="text"
                      autoComplete="off"
                      value={scanQuery}
                      onChange={(e) => {
                        setScanQuery(e.target.value);
                        setDropdownOpen(true);
                        setHighlightedIdx(-1);
                      }}
                      onFocus={() => {
                        if (scanQuery.trim()) setDropdownOpen(true);
                      }}
                      onBlur={() => {
                        setTimeout(() => setDropdownOpen(false), 150);
                      }}
                      onKeyDown={handleScannerKeyDown}
                      placeholder="Scan SKU101203 or type name..."
                      className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant pl-10 pr-gutter-md py-gutter-sm font-mono text-mono-md text-light-on-surface placeholder:text-light-outline focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none transition-colors duration-state-change"
                    />
                  </div>
                </label>

                {dropdownOpen && autocompleteMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-md bg-light-surface-container-lowest border border-light-outline-variant shadow-md divide-y divide-light-outline-variant">
                    {autocompleteMatches.map(({ row: m, matchedAlias }, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(m, matchedAlias);
                        }}
                        className={`w-full text-left px-gutter-md py-gutter-sm flex items-center justify-between gap-gutter-sm transition-colors cursor-pointer ${
                          idx === highlightedIdx
                            ? 'bg-light-surface-container'
                            : 'hover:bg-light-surface-container-low'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-body text-label-md text-light-on-surface truncate">
                            {m[mapping.description] || ''}
                          </div>
                          <div className="font-mono text-mono-sm text-light-outline truncate">
                            {matchedAlias ? `${matchedAlias} → ` : ''}
                            {m[mapping.lookup] || m[mapping.sku] || ''}
                          </div>
                        </div>
                        <span className="font-body text-label-lg text-light-primary tabular-nums shrink-0">
                          {m[mapping.price] || ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {aliases.length > 0 && (
                <p className="font-mono text-mono-sm text-light-on-surface-variant">
                  1° {aliasMeta?.codeCol || 'Codigo'} (H:J · {aliases.length}) → 2° {mapping.lookup} (A:F)
                </p>
              )}

              {scanFeedback && (
                <div
                  role="status"
                  className={`rounded px-gutter-sm py-gutter-xs font-body text-label-md flex items-center gap-gutter-xs ${
                    scanFeedback.isSuccess
                      ? 'bg-success-container text-on-success-container'
                      : 'bg-light-error-container text-light-on-error-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-body-md shrink-0" aria-hidden="true">
                    {scanFeedback.isSuccess ? 'check_circle' : 'error'}
                  </span>
                  <span>{scanFeedback.message}</span>
                </div>
              )}

              <label className="flex items-center justify-between pt-gutter-xs border-t border-light-outline-variant cursor-pointer">
                <span className="font-body text-body-md text-light-on-surface-variant">
                  Auto-advance to next slot
                </span>
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => onAutoAdvanceChange(e.target.checked)}
                  className="rounded border-light-outline-variant text-light-primary focus:ring-light-primary cursor-pointer"
                />
              </label>
            </article>

            {/* Active Slot Manual Editor */}
            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-md">
              <header className="flex items-center justify-between gap-gutter-sm">
                <h2 className="font-body text-title-md text-light-on-surface">
                  Edit Sticker
                </h2>
                <div className="flex items-center gap-gutter-xs shrink-0">
                  <button
                    type="button"
                    onClick={onDuplicateActiveToAll}
                    title="Fill all slots with this sticker"
                    className="inline-flex items-center gap-1 px-gutter-sm py-1 rounded bg-light-surface-container text-light-on-surface-variant hover:text-light-on-surface font-body text-label-sm whitespace-nowrap transition-colors duration-state-change cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-body-md" aria-hidden="true">
                      content_copy
                    </span>
                    <span>Fill All</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearActiveSlot}
                    title="Clear this slot"
                    aria-label="Clear selected slot"
                    className="inline-flex items-center justify-center w-7 h-7 rounded bg-light-surface-container text-light-on-surface-variant hover:text-light-error transition-colors duration-state-change cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-body-md" aria-hidden="true">
                      delete
                    </span>
                  </button>
                </div>
              </header>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Price
                </span>
                <input
                  type="text"
                  data-slot-edit="true"
                  value={slotData.price}
                  onChange={(e) => onUpdateSlotField('price', e.target.value)}
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-sm font-body text-body-md text-light-on-surface tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Description
                </span>
                <input
                  type="text"
                  data-slot-edit="true"
                  value={slotData.description}
                  onChange={(e) => onUpdateSlotField('description', e.target.value)}
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-sm font-body text-body-md text-light-on-surface focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  SKU / Code
                </span>
                <input
                  type="text"
                  data-slot-edit="true"
                  value={slotData.sku}
                  onChange={(e) => onUpdateSlotField('sku', e.target.value)}
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-sm font-mono text-mono-md text-light-on-surface focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                />
              </label>

              <p className="pt-gutter-xs border-t border-light-outline-variant font-mono text-mono-sm text-light-outline">
                ↑↓←→ Move slot · Enter Confirm · Ctrl+C/V Copy/Paste
              </p>
            </article>
          </div>
        )}

        {/* TAB 2: A4 GRID & MARGINS */}
        {activeTab === 'grid' && (
          <div
            role="tabpanel"
            id="panel-grid"
            aria-labelledby="tab-grid"
            className="flex flex-col gap-gutter-lg"
          >
            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-md">
              <header className="flex items-center justify-between">
                <h2 className="font-body text-title-md text-light-on-surface">
                  Grid Presets
                </h2>
                <span className="font-mono text-mono-sm text-light-primary tabular-nums">
                  {wMm} × {hMm} mm
                </span>
              </header>

              <div className="grid grid-cols-2 gap-gutter-sm">
                {gridPresets.map((preset) => {
                  const isActive =
                    grid.cols === preset.cols && grid.rows === preset.rows;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        onUpdateGrid({ ...grid, cols: preset.cols, rows: preset.rows })
                      }
                      className={`px-gutter-sm py-gutter-sm rounded border font-body text-label-md whitespace-nowrap transition-colors duration-state-change cursor-pointer ${
                        isActive
                          ? 'border-light-primary bg-light-secondary-container/40 text-light-primary font-semibold'
                          : 'border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container text-light-on-surface'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-gutter-md pt-gutter-sm border-t border-light-outline-variant">
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-body text-label-md text-light-on-surface-variant">
                    Columns
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={grid.cols}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1));
                      onUpdateGrid({ ...grid, cols: val });
                    }}
                    className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-body text-label-md text-light-on-surface-variant">
                    Rows
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={grid.rows}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1));
                      onUpdateGrid({ ...grid, rows: val });
                    }}
                    className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                  />
                </label>
              </div>
            </article>

            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-md">
              <h2 className="font-body text-title-md text-light-on-surface">
                A4 Margins &amp; Gaps (mm)
              </h2>
              <div className="grid grid-cols-2 gap-gutter-md">
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-body text-label-md text-light-on-surface-variant">
                    Top / Bottom
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    step={1}
                    value={grid.marginY}
                    onChange={(e) =>
                      onUpdateGrid({
                        ...grid,
                        marginY: Math.max(0, Math.min(40, parseFloat(e.target.value) || 0)),
                      })
                    }
                    className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-body text-label-md text-light-on-surface-variant">
                    Left / Right
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    step={1}
                    value={grid.marginX}
                    onChange={(e) =>
                      onUpdateGrid({
                        ...grid,
                        marginX: Math.max(0, Math.min(40, parseFloat(e.target.value) || 0)),
                      })
                    }
                    className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-body text-label-md text-light-on-surface-variant">
                    Column Gap
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={grid.gapX}
                    onChange={(e) =>
                      onUpdateGrid({
                        ...grid,
                        gapX: Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)),
                      })
                    }
                    className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-gutter-xs">
                  <span className="font-body text-label-md text-light-on-surface-variant">
                    Row Gap
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={1}
                    value={grid.gapY}
                    onChange={(e) =>
                      onUpdateGrid({
                        ...grid,
                        gapY: Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)),
                      })
                    }
                    className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                  />
                </label>
              </div>
            </article>
          </div>
        )}

        {/* TAB 3: TEMPLATE DESIGN (LOGO, BORDER, TYPOGRAPHY) */}
        {activeTab === 'template' && (
          <div
            role="tabpanel"
            id="panel-template"
            aria-labelledby="tab-template"
            className="flex flex-col gap-gutter-lg"
          >
            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-md">
              <h2 className="font-body text-title-md text-light-on-surface">
                Brand Header &amp; Logo
              </h2>
              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Brand Text
                </span>
                <input
                  type="text"
                  value={template.brand}
                  onChange={(e) =>
                    onUpdateTemplate({ ...template, brand: e.target.value })
                  }
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-headline text-body-md focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                />
              </label>

              <div className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Custom Logo Image (optional)
                </span>
                <div className="flex items-center gap-gutter-sm">
                  <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded border border-light-outline-variant bg-light-surface-container-low hover:bg-light-surface-container font-body text-label-md text-light-on-surface whitespace-nowrap">
                    <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                      upload_file
                    </span>
                    <span>Upload Logo</span>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (logoInputRef.current) logoInputRef.current.value = '';
                      onUpdateTemplate({ ...template, logoUrl: null });
                    }}
                    className="px-gutter-sm py-gutter-xs rounded border border-light-outline-variant text-light-on-surface-variant hover:text-light-on-surface font-body text-label-md whitespace-nowrap cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <label className="flex items-center justify-between pt-gutter-xs border-t border-light-outline-variant cursor-pointer">
                <span className="font-body text-body-md text-light-on-surface-variant">
                  Show brand header
                </span>
                <input
                  type="checkbox"
                  checked={template.showBrand}
                  onChange={(e) =>
                    onUpdateTemplate({ ...template, showBrand: e.target.checked })
                  }
                  className="rounded border-light-outline-variant text-light-primary focus:ring-light-primary cursor-pointer"
                />
              </label>
            </article>

            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-md">
              <div className="flex items-center justify-between">
                <h2 className="font-body text-title-md text-light-on-surface">
                  Border &amp; Field Sizes
                </h2>
                {(template.brandScale !== 100 ||
                  template.priceScale !== 100 ||
                  template.descriptionScale !== 100 ||
                  template.skuScale !== 100) && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateTemplate({
                        ...template,
                        brandScale: 100,
                        priceScale: 100,
                        descriptionScale: 100,
                        skuScale: 100,
                      })
                    }
                    className="font-body text-label-sm text-light-primary hover:underline cursor-pointer"
                  >
                    Reset Sizes
                  </button>
                )}
              </div>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Sticker Frame Style
                </span>
                <select
                  value={template.borderStyle}
                  onChange={(e) =>
                    onUpdateTemplate({
                      ...template,
                      borderStyle: e.target.value as BorderStyle,
                    })
                  }
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-body text-body-md focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                >
                  <option value="notched-double">Ornate Notched Double</option>
                  <option value="simple-double">Classic Double Line</option>
                  <option value="rounded-single">Rounded Hairline</option>
                  <option value="none">Borderless (Pre-cut paper)</option>
                </select>
              </label>

              {(() => {
                const densityScale =
                  Math.min(1, 5 / Math.max(grid.rows, 3)) *
                  Math.min(1, 2 / Math.max(grid.cols, 2));
                const fieldSizeControls: {
                  key: 'brandScale' | 'priceScale' | 'descriptionScale' | 'skuScale';
                  label: string;
                  basePx: number;
                  minPx: number;
                }[] = [
                  { key: 'brandScale', label: 'Brand / Logo Size', basePx: 20, minPx: 6 },
                  { key: 'priceScale', label: 'Price Size', basePx: 32, minPx: 8 },
                  { key: 'descriptionScale', label: 'Description Size', basePx: 9.5, minPx: 5 },
                  { key: 'skuScale', label: 'SKU / Code Size', basePx: 9.5, minPx: 5 },
                ];

                return (
                  <div className="flex flex-col gap-gutter-md pt-gutter-xs border-t border-light-outline-variant">
                    {fieldSizeControls.map(({ key, label, basePx, minPx }) => {
                      const scaleVal = template[key];
                      const renderedPx = Math.max(
                        minPx,
                        Math.round(basePx * densityScale * (scaleVal / 100))
                      );
                      return (
                        <div key={key} className="flex flex-col gap-gutter-xs">
                          <div className="flex items-center justify-between gap-gutter-sm">
                            <span className="font-body text-label-md text-light-on-surface-variant">
                              {label}
                            </span>
                            <div className="flex items-center gap-gutter-xs shrink-0">
                              <span className="font-mono text-mono-sm text-light-outline tabular-nums">
                                {renderedPx}px
                              </span>
                              <input
                                type="number"
                                min={50}
                                max={180}
                                aria-label={`${label} percentage`}
                                value={scaleVal}
                                onChange={(e) => {
                                  const next = Math.max(
                                    50,
                                    Math.min(180, parseInt(e.target.value, 10) || 100)
                                  );
                                  onUpdateTemplate({ ...template, [key]: next });
                                }}
                                className="w-14 rounded bg-light-surface-container-low border border-light-outline-variant px-1.5 py-0.5 text-right font-mono text-mono-sm text-light-on-surface tabular-nums focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                              />
                              <span className="font-mono text-mono-sm text-light-on-surface-variant">
                                %
                              </span>
                            </div>
                          </div>
                          <input
                            type="range"
                            min={50}
                            max={180}
                            step={1}
                            aria-label={label}
                            value={scaleVal}
                            onChange={(e) =>
                              onUpdateTemplate({
                                ...template,
                                [key]: parseInt(e.target.value, 10) || 100,
                              })
                            }
                            className="w-full accent-light-primary cursor-pointer"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </article>
          </div>
        )}

        {/* TAB 4: CSV / JSON DATABASE & FIELD MAPPING */}
        {activeTab === 'data' && (
          <div
            role="tabpanel"
            id="panel-data"
            aria-labelledby="tab-data"
            className="flex flex-col gap-gutter-lg"
          >
            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-md">
              <header className="flex items-center justify-between gap-gutter-sm">
                <h2 className="font-body text-title-md text-light-on-surface">
                  Product Database
                </h2>
                <span className="font-mono text-mono-sm text-light-outline truncate max-w-[140px]">
                  {dbFilename}
                </span>
              </header>

              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenImportModal()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenImportModal();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDataDragging(true);
                }}
                onDragLeave={() => setIsDataDragging(false)}
                onDrop={handleDropOnDataCard}
                className={`cursor-pointer rounded-md border border-dashed p-gutter-md flex flex-col items-center gap-gutter-xs text-center transition-colors duration-state-change focus-visible:outline focus-visible:outline-2 focus-visible:outline-light-primary ${
                  isDataDragging
                    ? 'border-light-primary bg-light-surface-container'
                    : 'border-light-outline bg-light-surface-container-low hover:bg-light-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-headline-md text-light-primary" aria-hidden="true">
                  upload_file
                </span>
                <span className="font-body text-label-lg text-light-on-surface">
                  Import Excel, CSV or JSON
                </span>
                <span className="font-body text-label-sm text-light-outline">
                  Supports .xlsx, .xls, CSV, or JSON
                </span>
              </div>
            </article>

            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-lg flex flex-col gap-gutter-md">
              <h2 className="font-body text-title-md text-light-on-surface">
                Field Mapping
              </h2>

              <label className="flex flex-col gap-gutter-xs">
                <span className="font-body text-label-md text-light-on-surface-variant">
                  Barcode / Lookup Column
                </span>
                <select
                  value={mapping.lookup}
                  onChange={(e) =>
                    onUpdateMapping({ ...mapping, lookup: e.target.value })
                  }
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
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
                  Price Column
                </span>
                <select
                  value={mapping.price}
                  onChange={(e) =>
                    onUpdateMapping({ ...mapping, price: e.target.value })
                  }
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
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
                  Description Column
                </span>
                <select
                  value={mapping.description}
                  onChange={(e) =>
                    onUpdateMapping({ ...mapping, description: e.target.value })
                  }
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
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
                  Display SKU Column
                </span>
                <select
                  value={mapping.sku}
                  onChange={(e) =>
                    onUpdateMapping({ ...mapping, sku: e.target.value })
                  }
                  className="w-full rounded bg-light-surface-container-lowest border border-light-outline-variant px-gutter-md py-gutter-xs font-mono text-mono-md focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </article>

            <article className="rounded-md bg-light-surface-container-lowest border border-light-outline-variant p-gutter-md flex flex-col gap-gutter-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-body text-label-lg text-light-on-surface">
                  Catalog Preview
                </h3>
                <span className="font-body text-label-sm text-light-outline">
                  Click row to fill slot #{activeSlot + 1}
                </span>
              </div>

              <input
                type="search"
                value={catalogFilter}
                onChange={(e) => setCatalogFilter(e.target.value)}
                placeholder="Filter catalog..."
                aria-label="Filter catalog items"
                className="w-full rounded bg-light-surface-container-low border border-light-outline-variant px-gutter-sm py-1 font-body text-body-md text-light-on-surface placeholder:text-light-outline focus:border-light-primary focus:ring-1 focus:ring-light-primary focus:outline-none"
              />

              <div className="max-h-48 overflow-y-auto divide-y divide-light-outline-variant">
                {filteredCatalogPreview.length === 0 ? (
                  <div className="py-gutter-md text-center font-body text-body-md text-light-outline">
                    No matching items
                  </div>
                ) : (
                  filteredCatalogPreview.slice(0, 50).map((item, idx) => {
                    const keyLower = String(item[mapping.lookup] || '').trim().toLowerCase();
                    const itemAliases = keyLower ? targetToAliases.get(keyLower) : undefined;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onApplyCatalogItem(item, itemAliases?.[0])}
                        className="w-full text-left py-1.5 px-1 hover:bg-light-surface-container-low flex items-center justify-between gap-gutter-sm cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-body text-label-md text-light-on-surface truncate">
                            {item[mapping.description] || ''}
                          </div>
                          <div className="font-mono text-mono-sm text-light-outline truncate">
                            {itemAliases && itemAliases.length > 0
                              ? `${itemAliases[0]} → `
                              : ''}
                            {item[mapping.lookup] || ''}
                          </div>
                        </div>
                        <span className="font-body text-label-md text-light-primary tabular-nums shrink-0">
                          {item[mapping.price] || ''}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </article>
          </div>
        )}
      </div>

      {/* Studio Settings Persistence */}
      <div className="mt-auto pt-gutter-md border-t border-light-outline-variant flex flex-col gap-gutter-sm">
        <div className="flex items-center justify-between gap-gutter-sm">
          <span className="font-body text-label-md text-light-on-surface">
            Studio Settings
          </span>
          <span className="font-mono text-mono-sm text-light-on-surface-variant">
            {settingsNotice
              ? settingsNotice
              : hasUnsavedChanges
                ? 'Unsaved changes'
                : hasSavedSettings
                  ? 'Saved'
                  : 'Defaults'}
          </span>
        </div>

        <div className="flex items-center gap-gutter-sm">
          <button
            type="button"
            onClick={onSaveSettings}
            className="flex-1 inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-xs rounded bg-light-surface-container-lowest text-light-primary border border-light-outline-variant hover:bg-light-surface-container font-body text-label-md whitespace-nowrap transition-colors duration-state-change cursor-pointer"
          >
            <span className="material-symbols-outlined text-title-md" aria-hidden="true">
              save
            </span>
            <span>Save Settings</span>
          </button>

          {(hasSavedSettings || hasUnsavedChanges) && (
            <button
              type="button"
              onClick={onResetSavedSettings}
              title="Clear saved settings and restore defaults"
              className="px-gutter-sm py-gutter-xs rounded border border-light-outline-variant bg-light-surface-container-lowest text-light-on-surface-variant hover:text-light-error hover:bg-light-surface-container font-body text-label-md whitespace-nowrap transition-colors duration-state-change cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="font-body text-label-sm text-light-on-surface-variant">
            Auto-save changes across sessions
          </span>
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => onToggleAutoSave(e.target.checked)}
            className="rounded border-light-outline-variant text-light-primary focus:ring-light-primary cursor-pointer"
          />
        </label>
      </div>
    </aside>
  );
};
