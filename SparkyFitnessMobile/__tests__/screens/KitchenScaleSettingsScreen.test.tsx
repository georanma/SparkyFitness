import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import KitchenScaleSettingsScreen from '../../src/screens/KitchenScaleSettingsScreen';
import { useScaleScan, type ScaleScan } from '../../src/hooks/useScaleScan';
import {
  __resetScaleStoreForTests,
  useScaleStore,
} from '../../src/stores/scaleStore';

jest.mock('../../src/hooks/useScaleScan');
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseScan = useScaleScan as jest.MockedFunction<typeof useScaleScan>;

// useScreenHeader calls useNavigation(); sibling settings tests mock it the same way.
const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
} as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const scan = (overrides: Partial<ScaleScan> = {}): ScaleScan => ({
  access: null,
  scanning: false,
  results: [],
  error: null,
  start: jest.fn(async () => undefined),
  stop: jest.fn(),
  ...overrides,
});

const navigation = mockNavigation;
const route = { params: {} } as never;

describe('KitchenScaleSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetScaleStoreForTests();
  });

  it('starts a scan when the scan row is pressed', () => {
    const current = scan();
    mockUseScan.mockReturnValue(current);
    const screen = render(
      <KitchenScaleSettingsScreen navigation={navigation} route={route} />
    );
    fireEvent.press(screen.getByText('Scan for scales'));
    expect(current.start).toHaveBeenCalledTimes(1);
  });

  it('pairs a scale from the results', () => {
    mockUseScan.mockReturnValue(
      scan({
        results: [
          {
            advertisement: {
              deviceId: 'AA:BB',
              name: 'R-MSK03',
              serviceUuids: [],
            },
            driverId: 'renpho-calibra-plus',
            displayName: 'Renpho Calibra+',
          },
        ],
      })
    );
    const screen = render(
      <KitchenScaleSettingsScreen navigation={navigation} route={route} />
    );
    fireEvent.press(screen.getByText('Renpho Calibra+'));
    expect(useScaleStore.getState().paired).toEqual({
      driverId: 'renpho-calibra-plus',
      deviceId: 'AA:BB',
      name: 'R-MSK03',
    });
  });

  it('shows the paired scale and forgets it', () => {
    mockUseScan.mockReturnValue(scan());
    useScaleStore.getState().setPaired({
      driverId: 'renpho-calibra-plus',
      deviceId: 'AA:BB',
      name: 'R-MSK03',
    });
    const screen = render(
      <KitchenScaleSettingsScreen navigation={navigation} route={route} />
    );
    expect(screen.getByText('R-MSK03')).toBeTruthy();
    fireEvent.press(screen.getByText('Forget this scale'));
    expect(useScaleStore.getState().paired).toBeNull();
  });

  it('explains Bluetooth being off or permission being refused', () => {
    mockUseScan.mockReturnValue(scan({ access: 'bluetooth-off' }));
    const off = render(
      <KitchenScaleSettingsScreen navigation={navigation} route={route} />
    );
    expect(
      off.getByText('Bluetooth is off. Turn it on and scan again.')
    ).toBeTruthy();

    mockUseScan.mockReturnValue(scan({ access: 'permission-denied' }));
    const denied = render(
      <KitchenScaleSettingsScreen navigation={navigation} route={route} />
    );
    expect(
      denied.getByText('Bluetooth permission is needed to find your scale.')
    ).toBeTruthy();
  });
});
