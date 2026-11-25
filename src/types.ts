export type CatalogRow = Record<string, string>;

export interface FieldMapping {
  lookup: string;
  price: string;
  description: string;
  sku: string;
}

export interface GridConfig {
  cols: number;
  rows: number;
  marginY: number;
  marginX: number;
  gapX: number;
  gapY: number;
}

export type BorderStyle =
  | 'notched-double'
  | 'simple-double'
  | 'rounded-single'
  | 'none';

export interface TemplateConfig {
  brand: string;
  logoUrl: string | null;
  showBrand: boolean;
  borderStyle: BorderStyle;
  brandScale: number;
  priceScale: number;
  descriptionScale: number;
  skuScale: number;
}

export interface StickerSlot {
  price: string;
  description: string;
  sku: string;
}

export type StudioTab = 'scan' | 'grid' | 'template' | 'data';

export type ZoomLevel = 0.65 | 0.82 | 1;
