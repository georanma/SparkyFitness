import { connectPairedScale } from '../../../src/services/scale/scaleConnection';
import {
  connectScale,
  ensureBluetoothAccess,
} from '../../../src/services/scale/bleTransport';
import { getDriverById } from '../../../src/services/scale/scaleRegistry';
import type { ScaleDriver } from '../../../src/services/scale/ScaleDriver';

jest.mock('../../../src/services/scale/bleTransport');
jest.mock('../../../src/services/scale/scaleRegistry');
jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(async () => undefined),
}));

const mockAccess = ensureBluetoothAccess as jest.MockedFunction<
  typeof ensureBluetoothAccess
>;
const mockConnect = connectScale as jest.MockedFunction<typeof connectScale>;
const mockGetDriver = getDriverById as jest.MockedFunction<
  typeof getDriverById
>;

const paired = {
  driverId: 'renpho-calibra-plus',
  deviceId: 'AA',
  name: 'R-MSK03',
};

describe('connectPairedScale', () => {
  const start = jest.fn(async () => undefined);
  const stop = jest.fn(async () => undefined);
  const disconnect = jest.fn(async () => undefined);
  const driver: ScaleDriver = {
    id: 'renpho-calibra-plus',
    displayName: 'Renpho Calibra+',
    matches: () => true,
    openSession: () => ({ start, stop }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDriver.mockReturnValue(driver);
    mockAccess.mockResolvedValue('ready');
    mockConnect.mockResolvedValue({
      kind: 'connected',
      connection: { transport: {} as never, disconnect },
    });
  });

  it('reports Bluetooth being off or permission refused without connecting', async () => {
    mockAccess.mockResolvedValueOnce('bluetooth-off');
    await expect(connectPairedScale(paired, jest.fn())).resolves.toEqual({
      kind: 'failed',
      reason: 'bluetooth-off',
    });
    mockAccess.mockResolvedValueOnce('permission-denied');
    await expect(connectPairedScale(paired, jest.fn())).resolves.toEqual({
      kind: 'failed',
      reason: 'permission-denied',
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('maps a failed connection and an unknown driver to not-found', async () => {
    mockConnect.mockResolvedValueOnce({ kind: 'failed', message: 'timed out' });
    await expect(connectPairedScale(paired, jest.fn())).resolves.toEqual({
      kind: 'failed',
      reason: 'not-found',
    });
    mockGetDriver.mockReturnValueOnce(null);
    await expect(connectPairedScale(paired, jest.fn())).resolves.toEqual({
      kind: 'failed',
      reason: 'not-found',
    });
  });

  it('starts the session with the event callback and closes session then link', async () => {
    const onEvent = jest.fn();
    const outcome = await connectPairedScale(paired, onEvent);
    expect(start).toHaveBeenCalledWith(onEvent);
    if (outcome.kind !== 'connected') throw new Error('expected a connection');
    await outcome.close();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
