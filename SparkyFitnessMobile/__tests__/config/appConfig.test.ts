import fs from 'fs';
import path from 'path';

describe('Bluetooth scale configuration', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../app.config.ts'),
    'utf8'
  );

  it('registers the BLE plugin foreground-only', () => {
    expect(source).toContain("'react-native-ble-plx'");
    expect(source).toContain('isBackgroundEnabled: false');
  });

  it('asserts neverForLocation so Android 12+ scans return results without location permission', () => {
    // bleTransport requests only BLUETOOTH_SCAN/CONNECT on API 31+; without
    // this flag Android filters scan results from an app that holds neither
    // neverForLocation nor location permission.
    expect(source).toContain('neverForLocation: true');
  });
});

describe('Expo native language configuration', () => {
  it('retains the native locale configuration and localized metadata settings', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../app.config.ts'),
      'utf8'
    );
    expect(source).toContain('nativeLanguageTags()');
    expect(source).toContain('supportedLocales');
    expect(source).not.toContain("ios: ['en', 'pl']");
    expect(source).not.toContain("android: ['en', 'pl']");
    expect(source).toContain('UIPrefersShowingLanguageSettings: true');
    expect(source).toContain('CFBundleAllowMixedLocalizations: true');
  });
});
