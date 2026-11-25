import { useEffect, useMemo, useRef, useState } from 'react';
import { A4SheetCanvas } from './components/A4SheetCanvas';
import { ImportDatabaseModal } from './components/ImportDatabaseModal';
import { InspectorSidebar } from './components/InspectorSidebar';
import { StudioHeader } from './components/StudioHeader';
import { DEFAULT_CATALOG, DEFAULT_COLUMNS } from './data/defaultCatalog';
import {
  AliasMeta,
  CatalogAlias,
  CatalogRow,
  FieldMapping,
  GridConfig,
  PendingImportFile,
  StickerSlot,
  StudioTab,
  TemplateConfig,
  ZoomLevel,
} from './types';
import {
  clearStudioSettings,
  DEFAULT_AUTO_ADVANCE,
  DEFAULT_GRID,
  DEFAULT_TEMPLATE,
  DEFAULT_ZOOM,
  loadStudioSettings,
  saveStudioSettings,
} from './utils/settingsStorage';
import { formatCatalogPrice } from './utils/priceFormat';

function serializeSettings(
  template: TemplateConfig,
  grid: GridConfig,
  zoom: ZoomLevel,
  autoAdvance: boolean
): string {
  return JSON.stringify({ template, grid, zoom, autoAdvance });
}

