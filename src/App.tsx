import { useRef, useState } from 'react';
import { A4SheetCanvas } from './components/A4SheetCanvas';
import { ImportDatabaseModal } from './components/ImportDatabaseModal';
import { InspectorSidebar } from './components/InspectorSidebar';
import { StudioHeader } from './components/StudioHeader';
import { DEFAULT_CATALOG, DEFAULT_COLUMNS } from './data/defaultCatalog';
import {
  CatalogAlias,
  CatalogRow,
  FieldMapping,
  GridConfig,
  StickerSlot,
  StudioTab,
  TemplateConfig,
  ZoomLevel,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('scan');
  const [zoom, setZoom] = useState<ZoomLevel>(0.82);

  const [catalog, setCatalog] = useState<CatalogRow[]>(DEFAULT_CATALOG);
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [aliases, setAliases] = useState<CatalogAlias[]>([]);
  const [dbFilename, setDbFilename] = useState<string>('sample_glowup.json');
  const [mapping, setMapping] = useState<FieldMapping>({
    lookup: 'sku',
    price: 'price',
    description: 'description',
    sku: 'sku',
  });

  const [grid, setGrid] = useState<GridConfig>({
    cols: 2,
    rows: 5,
    marginY: 10,
    marginX: 14,
    gapX: 6,
    gapY: 4,
  });

  const [template, setTemplate] = useState<TemplateConfig>({
    brand: 'GLOWUP',
    logoUrl: null,
    showBrand: true,
    borderStyle: 'notched-double',
    brandScale: 100,
    priceScale: 100,
    descriptionScale: 100,
    skuScale: 100,
  });

  const [slots, setSlots] = useState<StickerSlot[]>(() =>
    DEFAULT_CATALOG.slice(0, 10).map((item) => ({
      price: item.price,
      description: item.description,
      sku: item.sku,
    }))
  );

  const [activeSlot, setActiveSlot] = useState<number>(0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [scanFeedback, setScanFeedback] = useState<{
    message: string;
    isSuccess: boolean;
  } | null>(null);

  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [pendingImportFile, setPendingImportFile] = useState<{
    text: string;
    filename: string;
  } | null>(null);

  const scannerInputRef = useRef<HTMLInputElement | null>(null);

  const totalSlots = grid.cols * grid.rows;

  // Ensure slots array always covers totalSlots
  const normalizedSlots: StickerSlot[] = Array.from({ length: totalSlots }, (_, idx) => {
    return slots[idx] || { price: '', description: '', sku: '' };
  });

  const safeActiveSlot = Math.min(activeSlot, totalSlots - 1);

  const filledCount = normalizedSlots.filter((s) =>
    Boolean(s.price || s.description || s.sku)
  ).length;

  const handleSelectSlot = (index: number) => {
    setActiveSlot(index);
    if (activeTab === 'scan') {
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

  const handleApplyCatalogItem = (item: CatalogRow) => {
    const target = safeActiveSlot;
    const nextItem: StickerSlot = {
      price: String(item[mapping.price] || ''),
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
      message: `Filled Slot #${target + 1} with ${codeLabel}`,
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

  const handleOpenImportModal = (pending?: { text: string; filename: string }) => {
    setPendingImportFile(pending ?? null);
    setImportModalOpen(true);
  };

  const handleApplyImportedDatabase = (payload: {
    catalog: CatalogRow[];
    columns: string[];
    aliases: CatalogAlias[];
    filename: string;
    mapping: FieldMapping;
  }) => {
    setCatalog(payload.catalog);
    setColumns(payload.columns);
    setAliases(payload.aliases);
    setDbFilename(payload.filename);
    setMapping(payload.mapping);
    const aliasMsg =
      payload.aliases.length > 0 ? ` (${payload.aliases.length} barcode aliases)` : '';
    setScanFeedback({
      message: `Loaded ${payload.catalog.length} records${aliasMsg} from ${payload.filename}`,
      isSuccess: true,
    });
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
        />

        <A4SheetCanvas
          grid={grid}
          template={template}
          slots={normalizedSlots}
          activeSlot={safeActiveSlot}
          zoom={zoom}
          onSelectSlot={handleSelectSlot}
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
        initialFilename={dbFilename}
        initialMapping={mapping}
        pendingFile={pendingImportFile}
        onApply={handleApplyImportedDatabase}
      />
    </div>
  );
}
