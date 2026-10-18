import { connectPairedScale } from '../../../src/services/scale/scaleConnection';
import type { ConnectResult } from '../../../src/services/scale/bleTransport';
import {
  connectScale,
  ensureBluetoothAccess,
} from '../../../src/services/scale/bleTransport';
import { getDriverById } from '../../../src/services/scale/scaleRegistry';
import type { ScaleDriver } from '../../../src/services/scale/ScaleDriver';
import { flushPromises } from '../../helpers/fakeScaleTransport';

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

  describe('overlapping attempts at the same scale', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const link = { transport: {} as never };

    it('waits for an earlier attempt to be closed before connecting again', async () => {
      let finishFirst: (result: ConnectResult) => void = () => undefined;
      mockConnect.mockImplementationOnce(
        () =>
          new Promise<ConnectResult>((resolve) => {
            finishFirst = resolve;
          })
      );
      const first = connectPairedScale(paired, jest.fn());
      const second = connectPairedScale(paired, jest.fn());
      await flushPromises();
      expect(mockConnect).toHaveBeenCalledTimes(1);

      finishFirst({ kind: 'connected', connection: { ...link, disconnect } });
      const firstOutcome = await first;
      await flushPromises();
      expect(mockConnect).toHaveBeenCalledTimes(1); // still waiting: the first link is open

      if (firstOutcome.kind !== 'connected')
        throw new Error('expected a connection');
      await firstOutcome.close();
      const secondOutcome = await second;
      expect(mockConnect).toHaveBeenCalledTimes(2);
      if (secondOutcome.kind === 'connected') await secondOutcome.close();
      expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(
        mockConnect.mock.invocationCallOrder[1]
      );
    });

    it('does not wait for an earlier attempt that failed', async () => {
      mockConnect.mockResolvedValueOnce({
        kind: 'failed',
        message: 'timed out',
      });
      await connectPairedScale(paired, jest.fn());
      const second = await connectPairedScale(paired, jest.fn());
      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(second.kind).toBe('connected');
      if (second.kind === 'connected') await second.close();
    });

    it('stops waiting for an earlier attempt that is never closed', async () => {
      jest.useFakeTimers();
      const first = await connectPairedScale(paired, jest.fn());
      const second = connectPairedScale(paired, jest.fn());
      await flushPromises();
      expect(mockConnect).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(5000);
      const secondOutcome = await second;
      expect(mockConnect).toHaveBeenCalledTimes(2);

      // Release the module-level chain so later tests are not delayed.
      if (first.kind === 'connected') await first.close();
      if (secondOutcome.kind === 'connected') await secondOutcome.close();
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
