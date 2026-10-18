import { addLog } from '../LogService';
import { connectScale, ensureBluetoothAccess } from './bleTransport';
import { getDriverById } from './scaleRegistry';
import type { PairedScale, ScaleEvent } from './ScaleDriver';

/** How long a new attempt waits for the previous one at the same scale to finish and close. */
const PREVIOUS_ATTEMPT_WAIT_MS = 5000;

/** Per device id: resolves once the latest attempt has failed or its link has been closed. */
const attempts = new Map<string, Promise<void>>();

async function waitForPrevious(
  previous: Promise<void> | undefined
): Promise<void> {
  if (!previous) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, PREVIOUS_ATTEMPT_WAIT_MS);
  });
  await Promise.race([previous, timeout]);
  clearTimeout(timer);
}

export type ConnectOutcome =
  | { readonly kind: 'connected'; close(): Promise<void> }
  | {
      readonly kind: 'failed';
      readonly reason: 'bluetooth-off' | 'permission-denied' | 'not-found';
    };

async function openConnection(
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

/**
 * Checks access, connects by the stored device id, opens the driver's session and
 * returns a closer. Expected failures come back as values, never as exceptions.
 *
 * Attempts at the same scale are serialized: leaving and re-opening a food entry
 * quickly must not let the old attempt's cleanup cancel the new attempt's link
 * (cancelling is per device id), so a new attempt first waits for the previous one
 * to fail or be closed.
 */
export async function connectPairedScale(
  paired: PairedScale,
  onEvent: (event: ScaleEvent) => void
): Promise<ConnectOutcome> {
  const previous = attempts.get(paired.deviceId);
  let release: () => void = () => undefined;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  attempts.set(paired.deviceId, mine);
  void mine.then(() => {
    if (attempts.get(paired.deviceId) === mine)
      attempts.delete(paired.deviceId);
  });

  await waitForPrevious(previous);
  let outcome: ConnectOutcome;
  try {
    outcome = await openConnection(paired, onEvent);
  } catch (error) {
    release();
    throw error;
  }
  if (outcome.kind === 'failed') {
    release();
    return outcome;
  }
  return {
    kind: 'connected',
    close: async () => {
      try {
        await outcome.close();
      } finally {
        release();
      }
    },
  };
}
