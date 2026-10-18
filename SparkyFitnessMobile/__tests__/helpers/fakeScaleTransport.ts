import type {
  GattAddress,
  ScaleTransport,
} from '../../src/services/scale/ScaleDriver';
import { toHex } from './bytes';

const keyOf = (address: GattAddress) =>
  `${address.service}/${address.characteristic}`;

export class FakeScaleTransport implements ScaleTransport {
  readonly writes: Uint8Array[] = [];
  failWrites = false;
  private readonly subscribers = new Map<string, (bytes: Uint8Array) => void>();
  private readonly disconnectHandlers = new Set<() => void>();

  async write(_address: GattAddress, bytes: Uint8Array): Promise<void> {
    if (this.failWrites) throw new Error('write failed');
    this.writes.push(bytes);
  }

  subscribe(
    address: GattAddress,
    onValue: (bytes: Uint8Array) => void
  ): () => void {
    this.subscribers.set(keyOf(address), onValue);
    return () => {
      this.subscribers.delete(keyOf(address));
    };
  }

  onDisconnected(handler: () => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => {
      this.disconnectHandlers.delete(handler);
    };
  }

  emit(address: GattAddress, bytes: Uint8Array): void {
    this.subscribers.get(keyOf(address))?.(bytes);
  }

  isSubscribed(address: GattAddress): boolean {
    return this.subscribers.has(keyOf(address));
  }

  drop(): void {
    this.disconnectHandlers.forEach((handler) => handler());
  }

  get writtenHex(): string[] {
    return this.writes.map(toHex);
  }
}

/** Lets queued promise chains (the session's write queue) run. */
export async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}
