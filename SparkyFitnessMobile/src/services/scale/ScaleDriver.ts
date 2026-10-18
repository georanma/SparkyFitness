/** Platform-neutral seams between the app and any Bluetooth scale. */

export interface GattAddress {
  readonly service: string;
  readonly characteristic: string;
}

export interface ScaleAdvertisement {
  /** Opaque id: a MAC address on Android, a per-phone UUID on iOS. */
  readonly deviceId: string;
  readonly name: string | null;
  readonly serviceUuids: readonly string[];
}

export type ScaleDisplayUnit = 'g' | 'oz' | 'ml' | 'unknown';

export type ScaleEvent =
  | { readonly kind: 'live'; readonly grams: number }
  | { readonly kind: 'settled'; readonly grams: number }
  | {
      readonly kind: 'status';
      readonly tareActive: boolean;
      readonly displayUnit: ScaleDisplayUnit;
    }
  | { readonly kind: 'disconnected' };

export interface ScaleTransport {
  write(address: GattAddress, bytes: Uint8Array): Promise<void>;
  subscribe(
    address: GattAddress,
    onValue: (bytes: Uint8Array) => void
  ): () => void;
  onDisconnected(handler: () => void): () => void;
}

export interface ScaleSession {
  start(onEvent: (event: ScaleEvent) => void): Promise<void>;
  stop(): Promise<void>;
}

export interface ScaleDriver {
  readonly id: string;
  readonly displayName: string;
  matches(advertisement: ScaleAdvertisement): boolean;
  openSession(transport: ScaleTransport): ScaleSession;
}

export interface PairedScale {
  readonly driverId: string;
  readonly deviceId: string;
  readonly name: string;
}