export default function App() {
  const initialLoaded = useMemo(() => loadStudioSettings(), []);

  const [activeTab, setActiveTab] = useState<StudioTab>('scan');
  const [zoom, setZoom] = useState<ZoomLevel>(initialLoaded.settings.zoom);

  const [catalog, setCatalog] = useState<CatalogRow[]>(DEFAULT_CATALOG);
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [aliases, setAliases] = useState<CatalogAlias[]>([]);
  const [aliasMeta, setAliasMeta] = useState<AliasMeta | null>(null);
  const [dbFilename, setDbFilename] = useState<string>('sample_glowup.json');
  const [mapping, setMapping] = useState<FieldMapping>({
    lookup: 'sku',
    price: 'price',
    description: 'description',
    sku: 'sku',
  });

  const [grid, setGrid] = useState<GridConfig>(initialLoaded.settings.grid);
  const [template, setTemplate] = useState<TemplateConfig>(
    initialLoaded.settings.template
  );

  const [slots, setSlots] = useState<StickerSlot[]>(() => {
    const initialCount =
      initialLoaded.settings.grid.cols * initialLoaded.settings.grid.rows;
    return Array.from({ length: initialCount }, (_, i) => {
      const item = DEFAULT_CATALOG[i];
      return item
        ? { price: item.price, description: item.description, sku: item.sku }
        : { price: '', description: '', sku: '' };
    });
  });

  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(
    initialLoaded.settings.autoAdvance
  );
  const [autoSave, setAutoSave] = useState<boolean>(
    initialLoaded.settings.autoSave
  );
  const [hasSavedSettings, setHasSavedSettings] = useState<boolean>(
    initialLoaded.hasSaved
  );
  const [savedSignature, setSavedSignature] = useState<string>(() =>
    initialLoaded.hasSaved
      ? serializeSettings(
          initialLoaded.settings.template,
          initialLoaded.settings.grid,
          initialLoaded.settings.zoom,
          initialLoaded.settings.autoAdvance
        )
      : serializeSettings(
          DEFAULT_TEMPLATE,
          DEFAULT_GRID,
          DEFAULT_ZOOM,
          DEFAULT_AUTO_ADVANCE
        )
  );
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{
    message: string;
    isSuccess: boolean;
  } | null>(null);

  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [pendingImportFile, setPendingImportFile] =
    useState<PendingImportFile | null>(null);
  const [copiedSlot, setCopiedSlot] = useState<StickerSlot | null>(null);

  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const lastCopiedTextRef = useRef<string | null>(null);

  const totalSlots = grid.cols * grid.rows;

  // Ensure slots array always covers totalSlots
  const normalizedSlots: StickerSlot[] = Array.from({ length: totalSlots }, (_, idx) => {
    return slots[idx] || { price: '', description: '', sku: '' };
  });

  const safeActiveSlot = Math.min(activeSlot, totalSlots - 1);

  const filledCount = normalizedSlots.filter((s) =>
    Boolean(s.price || s.description || s.sku)
  ).length;

  useEffect(() => {
    const confirmCurrentSlot = () => {
      const slot = normalizedSlots[safeActiveSlot];
      const label = slot.sku || slot.description || slot.price;
      setScanFeedback({
        message: label
          ? `Confirmed Slot #${safeActiveSlot + 1} (${label})`
          : `Confirmed Slot #${safeActiveSlot + 1}`,
        isSuccess: true,
      });
      if (autoAdvance) {
        setActiveSlot((safeActiveSlot + 1) % totalSlots);
      }
      if (activeTab === 'scan') {
        scannerInputRef.current?.focus();
      }
    };

    const copyCurrentSlot = () => {
      const slot = normalizedSlots[safeActiveSlot];
      setCopiedSlot({ ...slot });
      const textRep = [slot.price, slot.description, slot.sku]
        .filter(Boolean)
        .join(' | ');
      lastCopiedTextRef.current = textRep;
      if (textRep && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(textRep).catch(() => {});
      }
      setScanFeedback({
        message: slot.sku
          ? `Copied Slot #${safeActiveSlot + 1} (${slot.sku})`
          : `Copied Slot #${safeActiveSlot + 1}`,
        isSuccess: true,
      });
    };

    const pasteIntoCurrentSlot = (source: StickerSlot) => {
      setSlots((prev) => {
        const next = Array.from(
          { length: Math.max(prev.length, totalSlots) },
          (_, i) => prev[i] || { price: '', description: '', sku: '' }
        );
        next[safeActiveSlot] = { ...source };
        return next;
      });
      setScanFeedback({
        message: source.sku
          ? `Pasted ${source.sku} into Slot #${safeActiveSlot + 1}`
          : `Pasted into Slot #${safeActiveSlot + 1}`,
        isSuccess: true,
      });
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (importModalOpen || e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? '';
      const isScanner = target?.id === 'scanner-input';
      const isSlotEdit = target?.dataset?.slotEdit === 'true';
      const isInput = tag === 'input';
      const isTextAreaOrSelect =
        tag === 'textarea' || tag === 'select' || target?.isContentEditable;

      // 1. Ctrl+C / Cmd+C: Copy active slot (unless user highlighted text inside an input/textarea)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        if (isInput || tag === 'textarea') {
          const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
          const hasSelection =
            typeof inputEl.selectionStart === 'number' &&
            typeof inputEl.selectionEnd === 'number' &&
            inputEl.selectionStart !== inputEl.selectionEnd;
          if (hasSelection) return;
          if (!isScanner) return;
        }
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        copyCurrentSlot();
        return;
      }

      // 2. Ctrl+V / Cmd+V: Paste copied slot when not editing a text input
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') {
        if (isInput || isTextAreaOrSelect) {
          // For #scanner-input, handled cleanly in the paste listener below so external barcode paste still works
          return;
        }
        if (copiedSlot) {
          e.preventDefault();
          pasteIntoCurrentSlot(copiedSlot);
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // 3. Arrow Keys: Navigate between slots
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        if (isTextAreaOrSelect) return;
        if (isInput) {
          const inputEl = target as HTMLInputElement;
          // Allow arrow slot navigation from #scanner-input only when it's empty
          if (!isScanner || inputEl.value.length > 0) return;
        }

        e.preventDefault();
        let nextSlot = safeActiveSlot;
        if (e.key === 'ArrowRight') {
          nextSlot = (safeActiveSlot + 1) % totalSlots;
        } else if (e.key === 'ArrowLeft') {
          nextSlot = (safeActiveSlot - 1 + totalSlots) % totalSlots;
        } else if (e.key === 'ArrowDown') {
          nextSlot = (safeActiveSlot + grid.cols) % totalSlots;
        } else if (e.key === 'ArrowUp') {
          nextSlot = (safeActiveSlot - grid.cols + totalSlots) % totalSlots;
        }
        setActiveSlot(nextSlot);
        return;
      }

      // 4. Enter: Confirm current slot
      if (e.key === 'Enter') {
        if (isTextAreaOrSelect || tag === 'button' || tag === 'a') return;
        if (isInput) {
          const inputEl = target as HTMLInputElement;
          if (isScanner) {
            if (inputEl.value.trim().length > 0) return;
          } else if (!isSlotEdit) {
            return;
          }
        }
        e.preventDefault();
        confirmCurrentSlot();
      }
    };

    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (importModalOpen || !copiedSlot) return;
      const target = e.target as HTMLElement | null;
      if (target?.id !== 'scanner-input') return;

      const pastedText = e.clipboardData?.getData('text/plain') ?? '';
      if (
        pastedText === '' ||
        (lastCopiedTextRef.current !== null &&
          pastedText === lastCopiedTextRef.current)
      ) {
        e.preventDefault();
        pasteIntoCurrentSlot(copiedSlot);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [
    importModalOpen,
    normalizedSlots,
    safeActiveSlot,
    totalSlots,
    grid.cols,
    autoAdvance,
    activeTab,
    copiedSlot,
  ]);

  const handleSelectSlot = (index: number) => {
    const isChangingSlot = index !== safeActiveSlot;
    setActiveSlot(index);
    if (isChangingSlot && activeTab === 'scan') {
      setTimeout(() => scannerInputRef.current?.focus(), 0);
    }
  };

  const handleUpdateGrid = (nextGrid: GridConfig) => {
    const nextTotal = nextGrid.cols * nextGrid.rows;
    setGrid(nextGrid);
    setSlots((prev) => {
      if (prev.length >= nextTotal) return prev;
      return [
        ...prev,
        ...Array.from({ length: nextTotal - prev.length }, () => ({
          price: '',
          description: '',
          sku: '',
        })),
      ];
    });
    if (activeSlot >= nextTotal) {
      setActiveSlot(Math.max(0, nextTotal - 1));
    }
  };

  const handleApplyCatalogItem = (item: CatalogRow, matchedCode?: string) => {
    const target = safeActiveSlot;
    const nextItem: StickerSlot = {
      price: formatCatalogPrice(String(item[mapping.price] || '')),
      description: String(item[mapping.description] || ''),
      sku: String(item[mapping.sku] || item[mapping.lookup] || ''),
    };

    setSlots((prev) => {
      const next = Array.from({ length: Math.max(prev.length, totalSlots) }, (_, i) =>
        prev[i] || { price: '', description: '', sku: '' }
      );
      next[target] = nextItem;
      return next;
    });

    const codeLabel = nextItem.sku || 'Item';
    setScanFeedback({
      message: matchedCode
        ? `${matchedCode} → ${codeLabel} · Filled Slot #${target + 1}`
        : `Filled Slot #${target + 1} with ${codeLabel}`,
      isSuccess: true,
    });

    if (autoAdvance) {
      setActiveSlot((target + 1) % totalSlots);
    }
    scannerInputRef.current?.focus();
  };

  const handleScanNotFound = (query: string) => {
    setScanFeedback({
      message: `No match for "${query}" in catalog`,
      isSuccess: false,
    });
  };

  const handleUpdateSlotField = (field: keyof StickerSlot, value: string) => {
    const target = safeActiveSlot;
    setSlots((prev) => {
      const next = Array.from({ length: Math.max(prev.length, totalSlots) }, (_, i) =>
        prev[i] || { price: '', description: '', sku: '' }
      );
      next[target] = { ...next[target], [field]: value };
      return next;
    });
  };

  const handleDuplicateActiveToAll = () => {
    const current = normalizedSlots[safeActiveSlot];
    setSlots(Array.from({ length: totalSlots }, () => ({ ...current })));
    setScanFeedback({
      message: `Copied Slot #${safeActiveSlot + 1} to all ${totalSlots} slots`,
      isSuccess: true,
    });
  };

  const handleClearActiveSlot = () => {
    const target = safeActiveSlot;
    setSlots((prev) => {
      const next = Array.from({ length: Math.max(prev.length, totalSlots) }, (_, i) =>
        prev[i] || { price: '', description: '', sku: '' }
      );
      next[target] = { price: '', description: '', sku: '' };
      return next;
    });
  };

  const handleClearSheet = () => {
    setSlots(
      Array.from({ length: totalSlots }, () => ({
        price: '',
        description: '',
        sku: '',
      }))
    );
    setActiveSlot(0);
    setScanFeedback(null);
  };

  const handleOpenImportModal = (pending?: PendingImportFile) => {
    setPendingImportFile(pending ?? null);
    setImportModalOpen(true);
  };

  const handleApplyImportedDatabase = (payload: {
    catalog: CatalogRow[];
    columns: string[];
    aliases: CatalogAlias[];
    aliasMeta: AliasMeta | null;
    filename: string;
    mapping: FieldMapping;
  }) => {
    setCatalog(payload.catalog);
    setColumns(payload.columns);
    setAliases(payload.aliases);
    setAliasMeta(payload.aliasMeta);
    setDbFilename(payload.filename);
    setMapping(payload.mapping);
    const aliasMsg =
      payload.aliases.length > 0 ? ` (${payload.aliases.length} barcode aliases)` : '';
    setScanFeedback({
      message: `Loaded ${payload.catalog.length} records${aliasMsg} from ${payload.filename}`,
      isSuccess: true,
    });
  };

  const currentSignature = serializeSettings(template, grid, zoom, autoAdvance);
  const hasUnsavedChanges = currentSignature !== savedSignature;

  useEffect(() => {
    if (!autoSave) return;
    const ok = saveStudioSettings({
      template,
      grid,
      zoom,
      autoAdvance,
      autoSave: true,
    });
    if (ok) {
      setHasSavedSettings(true);
      setSavedSignature(currentSignature);
    }
  }, [autoSave, template, grid, zoom, autoAdvance, currentSignature]);

  const handleSaveSettings = () => {
    const ok = saveStudioSettings({
      template,
      grid,
      zoom,
      autoAdvance,
      autoSave,
    });
    if (ok) {
      setHasSavedSettings(true);
      setSavedSignature(currentSignature);
      setSettingsNotice('Saved for future sessions');
    } else {
      setSettingsNotice('Could not save (logo image may be too large)');
    }
    setTimeout(() => setSettingsNotice(null), 2500);
  };

  const handleToggleAutoSave = (nextAutoSave: boolean) => {
    setAutoSave(nextAutoSave);
    if (nextAutoSave) {
      const ok = saveStudioSettings({
        template,
        grid,
        zoom,
        autoAdvance,
        autoSave: true,
      });
      if (ok) {
        setHasSavedSettings(true);
        setSavedSignature(currentSignature);
      }
    } else if (hasSavedSettings) {
      saveStudioSettings({
        template,
        grid,
        zoom,
        autoAdvance,
        autoSave: false,
      });
    }
  };

  const handleResetSavedSettings = () => {
    clearStudioSettings();
    handleUpdateGrid(DEFAULT_GRID);
    setTemplate(DEFAULT_TEMPLATE);
    setZoom(DEFAULT_ZOOM);
    setAutoAdvance(DEFAULT_AUTO_ADVANCE);
    setAutoSave(false);
    setHasSavedSettings(false);
    setSavedSignature(
      serializeSettings(
        DEFAULT_TEMPLATE,
        DEFAULT_GRID,
        DEFAULT_ZOOM,
        DEFAULT_AUTO_ADVANCE
      )
    );
    setSettingsNotice('Restored factory defaults');
    setTimeout(() => setSettingsNotice(null), 2500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-light-surface text-light-on-surface">
      <StudioHeader
        catalogCount={catalog.length}
        filledCount={filledCount}
        totalSlots={totalSlots}
        zoom={zoom}
        onZoomChange={setZoom}
        onClearSheet={handleClearSheet}
        onPrint={() => window.print()}
      />

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <InspectorSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeSlot={safeActiveSlot}
          slotData={normalizedSlots[safeActiveSlot]}
          autoAdvance={autoAdvance}
          onAutoAdvanceChange={setAutoAdvance}
          scannerInputRef={scannerInputRef}
          catalog={catalog}
          columns={columns}
          aliases={aliases}
          aliasMeta={aliasMeta}
          mapping={mapping}
          dbFilename={dbFilename}
          scanFeedback={scanFeedback}
          onApplyCatalogItem={handleApplyCatalogItem}
          onScanNotFound={handleScanNotFound}
          onUpdateSlotField={handleUpdateSlotField}
          onDuplicateActiveToAll={handleDuplicateActiveToAll}
          onClearActiveSlot={handleClearActiveSlot}
          grid={grid}
          onUpdateGrid={handleUpdateGrid}
          template={template}
          onUpdateTemplate={setTemplate}
          onUpdateMapping={setMapping}
          onOpenImportModal={handleOpenImportModal}
          autoSave={autoSave}
          hasSavedSettings={hasSavedSettings}
          hasUnsavedChanges={hasUnsavedChanges}
          settingsNotice={settingsNotice}
          onToggleAutoSave={handleToggleAutoSave}
          onSaveSettings={handleSaveSettings}
          onResetSavedSettings={handleResetSavedSettings}
        />

        <A4SheetCanvas
          grid={grid}
          template={template}
          slots={normalizedSlots}
          activeSlot={safeActiveSlot}
          zoom={zoom}
          onSelectSlot={handleSelectSlot}
          onUpdateTemplate={setTemplate}
          onUpdateSlotField={handleUpdateSlotField}
        />
      </main>

      <ImportDatabaseModal
        isOpen={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setPendingImportFile(null);
        }}
        initialCatalog={catalog}
        initialColumns={columns}
        initialAliases={aliases}
        initialAliasMeta={aliasMeta}
        initialFilename={dbFilename}
        initialMapping={mapping}
        pendingFile={pendingImportFile}
        onApply={handleApplyImportedDatabase}
      />
    </div>
  );
}
