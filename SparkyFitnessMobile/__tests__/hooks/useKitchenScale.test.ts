import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { useKitchenScale } from '../../src/hooks/useKitchenScale';
import {
  connectPairedScale,
  type ConnectOutcome,
} from '../../src/services/scale/scaleConnection';
import type { ScaleEvent } from '../../src/services/scale/ScaleDriver';
import {
  __resetScaleStoreForTests,
  useScaleStore,
} from '../../src/stores/scaleStore';

jest.mock('../../src/services/scale/scaleConnection');

const mockConnect = connectPairedScale as jest.MockedFunction<
  typeof connectPairedScale
>;
const paired = {
  driverId: 'renpho-calibra-plus',
  deviceId: 'AA',
  name: 'R-MSK03',
};

interface Harness {
  emit: (event: ScaleEvent) => void;
  close: jest.Mock;
  resolve: (outcome?: ConnectOutcome) => void;
}

/** Each connect attempt returns a controllable harness; tests pick the one they need. */
function installConnector(): Harness[] {
  const harnesses: Harness[] = [];
  mockConnect.mockImplementation((_paired, onEvent) => {
    const close = jest.fn(async () => undefined);
    let finish: (outcome: ConnectOutcome) => void = () => undefined;
    const promise = new Promise<ConnectOutcome>((resolve) => {
      finish = resolve;
    });
    harnesses.push({
      emit: onEvent,
      close,
      resolve: (outcome) => finish(outcome ?? { kind: 'connected', close }),
    });
    return promise;
  });
  return harnesses;
}

const settle = async (
  harness: Harness | undefined,
  outcome?: ConnectOutcome
) => {
  await act(async () => {
    harness?.resolve(outcome);
    await Promise.resolve();
  });
};

describe('useKitchenScale', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    __resetScaleStoreForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setup = (servingUnit = 'g') => {
    const onQuantity = jest.fn();
    const hook = renderHook(
      (props: { unit: string }) =>
        useKitchenScale({ servingUnit: props.unit, onQuantity }),
      { initialProps: { unit: servingUnit } }
    );
    return { onQuantity, ...hook };
  };

  it('is inert when no scale is paired', () => {
    const { result } = setup();
    expect(result.current.status).toBe('unpaired');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('is inert when paused', () => {
    useScaleStore.setState({ paired, enabled: false });
    const { result } = setup();
    expect(result.current.status).toBe('disabled');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('connects and becomes ready', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { result } = setup();
    expect(result.current.status).toBe('connecting');
    await settle(harnesses[0]);
    expect(result.current.status).toBe('ready');
  });

  it.each(['bluetooth-off', 'permission-denied', 'not-found'] as const)(
    'maps a %s failure to its status and does not throw',
    async (reason) => {
      useScaleStore.setState({ paired });
      const harnesses = installConnector();
      const { result } = setup();
      await settle(harnesses[0], { kind: 'failed', reason });
      expect(result.current.status).toBe(reason);
    }
  );

  it('keeps the form quantity while the scale reads empty', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { result, onQuantity } = setup();
    await settle(harnesses[0]);

    act(() => harnesses[0].emit({ kind: 'live', grams: 0 }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    act(() => harnesses[0].emit({ kind: 'live', grams: 0 }));
    expect(onQuantity).not.toHaveBeenCalled();
    expect(result.current.grams).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    act(() => harnesses[0].emit({ kind: 'live', grams: 40 }));
    expect(onQuantity).toHaveBeenLastCalledWith(40);
  });

  it('drives the quantity from live readings, using the magnitude when negative', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { result, onQuantity } = setup();
    await settle(harnesses[0]);

    act(() => harnesses[0].emit({ kind: 'live', grams: 150 }));
    expect(onQuantity).toHaveBeenLastCalledWith(150);
    expect(result.current.removing).toBe(false);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    act(() => harnesses[0].emit({ kind: 'live', grams: -90 }));
    expect(onQuantity).toHaveBeenLastCalledWith(90);
    expect(result.current.removing).toBe(true);
  });

  it('locks on a settled weight, ignores later live readings, and weigh again resumes', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { result, onQuantity } = setup();
    await settle(harnesses[0]);

    act(() => harnesses[0].emit({ kind: 'settled', grams: 176 }));
    expect(result.current.mode).toBe('locked');
    onQuantity.mockClear();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    act(() => harnesses[0].emit({ kind: 'live', grams: 0 }));
    expect(onQuantity).not.toHaveBeenCalled();
    expect(result.current.grams).toBe(176);

    act(() => result.current.weighAgain());
    expect(result.current.mode).toBe('following');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300); // let the throttle window from the ignored reading pass
    });
    act(() => harnesses[0].emit({ kind: 'live', grams: 40 }));
    expect(onQuantity).toHaveBeenLastCalledWith(40);
  });

  it('stops driving the field after a manual edit', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { result, onQuantity } = setup();
    await settle(harnesses[0]);

    act(() => result.current.markManual());
    act(() => harnesses[0].emit({ kind: 'live', grams: 300 }));
    expect(onQuantity).not.toHaveBeenCalled();
    expect(result.current.mode).toBe('manual');
  });

  it('throttles live readings to about four per second and delivers the latest', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { onQuantity } = setup();
    await settle(harnesses[0]);

    act(() => {
      for (let grams = 1; grams <= 10; grams += 1) {
        harnesses[0].emit({ kind: 'live', grams });
      }
    });
    expect(onQuantity.mock.calls.map((call) => call[0])).toEqual([1]);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(250);
    });
    expect(onQuantity.mock.calls.map((call) => call[0])).toEqual([1, 10]);
  });

  it('converts to ounces and follows unit changes (unit change)', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { result, onQuantity, rerender } = setup('oz');
    await settle(harnesses[0]);

    act(() => harnesses[0].emit({ kind: 'live', grams: 100 }));
    expect(onQuantity).toHaveBeenLastCalledWith(3.53);

    onQuantity.mockClear();
    rerender({ unit: 'cup' });
    expect(result.current.unitSupported).toBe(false);
    expect(onQuantity).not.toHaveBeenCalled();

    rerender({ unit: 'g' });
    expect(result.current.unitSupported).toBe(true);
    expect(onQuantity).toHaveBeenLastCalledWith(100);
  });

  it('closes the connection on unmount and ignores events after it', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { onQuantity, unmount } = setup();
    await settle(harnesses[0]);

    unmount();
    expect(harnesses[0].close).toHaveBeenCalledTimes(1);
    act(() => harnesses[0].emit({ kind: 'live', grams: 500 }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(onQuantity).not.toHaveBeenCalled();
  });

  it('closes a connection that resolves after unmount', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { unmount } = setup();
    unmount();
    await settle(harnesses[0]);
    expect(harnesses[0].close).toHaveBeenCalledTimes(1);
  });

  it('retries once silently after a lost link, then waits for a tap', async () => {
    useScaleStore.setState({ paired });
    const harnesses = installConnector();
    const { result } = setup();
    await settle(harnesses[0]);

    act(() => harnesses[0].emit({ kind: 'disconnected' }));
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('connecting');
    await settle(harnesses[1]);

    act(() => harnesses[1].emit({ kind: 'disconnected' }));
    expect(result.current.status).toBe('lost');
    expect(mockConnect).toHaveBeenCalledTimes(2);

    act(() => result.current.retry());
    expect(mockConnect).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('connecting');
  });
});
