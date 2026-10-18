import { addLog } from '../LogService';
import { connectScale, ensureBluetoothAccess } from './bleTransport';
import { getDriverById } from './scaleRegistry';
import type { PairedScale, ScaleEvent } from './ScaleDriver';

export type ConnectOutcome =
  | { readonly kind: 'connected'; close(): Promise<void> }
  | {
      readonly kind: 'failed';
      readonly reason: 'bluetooth-off' | 'permission-denied' | 'not-found';
    };

/**
 * Checks access, connects by the stored device id, opens the driver's session and
 * returns a closer. Expected failures come back as values, never as exceptions.
 */
export async function connectPairedScale(
  paired: PairedScale,
  onEvent: (event: ScaleEvent) => void
): Promise<ConnectOutcome> {
  const driver = getDriverById(paired.driverId);
  if (!driver) {
    void addLog(`[scale] no driver for ${paired.driverId}`, 'WARNING');
    return { kind: 'failed', reason: 'not-found' };
  }
  const access = await ensureBluetoothAccess();
  if (access !== 'ready') return { kind: 'failed', reason: access };

  const result = await connectScale(paired.deviceId);
  if (result.kind === 'failed') {
    void addLog(`[scale] connect failed: ${result.message}`, 'INFO');
    return { kind: 'failed', reason: 'not-found' };
  }

  const session = driver.openSession(result.connection.transport);
  await session.start(onEvent);
  return {
    kind: 'connected',
    close: async () => {
      await session.stop();
      await result.connection.disconnect();
    },
  };
}
