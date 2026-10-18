import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import KitchenScaleChip from '../../src/components/KitchenScaleChip';
import type { KitchenScale } from '../../src/hooks/useKitchenScale';

const scale = (overrides: Partial<KitchenScale> = {}): KitchenScale => ({
  status: 'ready',
  grams: null,
  removing: false,
  mode: 'following',
  unitSupported: true,
  weighAgain: jest.fn(),
  markManual: jest.fn(),
  retry: jest.fn(),
  ...overrides,
});

describe('KitchenScaleChip', () => {
  it.each(['unpaired', 'disabled'] as const)(
    'renders nothing when %s',
    (status) => {
      const screen = render(<KitchenScaleChip scale={scale({ status })} />);
      expect(screen.toJSON()).toBeNull();
    }
  );

  it('says it is connecting, then ready', () => {
    expect(
      render(
        <KitchenScaleChip scale={scale({ status: 'connecting' })} />
      ).getByText('Connecting to scale...')
    ).toBeTruthy();
    expect(
      render(<KitchenScaleChip scale={scale()} />).getByText(
        'Scale ready. Place your food on it.'
      )
    ).toBeTruthy();
  });

  it('asks for a weight unit when the selected unit is not a mass', () => {
    const screen = render(
      <KitchenScaleChip scale={scale({ unitSupported: false })} />
    );
    expect(
      screen.getByText('Pick a weight unit (g, oz) to use the scale')
    ).toBeTruthy();
  });

  it('shows the weight and says "removed" for a negative reading', () => {
    expect(
      render(<KitchenScaleChip scale={scale({ grams: 142 })} />).getByText(
        '142 g'
      )
    ).toBeTruthy();
    expect(
      render(
        <KitchenScaleChip scale={scale({ grams: 150, removing: true })} />
      ).getByText('150 g removed')
    ).toBeTruthy();
  });

  it('offers "Weigh again" when the weight is kept or after a manual edit', () => {
    const locked = scale({ grams: 176, mode: 'locked' });
    const screen = render(<KitchenScaleChip scale={locked} />);
    expect(screen.getByText('Weight kept')).toBeTruthy();
    fireEvent.press(screen.getByText('Weigh again'));
    expect(locked.weighAgain).toHaveBeenCalledTimes(1);

    const manual = scale({ grams: 50, mode: 'manual' });
    const manualScreen = render(<KitchenScaleChip scale={manual} />);
    fireEvent.press(manualScreen.getByText('Weigh again'));
    expect(manual.weighAgain).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['bluetooth-off', 'Bluetooth is off'],
    ['permission-denied', 'Bluetooth permission needed'],
  ] as const)('explains %s', (status, text) => {
    expect(
      render(<KitchenScaleChip scale={scale({ status })} />).getByText(text)
    ).toBeTruthy();
  });

  it.each([
    ['not-found', 'Scale not found. Wake it and tap to retry'],
    ['lost', 'Scale disconnected. Tap to retry'],
  ] as const)('retries when tapped in the %s state', (status, text) => {
    const current = scale({ status });
    const screen = render(<KitchenScaleChip scale={current} />);
    fireEvent.press(screen.getByText(text));
    expect(current.retry).toHaveBeenCalledTimes(1);
  });
});
