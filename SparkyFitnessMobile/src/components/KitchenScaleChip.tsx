import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';

import type { KitchenScale } from '../hooks/useKitchenScale';
import { formatLocalizedNumber } from '../localization';

interface KitchenScaleChipProps {
  scale: KitchenScale;
}

const KitchenScaleChip: React.FC<KitchenScaleChipProps> = ({ scale }) => {
  const { t } = useTranslation();
  const { status } = scale;

  if (status === 'unpaired' || status === 'disabled') return null;

  const line = (text: string, onPress?: () => void) =>
    onPress ? (
      <TouchableOpacity onPress={onPress} accessibilityRole="button">
        <Text className="text-accent-primary text-sm">{text}</Text>
      </TouchableOpacity>
    ) : (
      <Text className="text-text-secondary text-sm">{text}</Text>
    );

  const statusLine = (text: string, onPress?: () => void) => (
    <View className="mt-2">{line(text, onPress)}</View>
  );

  if (status === 'connecting') {
    return statusLine(
      t('kitchenScale.chip.connecting', {
        defaultValue: 'Connecting to scale...',
      })
    );
  }
  if (status === 'bluetooth-off') {
    return statusLine(
      t('kitchenScale.chip.bluetoothOff', { defaultValue: 'Bluetooth is off' })
    );
  }
  if (status === 'permission-denied') {
    return statusLine(
      t('kitchenScale.chip.permissionDenied', {
        defaultValue: 'Bluetooth permission needed',
      })
    );
  }
  if (status === 'not-found') {
    return statusLine(
      t('kitchenScale.chip.notFound', {
        defaultValue: 'Scale not found. Wake it and tap to retry',
      }),
      scale.retry
    );
  }
  if (status === 'lost') {
    return statusLine(
      t('kitchenScale.chip.lost', {
        defaultValue: 'Scale disconnected. Tap to retry',
      }),
      scale.retry
    );
  }

  if (!scale.unitSupported) {
    return statusLine(
      t('kitchenScale.chip.pickWeightUnit', {
        defaultValue: 'Pick a weight unit (g, oz) to use the scale',
      })
    );
  }
  if (scale.grams === null) {
    return statusLine(
      t('kitchenScale.chip.ready', {
        defaultValue: 'Scale ready. Place your food on it.',
      })
    );
  }

  const grams = formatLocalizedNumber(scale.grams, {
    maximumFractionDigits: 0,
  });
  const weight = scale.removing
    ? t('kitchenScale.chip.gramsRemoved', {
        defaultValue: '{{grams}} g removed',
        grams,
      })
    : t('kitchenScale.chip.grams', { defaultValue: '{{grams}} g', grams });

  return (
    <View className="mt-2 flex-row items-center">
      <Text className="text-text-primary text-sm font-medium mr-3">
        {weight}
      </Text>
      {scale.mode === 'locked' && (
        <Text className="text-text-secondary text-sm mr-3">
          {t('kitchenScale.chip.locked', { defaultValue: 'Weight kept' })}
        </Text>
      )}
      {scale.mode !== 'following' &&
        line(
          t('kitchenScale.chip.weighAgain', { defaultValue: 'Weigh again' }),
          scale.weighAgain
        )}
    </View>
  );
};

export default KitchenScaleChip;
