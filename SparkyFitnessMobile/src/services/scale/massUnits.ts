interface MassUnit {
  readonly gramsPerUnit: number;
  readonly decimals: number;
}

const GRAM: MassUnit = { gramsPerUnit: 1, decimals: 0 };
const OUNCE: MassUnit = { gramsPerUnit: 28.349523125, decimals: 2 };
const POUND: MassUnit = { gramsPerUnit: 453.59237, decimals: 3 };
const KILOGRAM: MassUnit = { gramsPerUnit: 1000, decimals: 3 };

const MASS_UNITS: ReadonlyMap<string, MassUnit> = new Map([
  ['g', GRAM],
  ['gram', GRAM],
  ['grams', GRAM],
  ['oz', OUNCE],
  ['ounce', OUNCE],
  ['ounces', OUNCE],
  ['lb', POUND],
  ['lbs', POUND],
  ['pound', POUND],
  ['pounds', POUND],
  ['kg', KILOGRAM],
  ['kilogram', KILOGRAM],
  ['kilograms', KILOGRAM],
]);

/**
 * The quantity to show for `grams` when the food's serving unit is `unit`,
 * or null when the unit is not a mass (cup, slice, serving, ml...).
 */
export function gramsToQuantity(grams: number, unit: string): number | null {
  const mass = MASS_UNITS.get(unit.trim().toLowerCase());
  if (mass === undefined) return null;
  const factor = 10 ** mass.decimals;
  return Math.round((grams / mass.gramsPerUnit) * factor) / factor;
}
