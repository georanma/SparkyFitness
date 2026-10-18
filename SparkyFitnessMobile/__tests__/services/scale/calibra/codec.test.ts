import {
  ACKED_COMMANDS,
  CMD_LIVE,
  EMPTY_0X98_FRAME,
  createFrameReader,
  decodeMessage,
  encodeAck,
  encodeFrame,
  type Frame,
  type ReadResult,
} from '../../../../src/services/scale/calibra/codec';
import { hex, toHex } from '../../../helpers/bytes';

function expectFrame(result: ReadResult): Frame {
  if (result.kind !== 'frame') {
    throw new Error(`expected a frame, got ${JSON.stringify(result)}`);
  }
  return result.frame;
}

describe('encoding', () => {
  it('builds the empty 0x98 start frame byte for byte', () => {
    expect(toHex(EMPTY_0X98_FRAME)).toBe('55aa98000097');
  });

  it.each([
    [0x10, 0, '55aa900002000192'],
    [0x13, 3, '55aa930002030198'],
    [0x1e, 4, '55aa9e00020401a4'],
    [0x12, 7, '55aa92000207019b'],
  ])('acks cmd 0x%s seq %s as the captured app did', (cmd, seq, expected) => {
    expect(toHex(encodeAck(cmd, seq))).toBe(expected);
  });

  it('acks exactly the five scale-initiated commands', () => {
    expect([...ACKED_COMMANDS].sort()).toEqual([0x10, 0x12, 0x13, 0x1c, 0x1e]);
  });
});

describe('createFrameReader', () => {
  it('parses a captured settled-weight frame', () => {
    const read = createFrameReader();
    const frame = expectFrame(read(hex('55aa12000504000000304a')));
    expect(frame.cmd).toBe(0x12);
    expect(toHex(frame.payload)).toBe('0400000030');
  });

  it('rejects a bad checksum', () => {
    const read = createFrameReader();
    expect(read(hex('55aa12000504000000304b'))).toEqual({
      kind: 'invalid',
      reason: 'checksum',
    });
  });

  it('rejects a chunk that is not a frame', () => {
    const read = createFrameReader();
    expect(read(hex('0102'))).toEqual({ kind: 'invalid', reason: 'header' });
    expect(read(hex('55aa1000ff00'))).toEqual({
      kind: 'invalid',
      reason: 'length',
    });
  });

  it('reassembles a segmented frame split over two chunks', () => {
    const payload = Uint8Array.from([4, 1, ...new Array<number>(238).fill(7)]);
    const whole = encodeFrame(0x1e, payload);
    const read = createFrameReader();

    const first = Uint8Array.from([0xad, 4, 1, ...whole.slice(0, 100)]);
    const last = Uint8Array.from([0xaf, 4, 0, ...whole.slice(100)]);

    expect(read(first)).toEqual({ kind: 'partial' });
    const frame = expectFrame(read(last));
    expect(frame.cmd).toBe(0x1e);
    expect(frame.payload[0]).toBe(4);
    expect(frame.payload.length).toBe(240);
  });

  it('reassembles three segments', () => {
    const whole = encodeFrame(0x1e, Uint8Array.from([9, 1, 2, 3, 4, 5, 6, 7]));
    const read = createFrameReader();
    expect(read(Uint8Array.from([0xad, 9, 2, ...whole.slice(0, 4)]))).toEqual({
      kind: 'partial',
    });
    expect(read(Uint8Array.from([0xae, 9, 1, ...whole.slice(4, 8)]))).toEqual({
      kind: 'partial',
    });
    const frame = expectFrame(
      read(Uint8Array.from([0xaf, 9, 0, ...whole.slice(8)]))
    );
    expect(frame.payload[0]).toBe(9);
  });

  it('recovers after an orphan segment', () => {
    const read = createFrameReader();
    expect(read(Uint8Array.from([0xaf, 4, 0, 1, 2, 3]))).toEqual({
      kind: 'invalid',
      reason: 'orphan-segment',
    });
    expect(expectFrame(read(hex('55aa12000504000000304a'))).cmd).toBe(0x12);
  });

  it('an unsegmented frame abandons a half-built one', () => {
    const read = createFrameReader();
    expect(read(Uint8Array.from([0xad, 4, 1, 0x55, 0xaa]))).toEqual({
      kind: 'partial',
    });
    expect(expectFrame(read(hex('55aa12000504000000304a'))).cmd).toBe(0x12);
    expect(read(Uint8Array.from([0xaf, 4, 0, 9]))).toEqual({
      kind: 'invalid',
      reason: 'orphan-segment',
    });
  });
});

describe('decodeMessage', () => {
  const live = (grams: number): Frame => {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setInt32(0, grams, false);
    return { cmd: CMD_LIVE, payload };
  };

  it('decodes positive and negative live weight', () => {
    expect(decodeMessage(live(176))).toEqual({ kind: 'live', grams: 176 });
    expect(decodeMessage(live(-176))).toEqual({ kind: 'live', grams: -176 });
  });

  it('decodes the captured settled frame (48 g, seq 4)', () => {
    const frame = expectFrame(
      createFrameReader()(hex('55aa12000504000000304a'))
    );
    expect(decodeMessage(frame)).toEqual({
      kind: 'settled',
      seq: 4,
      grams: 48,
    });
  });

  it('decodes the captured status frame: settled, tared, grams', () => {
    const frame = expectFrame(
      createFrameReader()(hex('55aa10000604223c0103007b'))
    );
    expect(decodeMessage(frame)).toEqual({
      kind: 'status',
      seq: 4,
      settled: true,
      tareActive: true,
      displayUnit: 'g',
    });
  });

  it.each([
    [4, 'oz'],
    [5, 'ml'],
    [9, 'unknown'],
  ])('maps display unit code %s to %s', (code, unit) => {
    const frame: Frame = {
      cmd: 0x10,
      payload: Uint8Array.from([1, 0, 0x3c, code, 3, 0]),
    };
    expect(decodeMessage(frame)).toMatchObject({
      kind: 'status',
      displayUnit: unit,
    });
  });

  it('reads the reply to the start frame', () => {
    expect(decodeMessage({ cmd: 0x18, payload: hex('0001') })).toEqual({
      kind: 'reply',
      cmd: 0x18,
      accepted: true,
    });
    expect(decodeMessage({ cmd: 0x18, payload: hex('0000') })).toEqual({
      kind: 'reply',
      cmd: 0x18,
      accepted: false,
    });
  });

  it('keeps unknown commands as "other" with their seq when present', () => {
    expect(decodeMessage({ cmd: 0x77, payload: hex('05aa') })).toEqual({
      kind: 'other',
      cmd: 0x77,
      seq: 5,
    });
    expect(decodeMessage({ cmd: 0x77, payload: new Uint8Array() })).toEqual({
      kind: 'other',
      cmd: 0x77,
      seq: null,
    });
  });
});
