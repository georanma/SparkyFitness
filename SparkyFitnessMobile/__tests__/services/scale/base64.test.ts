import {
  base64ToBytes,
  bytesToBase64,
} from '../../../src/services/scale/base64';
import { hex, toHex } from '../../helpers/bytes';

describe('base64', () => {
  it('encodes the empty 0x98 frame as the ble-plx payload used in the spike', () => {
    expect(bytesToBase64(hex('55aa98000097'))).toBe('VaqYAACX');
  });

  it('round-trips every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_unused, index) => index);
    expect(toHex(base64ToBytes(bytesToBase64(all)))).toBe(toHex(all));
  });

  it('decodes an empty string to no bytes', () => {
    expect(base64ToBytes('').length).toBe(0);
  });
});
