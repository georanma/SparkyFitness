import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Subscription } from 'react-native-ble-plx';

import { base64ToBytes, bytesToBase64 } from './base64';
import type {
  GattAddress,
  ScaleAdvertisement,
  ScaleTransport,
} from './ScaleDriver';

const CONNECT_TIMEOUT_MS = 15000;
const STATE_TIMEOUT_MS = 3000;

export type BluetoothAccess = 'ready' | 'bluetooth-off' | 'permission-denied';

export interface ConnectedScale {
  readonly transport: ScaleTransport;
  disconnect(): Promise<void>;
}

export type ConnectResult =
  | { readonly kind: 'connected'; readonly connection: ConnectedScale }
  | { readonly kind: 'failed'; readonly message: string };

let sharedManager: BleManager | null = null;

function getManager(): BleManager {
  sharedManager ??= new BleManager();
  return sharedManager;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const wanted =
    Number(Platform.Version) >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every(
    (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED
  );
}

/** Resolves with the first state that is neither Unknown nor Resetting, or Unknown after a timeout. */
function waitForSettledState(manager: BleManager): Promise<State> {
  return new Promise((resolve) => {
    let settled = false;
    let subscription: Subscription | null = null;
    const finish = (state: State): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      resolve(state);
    };
    const timer = setTimeout(() => finish(State.Unknown), STATE_TIMEOUT_MS);
    subscription = manager.onStateChange((state) => {
      if (state !== State.Unknown && state !== State.Resetting) finish(state);
    }, true);
    if (settled) subscription.remove(); // the listener fired synchronously
  });
}

export async function ensureBluetoothAccess(): Promise<BluetoothAccess> {
  if (!(await requestAndroidPermissions())) return 'permission-denied';
  const state = await waitForSettledState(getManager());
  if (state === State.PoweredOn) return 'ready';
  if (state === State.Unauthorized) return 'permission-denied';
  return 'bluetooth-off';
}

export function startScaleScan(
  onAdvertisement: (advertisement: ScaleAdvertisement) => void,
  onError: (message: string) => void
): () => void {
  const manager = getManager();
  manager
    .startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        onError(error.message);
        return;
      }
      if (!device) return;
      onAdvertisement({
        deviceId: device.id,
        name: device.name ?? device.localName,
        serviceUuids: device.serviceUUIDs ?? [],
      });
    })
    .catch((error: unknown) => onError(errorMessage(error)));
  return () => {
    void manager.stopDeviceScan();
  };
}

function createTransport(
  manager: BleManager,
  deviceId: string
): ScaleTransport {
  return {
    async write(address: GattAddress, bytes: Uint8Array): Promise<void> {
      await manager.writeCharacteristicWithResponseForDevice(
        deviceId,
        address.service,
        address.characteristic,
        bytesToBase64(bytes)
      );
    },
    subscribe(address, onValue) {
      const subscription = manager.monitorCharacteristicForDevice(
        deviceId,
        address.service,
        address.characteristic,
        (error, characteristic) => {
          // Errors here are cancellations and link loss; the disconnect callback reports those.
          if (error || !characteristic?.value) return;
          onValue(base64ToBytes(characteristic.value));
        }
      );
      return () => subscription.remove();
    },
    onDisconnected(handler) {
      const subscription = manager.onDeviceDisconnected(deviceId, () =>
        handler()
      );
      return () => subscription.remove();
    },
  };
}

export async function connectScale(deviceId: string): Promise<ConnectResult> {
  const manager = getManager();
  try {
    const device = await manager.connectToDevice(deviceId, {
      timeout: CONNECT_TIMEOUT_MS,
    });
    await device.discoverAllServicesAndCharacteristics();
  } catch (error) {
    return { kind: 'failed', message: errorMessage(error) };
  }
  return {
    kind: 'connected',
    connection: {
      transport: createTransport(manager, deviceId),
      disconnect: async () => {
        await manager.cancelDeviceConnection(deviceId).catch(() => undefined);
      },
    },
  };
}
