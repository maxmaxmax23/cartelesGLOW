import React, { useEffect, useRef, useState } from 'react';
import { GridConfig, StickerSlot, TemplateConfig, ZoomLevel } from '../types';
import { formatPriceInput } from '../utils/priceFormat';
import { StickerBorderSvg } from './StickerBorderSvg';

type EditableField = 'brand' | 'price' | 'description' | 'sku';

interface A4SheetCanvasProps {
  grid: GridConfig;
  template: TemplateConfig;
  slots: StickerSlot[];
  activeSlot: number;
  zoom: ZoomLevel;
  onSelectSlot: (index: number) => void;
  onUpdateTemplate: (next: TemplateConfig) => void;
  onUpdateSlotField: (field: keyof StickerSlot, value: string) => void;
}

const OFFSET_KEYS: Record<
  EditableField,
  'brandOffsetY' | 'priceOffsetY' | 'descriptionOffsetY' | 'skuOffsetY'
> = {
  brand: 'brandOffsetY',
  price: 'priceOffsetY',
  description: 'descriptionOffsetY',
  sku: 'skuOffsetY',
};

export const A4SheetCanvas: React.FC<A4SheetCanvasProps> = ({
  grid,
  template,
  slots,
  activeSlot,
  zoom,
  onSelectSlot,
  onUpdateTemplate,
  onUpdateSlotField,
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

  const scaledOffset = (offsetPx: number) =>
    Math.round(offsetPx * densityScale * 10) / 10;
  const scaledTracking = (trackingPx: number) =>
    Math.round(trackingPx * densityScale * 10) / 10;

  const [editingTarget, setEditingTarget] = useState<{
    slotIndex: number;
    field: EditableField;
  } | null>(null);
  const [draggingField, setDraggingField] = useState<EditableField | null>(null);

  const dragRef = useRef<{
    field: EditableField;
    startClientY: number;
    startOffsetY: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const templateRef = useRef(template);
  templateRef.current = template;

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dyScreen = e.clientY - drag.startClientY;
      if (!drag.moved && Math.abs(dyScreen) < 3) return;

      if (!drag.moved) {
        drag.moved = true;
        setDraggingField(drag.field);
      }

      const dyLogical = dyScreen / (zoom * densityScale);
      const rawNext = drag.startOffsetY + dyLogical;
      const snapped = Math.round(rawNext * 2) / 2;
      const clamped = Math.max(-40, Math.min(40, snapped));

      const offsetKey = OFFSET_KEYS[drag.field];
      onUpdateTemplate({
        ...templateRef.current,
        [offsetKey]: clamped,
      });
    };

    const handlePointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.moved) {
        suppressNextClickRef.current = true;
        setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 50);
      }
      dragRef.current = null;
      setDraggingField(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [zoom, densityScale, onUpdateTemplate]);

  useEffect(() => {
    if (editingTarget && editingTarget.slotIndex !== activeSlot) {
      setEditingTarget(null);
    }
  }, [activeSlot, editingTarget]);

  const startFieldDrag = (
    e: React.PointerEvent,
    slotIndex: number,
    field: EditableField
  ) => {
    if (slotIndex !== activeSlot) return;
    if (
      editingTarget &&
      editingTarget.slotIndex === slotIndex &&
      editingTarget.field === field
    ) {
      return;
    }
    if (e.button !== 0) return;

    dragRef.current = {
      field,
      startClientY: e.clientY,
      startOffsetY: template[OFFSET_KEYS[field]],
      moved: false,
    };
  };

  const startInlineEdit = (
    e: React.MouseEvent,
    slotIndex: number,
    field: EditableField
  ) => {
    e.stopPropagation();
    if (slotIndex !== activeSlot) {
      onSelectSlot(slotIndex);
    }
    setEditingTarget({ slotIndex, field });
  };

  const renderInlineInput = (
    value: string,
    onChange: (val: string) => void,
    style: React.CSSProperties,
    extraClass: string,
    ariaLabel: string,
    placeholder?: string
  ) => (
    <input
      type="text"
      autoFocus
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => setEditingTarget(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setEditingTarget(null);
        }
      }}
      style={style}
      className={`w-full bg-light-surface-container-lowest/90 text-center border border-light-primary rounded-sm px-1 outline-none ${extraClass}`}
    />
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

              const activeFieldInteractiveClass = (field: EditableField) =>
                isActive
                  ? `cursor-ns-resize rounded-sm transition-colors ${
                      draggingField === field
                        ? 'outline outline-1 outline-light-primary bg-light-secondary-container/20'
                        : 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-light-primary/60'
                    }`
                  : '';

              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Sticker slot ${i + 1}${isFilled ? `: ${slot.description || slot.sku}` : ', empty'}`}
                  aria-pressed={isActive}
                  onClick={() => {
                    if (suppressNextClickRef.current) return;
                    if (editingTarget) return;
                    onSelectSlot(i);
                  }}
                  onKeyDown={(e) => {
                    if (editingTarget) return;
                    if (e.key === ' ') {
                      e.preventDefault();
                      onSelectSlot(i);
                    } else if (e.key === 'Enter' && i !== activeSlot) {
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
                      isActive
                        ? 'text-light-primary font-semibold'
                        : 'text-light-on-surface-variant'
                    }`}
                  >
                    #{i + 1}
                  </span>

                  <div className="relative z-10 flex flex-col items-center justify-center w-full">
                    {template.showBrand &&
                      (template.logoUrl ? (
                        <div
                          onPointerDown={(e) => startFieldDrag(e, i, 'brand')}
                          title={isActive ? 'Drag vertically to move logo' : undefined}
                          className={`mb-0.5 flex justify-center w-full ${activeFieldInteractiveClass('brand')}`}
                          style={{
                            transform: `translateY(${scaledOffset(template.brandOffsetY)}px)`,
                          }}
                        >
                          <img
                            src={template.logoUrl}
                            alt="Brand logo"
                            referrerPolicy="no-referrer"
                            draggable={false}
                            className="object-contain"
                            style={{ height: `${logoHeightPx}px`, maxWidth: '70%' }}
                          />
                        </div>
                      ) : editingTarget?.slotIndex === i &&
                        editingTarget.field === 'brand' ? (
                        <div
                          className="w-full"
                          style={{
                            transform: `translateY(${scaledOffset(template.brandOffsetY)}px)`,
                          }}
                        >
                          {renderInlineInput(
                            template.brand,
                            (val) => onUpdateTemplate({ ...template, brand: val }),
                            {
                              fontSize: `${brandPx}px`,
                              fontWeight: 300,
                              lineHeight: 1.05,
                              letterSpacing: `${scaledTracking(template.brandLetterSpacing)}px`,
                            },
                            'font-headline uppercase text-light-on-surface',
                            'Edit brand header'
                          )}
                        </div>
                      ) : (
                        <div
                          onPointerDown={(e) => startFieldDrag(e, i, 'brand')}
                          onDoubleClick={(e) => startInlineEdit(e, i, 'brand')}
                          title={
                            isActive
                              ? 'Drag vertically to move · Double-click to edit brand'
                              : undefined
                          }
                          className={`font-headline uppercase text-light-on-surface px-1 ${activeFieldInteractiveClass('brand')}`}
                          style={{
                            fontSize: `${brandPx}px`,
                            fontWeight: 300,
                            lineHeight: 1.05,
                            letterSpacing: `${scaledTracking(template.brandLetterSpacing)}px`,
                            transform: `translateY(${scaledOffset(template.brandOffsetY)}px)`,
                          }}
                        >
                          {template.brand}
                        </div>
                      ))}

                    {isFilled || (isActive && editingTarget?.slotIndex === i) ? (
                      <>
                        {/* Price */}
                        {editingTarget?.slotIndex === i &&
                        editingTarget.field === 'price' ? (
                          <div
                            className="w-full my-0.5"
                            style={{
                              transform: `translateY(${scaledOffset(template.priceOffsetY)}px)`,
                            }}
                          >
                            {renderInlineInput(
                              slot.price,
                              (val) => onUpdateSlotField('price', formatPriceInput(val)),
                              {
                                fontSize: `${pricePx}px`,
                                lineHeight: 1.05,
                                letterSpacing: `${scaledTracking(template.priceLetterSpacing)}px`,
                              },
                              'font-body font-bold text-light-on-surface tabular-nums',
                              'Edit sticker price',
                              '$52.900'
                            )}
                          </div>
                        ) : (
                          <div
                            onPointerDown={(e) => startFieldDrag(e, i, 'price')}
                            onDoubleClick={(e) => startInlineEdit(e, i, 'price')}
                            title={
                              isActive
                                ? 'Drag vertically to move · Double-click to edit price'
                                : undefined
                            }
                            className={`font-body font-bold text-light-on-surface tabular-nums my-0.5 px-1 min-h-[1em] ${activeFieldInteractiveClass('price')}`}
                            style={{
                              fontSize: `${pricePx}px`,
                              lineHeight: 1.05,
                              letterSpacing: `${scaledTracking(template.priceLetterSpacing)}px`,
                              transform: `translateY(${scaledOffset(template.priceOffsetY)}px)`,
                            }}
                          >
                            {slot.price || (isActive ? '$0' : '')}
                          </div>
                        )}

                        {/* Description */}
                        {editingTarget?.slotIndex === i &&
                        editingTarget.field === 'description' ? (
                          <div
                            className="w-full"
                            style={{
                              transform: `translateY(${scaledOffset(template.descriptionOffsetY)}px)`,
                            }}
                          >
                            {renderInlineInput(
                              slot.description,
                              (val) => onUpdateSlotField('description', val),
                              {
                                fontSize: `${descPx}px`,
                                lineHeight: 1.2,
                                letterSpacing: `${scaledTracking(template.descriptionLetterSpacing)}px`,
                              },
                              'font-body font-bold uppercase text-light-on-surface',
                              'Edit sticker description',
                              'DESCRIPTION'
                            )}
                          </div>
                        ) : (
                          <div
                            onPointerDown={(e) => startFieldDrag(e, i, 'description')}
                            onDoubleClick={(e) => startInlineEdit(e, i, 'description')}
                            title={
                              isActive
                                ? 'Drag vertically to move · Double-click to edit description'
                                : undefined
                            }
                            className={`font-body font-bold uppercase text-light-on-surface px-1 min-h-[1em] ${activeFieldInteractiveClass('description')}`}
                            style={{
                              fontSize: `${descPx}px`,
                              lineHeight: 1.2,
                              letterSpacing: `${scaledTracking(template.descriptionLetterSpacing)}px`,
                              transform: `translateY(${scaledOffset(template.descriptionOffsetY)}px)`,
                            }}
                          >
                            {slot.description}
                          </div>
                        )}

                        {/* SKU / Code */}
                        {editingTarget?.slotIndex === i &&
                        editingTarget.field === 'sku' ? (
                          <div
                            className="w-full"
                            style={{
                              transform: `translateY(${scaledOffset(template.skuOffsetY)}px)`,
                            }}
                          >
                            {renderInlineInput(
                              slot.sku,
                              (val) => onUpdateSlotField('sku', val),
                              {
                                fontSize: `${skuPx}px`,
                                lineHeight: 1.2,
                                letterSpacing: `${scaledTracking(template.skuLetterSpacing)}px`,
                              },
                              'font-body font-bold uppercase text-light-on-surface',
                              'Edit sticker SKU',
                              'SKU'
                            )}
                          </div>
                        ) : (
                          <div
                            onPointerDown={(e) => startFieldDrag(e, i, 'sku')}
                            onDoubleClick={(e) => startInlineEdit(e, i, 'sku')}
                            title={
                              isActive
                                ? 'Drag vertically to move · Double-click to edit SKU'
                                : undefined
                            }
                            className={`font-body font-bold uppercase text-light-on-surface px-1 min-h-[1em] ${activeFieldInteractiveClass('sku')}`}
                            style={{
                              fontSize: `${skuPx}px`,
                              lineHeight: 1.2,
                              letterSpacing: `${scaledTracking(template.skuLetterSpacing)}px`,
                              transform: `translateY(${scaledOffset(template.skuOffsetY)}px)`,
                            }}
                          >
                            {slot.sku}
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        onDoubleClick={(e) => startInlineEdit(e, i, 'price')}
                        className="font-mono text-mono-sm text-light-outline mt-1"
                      >
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
