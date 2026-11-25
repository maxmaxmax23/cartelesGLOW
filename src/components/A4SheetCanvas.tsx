import React from 'react';
import { GridConfig, StickerSlot, TemplateConfig, ZoomLevel } from '../types';
import { StickerBorderSvg } from './StickerBorderSvg';

interface A4SheetCanvasProps {
  grid: GridConfig;
  template: TemplateConfig;
  slots: StickerSlot[];
  activeSlot: number;
  zoom: ZoomLevel;
  onSelectSlot: (index: number) => void;
}

export const A4SheetCanvas: React.FC<A4SheetCanvasProps> = ({
  grid,
  template,
  slots,
  activeSlot,
  zoom,
  onSelectSlot,
}) => {
  const { cols, rows, marginY, marginX, gapX, gapY } = grid;
  const totalSlots = cols * rows;

  const densityScale =
    Math.min(1, 5 / Math.max(rows, 3)) * Math.min(1, 2 / Math.max(cols, 2));
  const brandPx = Math.max(
    6,
    Math.round(20 * densityScale * (template.brandScale / 100))
  );
  const logoHeightPx = Math.max(
    8,
    Math.round((20 * densityScale + 6) * (template.brandScale / 100))
  );
  const pricePx = Math.max(
    8,
    Math.round(32 * densityScale * (template.priceScale / 100))
  );
  const descPx = Math.max(
    5,
    Math.round(9.5 * densityScale * (template.descriptionScale / 100))
  );
  const skuPx = Math.max(
    5,
    Math.round(9.5 * densityScale * (template.skuScale / 100))
  );

  return (
    <section
      aria-label="Live A4 sticker sheet preview"
      className="print-stage lg:col-span-8 xl:col-span-9 bg-light-surface-container-high drafting-board-bg p-gutter-xl overflow-auto flex flex-col items-center justify-start"
    >
      <div
        className="a4-zoom-wrapper origin-top transition-transform duration-state-change"
        style={{ transform: `scale(${zoom})` }}
      >
        <div
          id="a4-sheet"
          className="a4-sheet bg-light-surface-container-lowest text-light-on-surface box-border"
          style={{ padding: `${marginY}mm ${marginX}mm` }}
        >
          <div
            id="sticker-grid"
            className="w-full h-full grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              columnGap: `${gapX}mm`,
              rowGap: `${gapY}mm`,
            }}
          >
            {Array.from({ length: totalSlots }).map((_, i) => {
              const slot = slots[i] || { price: '', description: '', sku: '' };
              const isFilled = Boolean(slot.price || slot.description || slot.sku);
              const isActive = i === activeSlot;

              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Sticker slot ${i + 1}${isFilled ? `: ${slot.description || slot.sku}` : ', empty'}`}
                  aria-pressed={isActive}
                  onClick={() => onSelectSlot(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSlot(i);
                    }
                  }}
                  style={{ padding: '3mm 5mm' }}
                  className={`sticker-slot relative flex flex-col items-center justify-center text-center cursor-pointer select-none transition-colors duration-state-change focus-visible:outline focus-visible:outline-2 focus-visible:outline-light-primary ${
                    isActive
                      ? 'outline outline-2 outline-light-primary bg-light-surface-container-low/40'
                      : 'hover:bg-light-surface-container-low/30'
                  }`}
                >
                  <StickerBorderSvg styleType={template.borderStyle} />

                  <span
                    className={`slot-badge absolute top-2 left-3 z-20 px-1 rounded-sm bg-light-surface-container-lowest font-mono text-mono-sm ${
                      isActive ? 'text-light-primary font-semibold' : 'text-light-on-surface-variant'
                    }`}
                  >
                    #{i + 1}
                  </span>

                  <div className="relative z-10 flex flex-col items-center justify-center w-full">
                    {template.showBrand &&
                      (template.logoUrl ? (
                        <img
                          src={template.logoUrl}
                          alt="Brand logo"
                          referrerPolicy="no-referrer"
                          className="object-contain mb-0.5"
                          style={{ height: `${logoHeightPx}px`, maxWidth: '70%' }}
                        />
                      ) : (
                        <div
                          className="font-headline uppercase tracking-widest text-light-on-surface"
                          style={{ fontSize: `${brandPx}px`, fontWeight: 300, lineHeight: 1.05 }}
                        >
                          {template.brand}
                        </div>
                      ))}

                    {isFilled ? (
                      <>
                        <div
                          className="font-body font-bold text-light-on-surface tabular-nums my-0.5"
                          style={{ fontSize: `${pricePx}px`, lineHeight: 1.05 }}
                        >
                          {slot.price}
                        </div>
                        <div
                          className="font-body font-bold uppercase text-light-on-surface px-1"
                          style={{ fontSize: `${descPx}px`, lineHeight: 1.2 }}
                        >
                          {slot.description}
                        </div>
                        <div
                          className="font-body font-bold uppercase text-light-on-surface"
                          style={{ fontSize: `${skuPx}px`, lineHeight: 1.2 }}
                        >
                          {slot.sku}
                        </div>
                      </>
                    ) : (
                      <div className="font-mono text-mono-sm text-light-outline mt-1">
                        Empty Slot #{i + 1}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
