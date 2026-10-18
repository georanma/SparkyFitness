import { calibraDriver } from './calibra/driver';
import type { ScaleAdvertisement, ScaleDriver } from './ScaleDriver';

/** Adding a scale model means adding its driver here. */
const DRIVERS: readonly ScaleDriver[] = [calibraDriver];

export function findDriverForAdvertisement(
  advertisement: ScaleAdvertisement
): ScaleDriver | null {
  return DRIVERS.find((driver) => driver.matches(advertisement)) ?? null;
}

export function getDriverById(id: string): ScaleDriver | null {
  return DRIVERS.find((driver) => driver.id === id) ?? null;
}
