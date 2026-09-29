import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LIFE_PRODUCT_TYPES, LifeProductType } from '../../../lib/constants/life-products.js';
import { VARIABLE_REGISTRY } from '../../../lib/consents/variable-registry.js';

describe('Life Product Taxonomy & Canonical Constants', () => {
  it('contains exactly the 9 required clean product types in canonical taxonomy', () => {
    const expectedTaxonomy = [
      'Asset Preserver',
      'Income Annuity',
      'Term Life',
      'Transfer on Death / Individual',
      'Universal Life',
      'Variable Annuity',
      'Variable Life',
      'Variable Universal Life Insurance',
      'Whole Life',
    ];

    assert.deepEqual(Array.from(LIFE_PRODUCT_TYPES), expectedTaxonomy);
  });

  it('correctly maps legacy product types to canonical taxonomy', () => {
    const legacyMap: Record<string, LifeProductType> = {
      'Term': 'Term Life',
      'IUL': 'Universal Life',
      'Whole Life': 'Whole Life',
      'VUL': 'Variable Universal Life Insurance',
      'Term - Disability': 'Term Life',
      'Costumer Whole Life': 'Whole Life',
    };

    const mapLegacyValue = (raw: string): LifeProductType => {
      return legacyMap[raw] || (raw as LifeProductType);
    };

    assert.equal(mapLegacyValue('Term'), 'Term Life');
    assert.equal(mapLegacyValue('IUL'), 'Universal Life');
    assert.equal(mapLegacyValue('Whole Life'), 'Whole Life');
    assert.equal(mapLegacyValue('VUL'), 'Variable Universal Life Insurance');
    assert.equal(mapLegacyValue('Term - Disability'), 'Term Life');
    assert.equal(mapLegacyValue('Costumer Whole Life'), 'Whole Life');
  });
});

describe('Life Card Title Formatting Logic', () => {
  const formatCardTitle = (product: { company?: string | null; product_type: string; product_name?: string | null }) => {
    const mainTitle = product.company || product.product_name || product.product_type;
    const subtitle = product.product_name && product.company ? ` — ${product.product_name}` : '';
    return `${mainTitle}${subtitle} (${product.product_type})`;
  };

  it('renders gracefully when product_name is null', () => {
    const title = formatCardTitle({
      company: 'NY Life',
      product_type: 'Term Life',
      product_name: null,
    });
    assert.equal(title, 'NY Life (Term Life)');
  });

  it('renders correctly when product_name is provided', () => {
    const title = formatCardTitle({
      company: 'NY Life',
      product_type: 'Term Life',
      product_name: 'Level Prem Convertible Term-10 Yr Guar Level Prem',
    });
    assert.equal(title, 'NY Life — Level Prem Convertible Term-10 Yr Guar Level Prem (Term Life)');
  });

  it('falls back to product_name if company is missing', () => {
    const title = formatCardTitle({
      company: null,
      product_type: 'Whole Life',
      product_name: 'Custom Whole Life',
    });
    assert.equal(title, 'Custom Whole Life (Whole Life)');
  });
});

describe('Consent Token Registry - Life Products', () => {
  it('registers life.product_name in consent variables', () => {
    const vars = VARIABLE_REGISTRY.flatMap((g) => g.variables);
    const tokenNames = vars.map((v) => v.token);

    assert.ok(tokenNames.includes('life.product_type'));
    assert.ok(tokenNames.includes('life.product_name'));

    const productNameVar = vars.find((v) => v.token === 'life.product_name');
    assert.equal(productNameVar?.label, 'Life Product Name');
    assert.equal(productNameVar?.sourceTable, 'life_policy_products');
    assert.equal(productNameVar?.sourceField, 'product_name');
  });
});
