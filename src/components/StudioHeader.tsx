import React from 'react';
import { ZoomLevel } from '../types';

interface StudioHeaderProps {
  catalogCount: number;
  filledCount: number;
  totalSlots: number;
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  onClearSheet: () => void;
  onPrint: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  catalogCount,
  filledCount,
  totalSlots,
  zoom,
  onZoomChange,
  onClearSheet,
  onPrint,
}) => {
  const zoomOptions: { label: string; value: ZoomLevel }[] = [
    { label: '65%', value: 0.65 },
    { label: 'Fit', value: 0.82 },
    { label: '100%', value: 1 },
  ];

  return (
    <header className="no-print sticky top-0 z-30 bg-light-surface-container-lowest border-b border-light-outline-variant px-gutter-lg py-gutter-sm flex flex-wrap items-center justify-between gap-gutter-md">
      <div className="flex items-center gap-gutter-md">
        <div className="flex items-center gap-gutter-sm">
          <div className="w-8 h-8 rounded bg-light-primary text-light-on-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-title-lg" aria-hidden="true">
              qr_code_scanner
            </span>
          </div>
          <div>
            <h1 className="font-headline text-title-lg text-light-on-surface leading-none whitespace-nowrap">
              LabelPress
            </h1>
            <p className="font-mono text-mono-sm text-light-on-surface-variant mt-0.5 whitespace-nowrap">
              A4 · 210×297 mm
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-gutter-sm pl-gutter-md border-l border-light-outline-variant">
          <span className="inline-flex items-center gap-1.5 px-gutter-sm py-1 rounded-full bg-success-container text-on-success-container font-body text-label-md whitespace-nowrap shrink-0">
            <span className="material-symbols-outlined text-body-md" aria-hidden="true">
              check_circle
            </span>
            <span>Catalog: {catalogCount} items</span>
          </span>
          <span className="inline-flex items-center px-gutter-sm py-1 rounded-full bg-light-surface-container text-light-on-surface-variant font-mono text-mono-sm tabular-nums whitespace-nowrap shrink-0">
            {filledCount} / {totalSlots} filled
          </span>
        </div>
      </div>

      <div className="flex items-center gap-gutter-sm shrink-0">
        {/* Zoom Controls */}
        <div
          className="hidden md:flex items-center rounded bg-light-surface-container border border-light-outline-variant p-0.5"
          role="group"
          aria-label="Canvas zoom level"
        >
          {zoomOptions.map((opt) => {
            const isActive = zoom === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onZoomChange(opt.value)}
                aria-pressed={isActive}
                className={`px-gutter-sm py-1 rounded-sm font-mono text-mono-sm whitespace-nowrap shrink-0 transition-colors duration-state-change ${
                  isActive
                    ? 'bg-light-surface-container-lowest text-light-primary shadow-sm'
                    : 'text-light-on-surface-variant hover:text-light-on-surface'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Secondary: Clear Sheet */}
        <button
          type="button"
          onClick={onClearSheet}
          className="inline-flex items-center justify-center gap-gutter-xs px-gutter-md py-gutter-sm rounded bg-light-surface-container-lowest text-light-on-surface border border-light-outline-variant hover:bg-light-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-primary transition-colors duration-state-change whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-title-md text-light-on-surface-variant" aria-hidden="true">
            layers_clear
          </span>
          <span className="font-body text-label-lg">Clear Sheet</span>
        </button>

        {/* Primary: Print A4 Sheet */}
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center justify-center gap-gutter-sm px-gutter-lg py-gutter-sm rounded bg-light-primary text-light-on-primary hover:bg-light-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-primary transition-colors duration-state-change whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-title-md" aria-hidden="true">
            print
          </span>
          <span className="font-body text-label-lg">Print A4 Sheet</span>
        </button>
      </div>
    </header>
  );
};
