import { PermissionsAndroid, Platform } from 'react-native';

import {
  connectScale,
  ensureBluetoothAccess,
  startScaleScan,
} from '../../../src/services/scale/bleTransport';
import { hex, toHex } from '../../helpers/bytes';

interface MockManager {
  state: jest.Mock;
  onStateChange: jest.Mock;
  startDeviceScan: jest.Mock;
  stopDeviceScan: jest.Mock;
  connectToDevice: jest.Mock;
  cancelDeviceConnection: jest.Mock;
  writeCharacteristicWithResponseForDevice: jest.Mock;
  monitorCharacteristicForDevice: jest.Mock;
  onDeviceDisconnected: jest.Mock;
}

const { __manager: manager } = jest.requireMock('react-native-ble-plx') as {
  __manager: MockManager;
};

const ADDRESS = {
  service: '00001a10-0000-1000-8000-00805f9b34fb',
  characteristic: '00001a12-0000-1000-8000-00805f9b34fb',
};

function stateListener(state: string): void {
  manager.onStateChange.mockImplementation((listener: (s: string) => void) => {
    listener(state);
    return { remove: jest.fn() };
  });
}

describe('bleTransport', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    stateListener('PoweredOn');
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalOs,
      configurable: true,
    });
  });

  describe('ensureBluetoothAccess', () => {
    it('is ready when Bluetooth is on', async () => {
      await expect(ensureBluetoothAccess()).resolves.toBe('ready');
    });

    it.each([
      ['PoweredOff', 'bluetooth-off'],
      ['Unsupported', 'bluetooth-off'],
      ['Unauthorized', 'permission-denied'],
    ])('maps state %s to %s', async (state, expected) => {
      stateListener(state);
      await expect(ensureBluetoothAccess()).resolves.toBe(expected);
    });

    it('asks for the Android 12+ permissions and reports a refusal', async () => {
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
      });
      Object.defineProperty(Platform, 'Version', {
        value: 34,
        configurable: true,
      });
      const request = jest
        .spyOn(PermissionsAndroid, 'requestMultiple')
        .mockResolvedValue({
          'android.permission.BLUETOOTH_SCAN': 'denied',
          'android.permission.BLUETOOTH_CONNECT': 'granted',
        } as never);
      await expect(ensureBluetoothAccess()).resolves.toBe('permission-denied');
      expect(request).toHaveBeenCalledWith([
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_CONNECT',
      ]);
      request.mockRestore();
    });
  });

  describe('startScaleScan', () => {
    it('turns scan results into advertisements and returns a stop function', () => {
      const onAdvertisement = jest.fn();
      const onError = jest.fn();
      const stop = startScaleScan(onAdvertisement, onError);

      const callback = manager.startDeviceScan.mock.calls[0][2] as (
        error: { message: string } | null,
        device: {
          id: string;
          name: string | null;
          localName: string | null;
          serviceUUIDs: string[] | null;
        } | null
      ) => void;
      callback(null, {
        id: 'AA',
        name: null,
        localName: 'R-MSK03',
        serviceUUIDs: null,
      });
      callback({ message: 'scan failed' }, null);

      expect(onAdvertisement).toHaveBeenCalledWith({
        deviceId: 'AA',
        name: 'R-MSK03',
        serviceUuids: [],
      });
      expect(onError).toHaveBeenCalledWith('scan failed');
      stop();
      expect(manager.stopDeviceScan).toHaveBeenCalled();
    });

    it('reports a scan that fails to start instead of leaving a rejected promise', async () => {
      manager.startDeviceScan.mockRejectedValueOnce(new Error('no adapter'));
      const onError = jest.fn();
      startScaleScan(jest.fn(), onError);
      await Promise.resolve();
      await Promise.resolve();
      expect(onError).toHaveBeenCalledWith('no adapter');
    });
  });

  describe('connectScale', () => {
    const connectedDevice = () => ({
      discoverAllServicesAndCharacteristics: jest.fn(async () => undefined),
    });

    it('reports a failure value instead of throwing', async () => {
      manager.connectToDevice.mockRejectedValueOnce(new Error('timed out'));
      await expect(connectScale('AA')).resolves.toEqual({
        kind: 'failed',
        message: 'timed out',
      });
    });

    it('writes bytes as base64 with response', async () => {
      manager.connectToDevice.mockResolvedValueOnce(connectedDevice());
      const result = await connectScale('AA');
      if (result.kind !== 'connected') throw new Error('expected a connection');
      await result.connection.transport.write(
        { ...ADDRESS, characteristic: '00001a11-0000-1000-8000-00805f9b34fb' },
        hex('55aa98000097')
      );
      expect(
        manager.writeCharacteristicWithResponseForDevice
      ).toHaveBeenCalledWith(
        'AA',
        ADDRESS.service,
        '00001a11-0000-1000-8000-00805f9b34fb',
        'VaqYAACX'
      );
    });

    it('decodes monitored values, ignores errors, and removes the subscription', async () => {
      manager.connectToDevice.mockResolvedValueOnce(connectedDevice());
      const remove = jest.fn();
      manager.monitorCharacteristicForDevice.mockReturnValueOnce({ remove });
      const result = await connectScale('AA');
      if (result.kind !== 'connected') throw new Error('expected a connection');
      const received: string[] = [];
      const unsubscribe = result.connection.transport.subscribe(
        ADDRESS,
        (bytes) => received.push(toHex(bytes))
      );

      const listener = manager.monitorCharacteristicForDevice.mock
        .calls[0][3] as (
        error: Error | null,
        characteristic: { value: string | null } | null
      ) => void;
      listener(null, { value: 'VaqYAACX' });
      listener(new Error('cancelled'), null);
      listener(null, { value: null });

      expect(received).toEqual(['55aa98000097']);
      unsubscribe();
      expect(remove).toHaveBeenCalled();
    });

    it('forwards the disconnect callback and disconnects on request', async () => {
      manager.connectToDevice.mockResolvedValueOnce(connectedDevice());
      const result = await connectScale('AA');
      if (result.kind !== 'connected') throw new Error('expected a connection');
      const handler = jest.fn();
      result.connection.transport.onDisconnected(handler);
      (manager.onDeviceDisconnected.mock.calls[0][1] as () => void)();
      expect(handler).toHaveBeenCalledTimes(1);

      await result.connection.disconnect();
      expect(manager.cancelDeviceConnection).toHaveBeenCalledWith('AA');
    });
  });
});
