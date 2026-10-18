import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { gramsToQuantity } from '../services/scale/massUnits';
import {
  INITIAL_FOLLOW_STATE,
  followReducer,
  type FollowMode,
} from '../services/scale/quantityFollower';
import { connectPairedScale } from '../services/scale/scaleConnection';
import type { ScaleEvent } from '../services/scale/ScaleDriver';
import { useScaleStore } from '../stores/scaleStore';

/** Live readings stream at about 3.8 Hz; the UI does not need every one. */
const LIVE_THROTTLE_MS = 250;
const MAX_AUTO_RETRIES = 1;

export type ScaleStatus =
  | 'disabled'
  | 'unpaired'
  | 'connecting'
  | 'ready'
  | 'lost'
  | 'bluetooth-off'
  | 'permission-denied'
  | 'not-found';

type ConnectionStatus = Exclude<ScaleStatus, 'disabled' | 'unpaired'>;

/** The result of one connection attempt, tagged with the attempt it belongs to. */
interface AttemptResult {
  readonly key: string;
  readonly status: ConnectionStatus;
}

export interface UseKitchenScaleOptions {
  /** The serving unit currently selected in the form, e.g. "g" or "cup". */
  servingUnit: string;
  /** Receives a quantity expressed in `servingUnit` whenever the scale drives the field. */
  onQuantity: (quantity: number) => void;
}

export interface KitchenScale {
  status: ScaleStatus;
  /** Magnitude of the reading driving the quantity; null until the scale reports one. */
  grams: number | null;
  /** The reading is negative: food removed from a tared container. */
  removing: boolean;
  mode: FollowMode;
  /** False when the selected unit is not a mass, so the scale cannot drive the field. */
  unitSupported: boolean;
  weighAgain: () => void;
  markManual: () => void;
  retry: () => void;
}

export function useKitchenScale({
  servingUnit,
  onQuantity,
}: UseKitchenScaleOptions): KitchenScale {
  const paired = useScaleStore((state) => state.paired);
  const enabled = useScaleStore((state) => state.enabled);
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(
    null
  );
  const [follow, dispatch] = useReducer(followReducer, INITIAL_FOLLOW_STATE);
  const [attempt, setAttempt] = useState(0);
  // A new attempt (new scale, toggled, retried) has no result yet: "connecting".
  const attemptKey = `${paired?.deviceId ?? ''}|${enabled}|${attempt}`;
  const connectionStatus: ConnectionStatus =
    attemptResult?.key === attemptKey ? attemptResult.status : 'connecting';
  const autoRetries = useRef(0);
  const onQuantityRef = useRef(onQuantity);

  useEffect(() => {
    onQuantityRef.current = onQuantity;
  });

  useEffect(() => {
    if (!paired || !enabled) return undefined;

    let cancelled = false;
    let close: (() => Promise<void>) | null = null;
    let pendingLive: number | null = null;
    let throttle: ReturnType<typeof setTimeout> | undefined;

    const deliverLive = (): void => {
      if (pendingLive === null) return;
      const grams = pendingLive;
      pendingLive = null;
      dispatch({ type: 'live', grams });
    };

    const onEvent = (event: ScaleEvent): void => {
      if (cancelled) return;
      switch (event.kind) {
        case 'live':
          pendingLive = event.grams;
          if (throttle === undefined) {
            deliverLive();
            throttle = setTimeout(() => {
              throttle = undefined;
              deliverLive();
            }, LIVE_THROTTLE_MS);
          }
          break;
        case 'settled':
          pendingLive = null; // a stale live reading must not overwrite the settle
          dispatch({ type: 'settled', grams: event.grams });
          break;
        case 'status':
          break;
        case 'disconnected':
          if (autoRetries.current < MAX_AUTO_RETRIES) {
            autoRetries.current += 1;
            setAttempt((count) => count + 1);
          } else {
            setAttemptResult({ key: attemptKey, status: 'lost' });
          }
          break;
      }
    };

    void connectPairedScale(paired, onEvent).then((outcome) => {
      if (outcome.kind === 'failed') {
        if (!cancelled) {
          setAttemptResult({ key: attemptKey, status: outcome.reason });
        }
        return;
      }
      if (cancelled) {
        void outcome.close();
        return;
      }
      close = outcome.close;
      setAttemptResult({ key: attemptKey, status: 'ready' });
    });

    return () => {
      cancelled = true;
      if (throttle !== undefined) clearTimeout(throttle);
      if (close) void close();
    };
  }, [paired, enabled, attemptKey]);

  const unitSupported = gramsToQuantity(0, servingUnit) !== null;

  useEffect(() => {
    if (follow.grams === null || follow.mode === 'manual' || !unitSupported) {
      return;
    }
    const quantity = gramsToQuantity(follow.grams, servingUnit);
    if (quantity !== null) onQuantityRef.current(quantity);
  }, [follow.grams, follow.mode, servingUnit, unitSupported]);

  const weighAgain = useCallback(() => dispatch({ type: 'resume' }), []);
  const markManual = useCallback(() => dispatch({ type: 'manual' }), []);
  const retry = useCallback(() => {
    autoRetries.current = 0;
    setAttempt((count) => count + 1);
  }, []);

  const status: ScaleStatus = !paired
    ? 'unpaired'
    : !enabled
      ? 'disabled'
      : connectionStatus;

  return {
    status,
    grams: follow.grams,
    removing: follow.negative,
    mode: follow.mode,
    unitSupported,
    weighAgain,
    markManual,
    retry,
  };
}
