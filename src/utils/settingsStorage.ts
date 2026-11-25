import { GridConfig, TemplateConfig, ZoomLevel } from '../types';

const STORAGE_KEY = 'labelpress_studio_settings_v1';

export const DEFAULT_GRID: GridConfig = {
  cols: 2,
  rows: 5,
  marginY: 10,
  marginX: 14,
  gapX: 6,
  gapY: 4,
};

export const DEFAULT_TEMPLATE: TemplateConfig = {
  brand: 'GLOWUP',
  logoUrl: null,
  showBrand: true,
  borderStyle: 'notched-double',
  brandScale: 100,
  priceScale: 100,
  descriptionScale: 100,
  skuScale: 100,
  brandOffsetY: 0,
  priceOffsetY: 0,
  descriptionOffsetY: 0,
  skuOffsetY: 0,
  brandLetterSpacing: 2,
  priceLetterSpacing: 0,
  descriptionLetterSpacing: 0,
  skuLetterSpacing: 0,
};

export const DEFAULT_ZOOM: ZoomLevel = 0.82;
export const DEFAULT_AUTO_ADVANCE = true;

export interface StudioSettingsSnapshot {
  template: TemplateConfig;
  grid: GridConfig;
  zoom: ZoomLevel;
  autoAdvance: boolean;
  autoSave: boolean;
}

export function loadStudioSettings(): {
  settings: StudioSettingsSnapshot;
  hasSaved: boolean;
} {
  const fallback: StudioSettingsSnapshot = {
    template: DEFAULT_TEMPLATE,
    grid: DEFAULT_GRID,
    zoom: DEFAULT_ZOOM,
    autoAdvance: DEFAULT_AUTO_ADVANCE,
    autoSave: false,
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { settings: fallback, hasSaved: false };
    const parsed = JSON.parse(raw) as Partial<StudioSettingsSnapshot>;

    const validZoom: ZoomLevel =
      parsed.zoom === 0.65 || parsed.zoom === 0.82 || parsed.zoom === 1
        ? parsed.zoom
        : DEFAULT_ZOOM;

    const template: TemplateConfig = {
      brand:
        typeof parsed.template?.brand === 'string'
          ? parsed.template.brand
          : DEFAULT_TEMPLATE.brand,
      logoUrl:
        typeof parsed.template?.logoUrl === 'string'
          ? parsed.template.logoUrl
          : null,
      showBrand:
        typeof parsed.template?.showBrand === 'boolean'
          ? parsed.template.showBrand
          : DEFAULT_TEMPLATE.showBrand,
      borderStyle:
        parsed.template?.borderStyle === 'notched-double' ||
        parsed.template?.borderStyle === 'simple-double' ||
        parsed.template?.borderStyle === 'rounded-single' ||
        parsed.template?.borderStyle === 'none'
          ? parsed.template.borderStyle
          : DEFAULT_TEMPLATE.borderStyle,
      brandScale:
        typeof parsed.template?.brandScale === 'number'
          ? parsed.template.brandScale
          : DEFAULT_TEMPLATE.brandScale,
      priceScale:
        typeof parsed.template?.priceScale === 'number'
          ? parsed.template.priceScale
          : DEFAULT_TEMPLATE.priceScale,
      descriptionScale:
        typeof parsed.template?.descriptionScale === 'number'
          ? parsed.template.descriptionScale
          : DEFAULT_TEMPLATE.descriptionScale,
      skuScale:
        typeof parsed.template?.skuScale === 'number'
          ? parsed.template.skuScale
          : DEFAULT_TEMPLATE.skuScale,
      brandOffsetY:
        typeof parsed.template?.brandOffsetY === 'number'
          ? Math.max(-40, Math.min(40, parsed.template.brandOffsetY))
          : DEFAULT_TEMPLATE.brandOffsetY,
      priceOffsetY:
        typeof parsed.template?.priceOffsetY === 'number'
          ? Math.max(-40, Math.min(40, parsed.template.priceOffsetY))
          : DEFAULT_TEMPLATE.priceOffsetY,
      descriptionOffsetY:
        typeof parsed.template?.descriptionOffsetY === 'number'
          ? Math.max(-40, Math.min(40, parsed.template.descriptionOffsetY))
          : DEFAULT_TEMPLATE.descriptionOffsetY,
      skuOffsetY:
        typeof parsed.template?.skuOffsetY === 'number'
          ? Math.max(-40, Math.min(40, parsed.template.skuOffsetY))
          : DEFAULT_TEMPLATE.skuOffsetY,
      brandLetterSpacing:
        typeof parsed.template?.brandLetterSpacing === 'number'
          ? Math.max(-2, Math.min(12, parsed.template.brandLetterSpacing))
          : DEFAULT_TEMPLATE.brandLetterSpacing,
      priceLetterSpacing:
        typeof parsed.template?.priceLetterSpacing === 'number'
          ? Math.max(-2, Math.min(12, parsed.template.priceLetterSpacing))
          : DEFAULT_TEMPLATE.priceLetterSpacing,
      descriptionLetterSpacing:
        typeof parsed.template?.descriptionLetterSpacing === 'number'
          ? Math.max(-2, Math.min(12, parsed.template.descriptionLetterSpacing))
          : DEFAULT_TEMPLATE.descriptionLetterSpacing,
      skuLetterSpacing:
        typeof parsed.template?.skuLetterSpacing === 'number'
          ? Math.max(-2, Math.min(12, parsed.template.skuLetterSpacing))
          : DEFAULT_TEMPLATE.skuLetterSpacing,
    };

    const grid: GridConfig = {
      cols:
        typeof parsed.grid?.cols === 'number'
          ? Math.max(1, Math.min(6, parsed.grid.cols))
          : DEFAULT_GRID.cols,
      rows:
        typeof parsed.grid?.rows === 'number'
          ? Math.max(1, Math.min(12, parsed.grid.rows))
          : DEFAULT_GRID.rows,
      marginY:
        typeof parsed.grid?.marginY === 'number'
          ? Math.max(0, Math.min(40, parsed.grid.marginY))
          : DEFAULT_GRID.marginY,
      marginX:
        typeof parsed.grid?.marginX === 'number'
          ? Math.max(0, Math.min(40, parsed.grid.marginX))
          : DEFAULT_GRID.marginX,
      gapX:
        typeof parsed.grid?.gapX === 'number'
          ? Math.max(0, Math.min(30, parsed.grid.gapX))
          : DEFAULT_GRID.gapX,
      gapY:
        typeof parsed.grid?.gapY === 'number'
          ? Math.max(0, Math.min(30, parsed.grid.gapY))
          : DEFAULT_GRID.gapY,
    };

    return {
      settings: {
        template,
        grid,
        zoom: validZoom,
        autoAdvance:
          typeof parsed.autoAdvance === 'boolean'
            ? parsed.autoAdvance
            : DEFAULT_AUTO_ADVANCE,
        autoSave:
          typeof parsed.autoSave === 'boolean' ? parsed.autoSave : false,
      },
      hasSaved: true,
    };
  } catch {
    return { settings: fallback, hasSaved: false };
  }
}

export function saveStudioSettings(snapshot: StudioSettingsSnapshot): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearStudioSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage access errors
  }
}
