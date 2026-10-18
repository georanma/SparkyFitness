import {
  EMPTY_0X98_FRAME,
  encodeAck,
  encodeFrame,
} from '../../../../src/services/scale/calibra/codec';
import {
  CALIBRA_EVENT,
  CALIBRA_LIVE,
  createCalibraSession,
} from '../../../../src/services/scale/calibra/session';
import type {
  ScaleEvent,
  ScaleSession,
} from '../../../../src/services/scale/ScaleDriver';
import { toHex } from '../../../helpers/bytes';
import {
  FakeScaleTransport,
  flushPromises,
} from '../../../helpers/fakeScaleTransport';

const status = (seq: number, flags = 0x00) =>
  encodeFrame(0x10, Uint8Array.of(seq, flags, 0x3c, 1, 3, 0));
const settled = (seq: number, grams: number) => {
  const payload = new Uint8Array(5);
  payload[0] = seq;
  new DataView(payload.buffer).setInt32(1, grams, false);
  return encodeFrame(0x12, payload);
};
const live = (grams: number) => {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setInt32(0, grams, false);
  return encodeFrame(0x11, payload);
};

const startedSessions: ScaleSession[] = [];

async function startSession(transport: FakeScaleTransport) {
  const events: ScaleEvent[] = [];
  const diagnostics: string[] = [];
  const session = createCalibraSession(transport, {
    onDiagnostic: (message) => diagnostics.push(message),
  });
  startedSessions.push(session);
  await session.start((event) => events.push(event));
  return { session, events, diagnostics };
}

