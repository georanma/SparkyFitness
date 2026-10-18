import { useCallback, useEffect, useRef, useState } from 'react';

import { addLog } from '../services/LogService';
import {
  ensureBluetoothAccess,
  startScaleScan,
  type BluetoothAccess,
} from '../services/scale/bleTransport';
import { findDriverForAdvertisement } from '../services/scale/scaleRegistry';
import type { ScaleAdvertisement } from '../services/scale/ScaleDriver';

export interface ScanResult {
  advertisement: ScaleAdvertisement;
  driverId: string;
  displayName: string;
}

export interface ScaleScan {
  access: BluetoothAccess | null;
  scanning: boolean;
  results: ScanResult[];
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useScaleScan(): ScaleScan {
  const [access, setAccess] = useState<BluetoothAccess | null>(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopScan = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopScan.current?.();
    stopScan.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setResults([]);
    setError(null);
    const granted = await ensureBluetoothAccess();
    setAccess(granted);
    if (granted !== 'ready') return;

    setScanning(true);
    stopScan.current = startScaleScan(
      (advertisement) => {
        const driver = findDriverForAdvertisement(advertisement);
        if (!driver) return;
        setResults((current) =>
          current.some(
            (r) => r.advertisement.deviceId === advertisement.deviceId
          )
            ? current
            : [
                ...current,
                {
                  advertisement,
                  driverId: driver.id,
                  displayName: driver.displayName,
                },
              ]
        );
      },
      (message) => {
        void addLog(`[scale] scan error: ${message}`, 'WARNING');
        setError(message);
        stop();
      }
    );
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { access, scanning, results, error, start, stop };
}
