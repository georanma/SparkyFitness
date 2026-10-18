import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SCALE_STORE_KEY,
  __resetScaleStoreForTests,
  useScaleStore,
} from '../../src/stores/scaleStore';

const paired = {
  driverId: 'renpho-calibra-plus',
  deviceId: 'AA:BB',
  name: 'R-MSK03',
};

describe('scaleStore', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetScaleStoreForTests();
  });

  it('starts unpaired and enabled', () => {
    expect(useScaleStore.getState().paired).toBeNull();
    expect(useScaleStore.getState().enabled).toBe(true);
  });

  it('pairing stores the scale and turns the feature on', () => {
    useScaleStore.getState().setEnabled(false);
    useScaleStore.getState().setPaired(paired);
    expect(useScaleStore.getState().paired).toEqual(paired);
    expect(useScaleStore.getState().enabled).toBe(true);
  });

  it('forgetting clears the scale', () => {
    useScaleStore.getState().setPaired(paired);
    useScaleStore.getState().forget();
    expect(useScaleStore.getState().paired).toBeNull();
  });

  it('restores a saved pairing from storage', async () => {
    await AsyncStorage.setItem(
      SCALE_STORE_KEY,
      JSON.stringify({ state: { paired, enabled: false }, version: 1 })
    );
    await useScaleStore.persist.rehydrate();
    expect(useScaleStore.getState().paired).toEqual(paired);
    expect(useScaleStore.getState().enabled).toBe(false);
  });
});