describe('createCalibraSession', () => {
  afterEach(async () => {
    // Stopping clears the 3 s start-fallback timer so none leaks between tests.
    await Promise.all(
      startedSessions.splice(0).map((session) => session.stop())
    );
    jest.useRealTimers();
  });

  it('subscribes to both characteristics', async () => {
    const transport = new FakeScaleTransport();
    await startSession(transport);
    expect(transport.isSubscribed(CALIBRA_LIVE)).toBe(true);
    expect(transport.isSubscribed(CALIBRA_EVENT)).toBe(true);
  });

  it('acks the first status frame and then sends the empty 0x98', async () => {
    const transport = new FakeScaleTransport();
    await startSession(transport);
    transport.emit(CALIBRA_EVENT, status(0));
    await flushPromises();
    expect(transport.writtenHex).toEqual([
      toHex(encodeAck(0x10, 0)),
      toHex(EMPTY_0X98_FRAME),
    ]);
  });

  it('sends the empty 0x98 only once', async () => {
    const transport = new FakeScaleTransport();
    await startSession(transport);
    transport.emit(CALIBRA_EVENT, status(0));
    transport.emit(CALIBRA_EVENT, status(1));
    await flushPromises();
    expect(transport.writtenHex).toEqual([
      toHex(encodeAck(0x10, 0)),
      toHex(EMPTY_0X98_FRAME),
      toHex(encodeAck(0x10, 1)),
    ]);
  });

  it('acks settled, button and 0x1c frames with their seq, but not live or replies', async () => {
    const transport = new FakeScaleTransport();
    await startSession(transport);
    transport.emit(CALIBRA_EVENT, settled(6, 176));
    transport.emit(CALIBRA_EVENT, encodeFrame(0x13, Uint8Array.of(3, 2, 1)));
    transport.emit(CALIBRA_EVENT, encodeFrame(0x1c, Uint8Array.of(12, 1, 0)));
    transport.emit(CALIBRA_LIVE, live(50));
    transport.emit(CALIBRA_EVENT, encodeFrame(0x18, Uint8Array.of(0, 1)));
    await flushPromises();
    expect(transport.writtenHex).toEqual([
      toHex(encodeAck(0x12, 6)),
      toHex(encodeAck(0x13, 3)),
      toHex(encodeAck(0x1c, 12)),
    ]);
  });

  it('emits live, settled and status events with signed grams', async () => {
    const transport = new FakeScaleTransport();
    const { events } = await startSession(transport);
    transport.emit(CALIBRA_LIVE, live(150));
    transport.emit(CALIBRA_LIVE, live(-176));
    transport.emit(CALIBRA_EVENT, settled(7, -150));
    transport.emit(CALIBRA_EVENT, status(8, 0x22));
    expect(events).toEqual([
      { kind: 'live', grams: 150 },
      { kind: 'live', grams: -176 },
      { kind: 'settled', grams: -150 },
      { kind: 'status', tareActive: true, displayUnit: 'g' },
    ]);
  });

  it('reassembles a segmented 0x1e frame and acks it with the frame seq', async () => {
    const transport = new FakeScaleTransport();
    await startSession(transport);
    const whole = encodeFrame(
      0x1e,
      Uint8Array.from([4, 1, ...new Array<number>(238).fill(7)])
    );
    transport.emit(
      CALIBRA_EVENT,
      Uint8Array.from([0xad, 4, 1, ...whole.slice(0, 120)])
    );
    transport.emit(
      CALIBRA_EVENT,
      Uint8Array.from([0xaf, 4, 0, ...whole.slice(120)])
    );
    await flushPromises();
    expect(transport.writtenHex).toEqual([toHex(encodeAck(0x1e, 4))]);
  });

  it('drops a corrupt frame without acking, and still handles the next one', async () => {
    const transport = new FakeScaleTransport();
    const { events, diagnostics } = await startSession(transport);
    const corrupt = settled(1, 99);
    corrupt[corrupt.length - 1] ^= 0xff;
    transport.emit(CALIBRA_EVENT, corrupt);
    transport.emit(CALIBRA_EVENT, settled(2, 100));
    await flushPromises();
    expect(events).toEqual([{ kind: 'settled', grams: 100 }]);
    expect(transport.writtenHex).toEqual([toHex(encodeAck(0x12, 2))]);
    expect(diagnostics.some((line) => line.includes('checksum'))).toBe(true);
  });

  it('ignores unknown commands without acking or emitting', async () => {
    const transport = new FakeScaleTransport();
    const { events, diagnostics } = await startSession(transport);
    transport.emit(CALIBRA_EVENT, encodeFrame(0x77, Uint8Array.of(5, 5)));
    await flushPromises();
    expect(events).toEqual([]);
    expect(transport.writes).toEqual([]);
    expect(diagnostics.some((line) => line.includes('0x77'))).toBe(true);
  });

  it('reports a rejected start frame', async () => {
    const transport = new FakeScaleTransport();
    const { diagnostics } = await startSession(transport);
    transport.emit(CALIBRA_EVENT, encodeFrame(0x18, Uint8Array.of(0, 0)));
    expect(diagnostics.some((line) => line.includes('rejected'))).toBe(true);
  });

  it('sends the start frame after 3 s even if no status ever arrives', async () => {
    jest.useFakeTimers();
    const transport = new FakeScaleTransport();
    await startSession(transport);
    await jest.advanceTimersByTimeAsync(3000);
    expect(transport.writtenHex).toEqual([toHex(EMPTY_0X98_FRAME)]);
  });

  it('survives a failed write and keeps emitting events', async () => {
    const transport = new FakeScaleTransport();
    const { events, diagnostics } = await startSession(transport);
    transport.failWrites = true;
    transport.emit(CALIBRA_EVENT, status(0));
    await flushPromises();
    transport.failWrites = false;
    transport.emit(CALIBRA_EVENT, settled(1, 42));
    expect(diagnostics.some((line) => line.includes('write failed'))).toBe(
      true
    );
    expect(events).toContainEqual({ kind: 'settled', grams: 42 });
  });

  it('emits disconnected when the link drops and ignores later chunks', async () => {
    const transport = new FakeScaleTransport();
    const { events } = await startSession(transport);
    transport.drop();
    transport.emit(CALIBRA_LIVE, live(10));
    expect(events).toEqual([{ kind: 'disconnected' }]);
  });

  it('ignores chunks after stop, unsubscribes, and cancels the start timer', async () => {
    jest.useFakeTimers();
    const transport = new FakeScaleTransport();
    const { session, events } = await startSession(transport);
    await session.stop();
    transport.emit(CALIBRA_LIVE, live(10));
    await jest.advanceTimersByTimeAsync(5000);
    expect(events).toEqual([]);
    expect(transport.writes).toEqual([]);
    expect(transport.isSubscribed(CALIBRA_LIVE)).toBe(false);
    expect(transport.isSubscribed(CALIBRA_EVENT)).toBe(false);
  });
});
