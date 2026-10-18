import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import { useScaleScan } from '../hooks/useScaleScan';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScaleStore } from '../stores/scaleStore';
import type { RootStackScreenProps } from '../types/navigation';

type KitchenScaleSettingsScreenProps =
  RootStackScreenProps<'KitchenScaleSettings'>;

const KitchenScaleSettingsScreen: React.FC<
  KitchenScaleSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const paired = useScaleStore((state) => state.paired);
  const enabled = useScaleStore((state) => state.enabled);
  const setPaired = useScaleStore((state) => state.setPaired);
  const forget = useScaleStore((state) => state.forget);
  const setEnabled = useScaleStore((state) => state.setEnabled);
  const scan = useScaleScan();

  const header = useScreenHeader({
    title: t('kitchenScale.title', { defaultValue: 'Kitchen scale' }),
    left: { kind: 'back' },
  });

  const scanSubtitle = scan.scanning
    ? t('kitchenScale.scanning', {
        defaultValue: 'Scanning. Wake your scale by pressing its button.',
      })
    : t('kitchenScale.scanSubtitle', {
        defaultValue: 'Supported: Renpho Calibra+. Close the Renpho app first.',
      });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        {Platform.OS === 'ios' && (
          <SettingsRowGroup>
            <SettingsRow
              icon="scale"
              title={t('kitchenScale.experimentalIos', {
                defaultValue: 'Experimental on iOS',
              })}
            />
          </SettingsRowGroup>
        )}

        {paired && (
          <SettingsRowGroup>
            <SettingsRow
              icon="scale"
              title={paired.name}
              subtitle={t('kitchenScale.pairedTitle', {
                defaultValue: 'Your scale',
              })}
            />
            <SettingsRow
              title={t('kitchenScale.useScale', {
                defaultValue: 'Use scale when adding food',
              })}
              subtitle={t('kitchenScale.useScaleSubtitle', {
                defaultValue:
                  'Fills the quantity from the scale while you add a food.',
              })}
              subtitleNumberOfLines={0}
              rightAccessory={
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  accessibilityLabel={t('kitchenScale.useScaleAccessibility', {
                    defaultValue: 'Use scale when adding food',
                  })}
                />
              }
            />
            <SettingsRow
              title={t('kitchenScale.forget', {
                defaultValue: 'Forget this scale',
              })}
              onPress={forget}
            />
          </SettingsRowGroup>
        )}

        <SettingsRowGroup>
          <SettingsRow
            icon="scale"
            title={t('kitchenScale.scan', { defaultValue: 'Scan for scales' })}
            subtitle={scanSubtitle}
            subtitleNumberOfLines={0}
            onPress={() => {
              void scan.start();
            }}
          />
        </SettingsRowGroup>

        {scan.access === 'bluetooth-off' && (
          <SettingsRowGroup>
            <SettingsRow
              title={t('kitchenScale.bluetoothOff', {
                defaultValue: 'Bluetooth is off. Turn it on and scan again.',
              })}
            />
          </SettingsRowGroup>
        )}
        {scan.access === 'permission-denied' && (
          <SettingsRowGroup>
            <SettingsRow
              title={t('kitchenScale.permissionDenied', {
                defaultValue:
                  'Bluetooth permission is needed to find your scale.',
              })}
            />
          </SettingsRowGroup>
        )}
        {scan.error && (
          <SettingsRowGroup>
            <SettingsRow
              title={t('kitchenScale.scanError', {
                defaultValue: 'Scan failed: {{message}}',
                message: scan.error,
              })}
            />
          </SettingsRowGroup>
        )}

        {scan.results.length > 0 && (
          <SettingsRowGroup>
            {scan.results.map((result) => (
              <SettingsRow
                key={result.advertisement.deviceId}
                icon="scale"
                title={result.displayName}
                subtitle={
                  result.advertisement.name ?? result.advertisement.deviceId
                }
                onPress={() => {
                  scan.stop();
                  setPaired({
                    driverId: result.driverId,
                    deviceId: result.advertisement.deviceId,
                    name: result.advertisement.name ?? result.displayName,
                  });
                }}
              />
            ))}
          </SettingsRowGroup>
        )}
      </ScrollView>
    </View>
  );
};

export default KitchenScaleSettingsScreen;
