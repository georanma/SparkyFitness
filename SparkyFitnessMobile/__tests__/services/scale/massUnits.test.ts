import { gramsToQuantity } from '../../../src/services/scale/massUnits';

describe('gramsToQuantity', () => {
  it.each(['g', 'G', ' gram ', 'grams'])('keeps grams for "%s"', (unit) => {
    expect(gramsToQuantity(142, unit)).toBe(142);
  });

  it('converts to ounces with two decimals', () => {
    expect(gramsToQuantity(100, 'oz')).toBe(3.53);
    expect(gramsToQuantity(28, 'ounces')).toBe(0.99);
  });

  it('converts to pounds and kilograms with three decimals', () => {
    expect(gramsToQuantity(500, 'lb')).toBe(1.102);
    expect(gramsToQuantity(1250, 'kg')).toBe(1.25);
  });

  it.each(['cup', 'serving', 'slice', 'ml', '', 'constructor'])(
    'returns null for the non-mass unit "%s"',
    (unit) => {
      expect(gramsToQuantity(100, unit)).toBeNull();
    }
  );

  it('rounds zero to zero', () => {
    expect(gramsToQuantity(0, 'g')).toBe(0);
    expect(gramsToQuantity(0, 'oz')).toBe(0);
  });
});
