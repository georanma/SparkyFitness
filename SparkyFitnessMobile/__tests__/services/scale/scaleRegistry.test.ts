import {
  findDriverForAdvertisement,
  getDriverById,
} from '../../../src/services/scale/scaleRegistry';
import type { ScaleAdvertisement } from '../../../src/services/scale/ScaleDriver';

const advertisement = (name: string | null): ScaleAdvertisement => ({
  deviceId: 'AA:BB',
  name,
  serviceUuids: [],
});

describe('scale registry', () => {
  it('matches a Calibra+ by its advertised name', () => {
    expect(findDriverForAdvertisement(advertisement('R-MSK03'))?.id).toBe(
      'renpho-calibra-plus'
    );
  });

  it('does not match other devices or unnamed ones', () => {
    expect(findDriverForAdvertisement(advertisement('Hue lamp'))).toBeNull();
    expect(findDriverForAdvertisement(advertisement(null))).toBeNull();
  });

  it('finds a driver by id and returns null for an unknown id', () => {
    expect(getDriverById('renpho-calibra-plus')?.displayName).toBe(
      'Renpho Calibra+'
    );
    expect(getDriverById('nope')).toBeNull();
  });
});
