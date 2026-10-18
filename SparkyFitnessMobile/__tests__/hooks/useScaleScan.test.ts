import { act, renderHook } from '@testing-library/react-native';

import { useScaleScan } from '../../src/hooks/useScaleScan';
import {
  ensureBluetoothAccess,
  startScaleScan,
} from '../../src/services/scale/bleTransport';
import type { ScaleAdvertisement } from '../../src/services/scale/ScaleDriver';

jest.mock('../../src/services/scale/bleTransport');
jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(async () => undefined),
}));

const mockAccess = ensureBluetoothAccess as jest.MockedFunction<
  typeof ensureBluetoothAccess
>;
const mockScan = startScaleScan as jest.MockedFunction<typeof startScaleScan>;

const ad = (deviceId: string, name: string | null): ScaleAdvertisement => ({
  deviceId,
  name,
  serviceUuids: [],
});

describe('useScaleScan', () => {
  let onAdvertisement: (advertisement: ScaleAdvertisement) => void = () =>
    undefined;
  let onError: (message: string) => void = () => undefined;
  const stop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue('ready');
    mockScan.mockImplementation((found, failed) => {
      onAdvertisement = found;
      onError = failed;
      return stop;
    });
  });

  it('keeps only recognised scales and lists each device once', async () => {
    const { result } = renderHook(() => useScaleScan());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      onAdvertisement(ad('AA', 'R-MSK03'));
      onAdvertisement(ad('AA', 'R-MSK03'));
      onAdvertisement(ad('BB', 'Hue lamp'));
      onAdvertisement(ad('CC', null));
    });
    expect(result.current.scanning).toBe(true);
    expect(result.current.results.map((r) => r.advertisement.deviceId)).toEqual(
      ['AA']
    );
    expect(result.current.results[0].driverId).toBe('renpho-calibra-plus');
    expect(result.current.results[0].displayName).toBe('Renpho Calibra+');
  });

  it('does not scan when access is refused and reports why', async () => {
    mockAccess.mockResolvedValueOnce('bluetooth-off');
    const { result } = renderHook(() => useScaleScan());
    await act(async () => {
      await result.current.start();
    });
    expect(mockScan).not.toHaveBeenCalled();
    expect(result.current.access).toBe('bluetooth-off');
    expect(result.current.scanning).toBe(false);
  });

  it('surfaces a scan error and stops', async () => {
    const { result } = renderHook(() => useScaleScan());
    await act(async () => {
      await result.current.start();
    });
    act(() => onError('scan failed'));
    expect(result.current.error).toBe('scan failed');
    expect(result.current.scanning).toBe(false);
    expect(stop).toHaveBeenCalled();
  });

  it('does not start a scan if the screen unmounts while waiting for Bluetooth access', async () => {
    let grant: (access: 'ready') => void = () => undefined;
    mockAccess.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        })
    );
    const { result, unmount } = renderHook(() => useScaleScan());
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = result.current.start();
    });
    unmount();
    await act(async () => {
      grant('ready');
      await started;
    });
    expect(mockScan).not.toHaveBeenCalled();
  });

  it('stops scanning on unmount', async () => {
    const { result, unmount } = renderHook(() => useScaleScan());
    await act(async () => {
      await result.current.start();
    });
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
