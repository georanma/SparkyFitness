import { addLog } from '../../LogService';
import type { ScaleDriver } from '../ScaleDriver';
import { createCalibraSession } from './session';

export const CALIBRA_BLE_NAME = 'R-MSK03';

export const calibraDriver: ScaleDriver = {
  id: 'renpho-calibra-plus',
  displayName: 'Renpho Calibra+',
  matches: (advertisement) => advertisement.name === CALIBRA_BLE_NAME,
  openSession: (transport) =>
    createCalibraSession(transport, {
      onDiagnostic: (message) => {
        void addLog(`[scale] ${message}`, 'DEBUG');
      },
    }),
};
