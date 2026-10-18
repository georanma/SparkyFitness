import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PairedScale } from '../services/scale/ScaleDriver';

export const SCALE_STORE_KEY = '@SparkyFitness/kitchen-scale';
const STORE_VERSION = 1;

interface ScaleState {
  paired: PairedScale | null;
  /** Lets someone pause the feature without forgetting the scale. */
  enabled: boolean;
  setPaired: (scale: PairedScale) => void;
  forget: () => void;
  setEnabled: (enabled: boolean) => void;
}

/** Device-local: the pairing is never synced to the server. */
export const useScaleStore = create<ScaleState>()(
  persist(
    (set) => ({
      paired: null,
      enabled: true,
      setPaired: (paired) => set({ paired, enabled: true }),
      forget: () => set({ paired: null }),
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: SCALE_STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ paired: state.paired, enabled: state.enabled }),
    }
  )
);

export function __resetScaleStoreForTests(): void {
  useScaleStore.setState({ paired: null, enabled: true });
}
