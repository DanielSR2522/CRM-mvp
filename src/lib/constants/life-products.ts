export const LIFE_PRODUCT_TYPES = [
  'Asset Preserver',
  'Income Annuity',
  'Term Life',
  'Transfer on Death / Individual',
  'Universal Life',
  'Variable Annuity',
  'Variable Life',
  'Variable Universal Life Insurance',
  'Whole Life',
] as const;

export type LifeProductType = (typeof LIFE_PRODUCT_TYPES)[number];
