import type { ScaleDisplayUnit } from '../ScaleDriver';

export const CMD_STATUS = 0x10;
export const CMD_LIVE = 0x11;
export const CMD_SETTLED = 0x12;
/** App to scale: the frame that clears the scale's 10 second start watchdog. */
export const CMD_START = 0x98;
const CMD_START_REPLY = 0x18;

/** Scale-initiated frames the vendor app acknowledges. */
export const ACKED_COMMANDS: ReadonlySet<number> = new Set([
  CMD_STATUS,
  CMD_SETTLED,
  0x13,
  0x1c,
  0x1e,
]);

const HEAD_0 = 0x55;
const HEAD_1 = 0xaa;
const HEADER_LENGTH = 5; // 55 aa cmd len-hi len-lo
const SEGMENT_FIRST = 0xad;
const SEGMENT_MIDDLE = 0xae;
const SEGMENT_LAST = 0xaf;
const SEGMENT_HEADER_LENGTH = 3; // head, message id, segments remaining
const FLAG_SETTLED = 0x20;
const FLAG_TARE = 0x02;
const UNIT_BY_CODE: Readonly<Partial<Record<number, ScaleDisplayUnit>>> = {
  1: 'g',
  4: 'oz',
  5: 'ml',
};

export interface Frame {
  readonly cmd: number;
  readonly payload: Uint8Array;
}

export type ReadResult =
  | { readonly kind: 'frame'; readonly frame: Frame }
  | { readonly kind: 'partial' }
  | {
      readonly kind: 'invalid';
      readonly reason: 'header' | 'length' | 'checksum' | 'orphan-segment';
    };

export type CalibraMessage =
  | { readonly kind: 'live'; readonly grams: number }
  | { readonly kind: 'settled'; readonly seq: number; readonly grams: number }
  | {
      readonly kind: 'status';
      readonly seq: number;
      readonly settled: boolean;
      readonly tareActive: boolean;
      readonly displayUnit: ScaleDisplayUnit;
    }
  | { readonly kind: 'reply'; readonly cmd: number; readonly accepted: boolean }
  | {
      readonly kind: 'other';
      readonly cmd: number;
      readonly seq: number | null;
    };

/** 8-bit sum of every byte. */
export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const byte of bytes) sum = (sum + byte) & 0xff;
  return sum;
}

export function encodeFrame(
  cmd: number,
  payload: Uint8Array = new Uint8Array()
): Uint8Array {
  const frame = new Uint8Array(HEADER_LENGTH + payload.length + 1);
  frame.set([
    HEAD_0,
    HEAD_1,
    cmd,
    (payload.length >> 8) & 0xff,
    payload.length & 0xff,
  ]);
  frame.set(payload, HEADER_LENGTH);
  frame[frame.length - 1] = checksum(frame.subarray(0, frame.length - 1));
  return frame;
}

export function encodeAck(cmd: number, seq: number): Uint8Array {
  return encodeFrame(0x80 | cmd, Uint8Array.of(seq, 0x01));
}

export const EMPTY_0X98_FRAME: Uint8Array = encodeFrame(CMD_START);

function parseFrame(bytes: Uint8Array): ReadResult {
  if (
    bytes.length < HEADER_LENGTH + 1 ||
    bytes[0] !== HEAD_0 ||
    bytes[1] !== HEAD_1
  ) {
    return { kind: 'invalid', reason: 'header' };
  }
  const size = (bytes[3] << 8) | bytes[4];
  const total = HEADER_LENGTH + size + 1;
  if (bytes.length < total) return { kind: 'invalid', reason: 'length' };
  if (checksum(bytes.subarray(0, total - 1)) !== bytes[total - 1]) {
    return { kind: 'invalid', reason: 'checksum' };
  }
  return {
    kind: 'frame',
    frame: {
      cmd: bytes[2],
      payload: bytes.slice(HEADER_LENGTH, HEADER_LENGTH + size),
    },
  };
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * One reader per characteristic. Feeds on raw ATT values, joins segmented
 * frames (`ad`/`ae`/`af`) and returns a value for every chunk instead of throwing.
 */
export function createFrameReader(): (chunk: Uint8Array) => ReadResult {
  let pending: Uint8Array[] = [];
  return (chunk) => {
    const head = chunk[0];
    if (head === SEGMENT_FIRST) {
      pending = [chunk.slice(SEGMENT_HEADER_LENGTH)];
      return { kind: 'partial' };
    }
    if (head === SEGMENT_MIDDLE || head === SEGMENT_LAST) {
      if (pending.length === 0) {
        return { kind: 'invalid', reason: 'orphan-segment' };
      }
      pending.push(chunk.slice(SEGMENT_HEADER_LENGTH));
      if (head === SEGMENT_MIDDLE) return { kind: 'partial' };
      const whole = concat(pending);
      pending = [];
      return parseFrame(whole);
    }
    pending = []; // a plain frame abandons any half-built one
    return parseFrame(chunk);
  };
}

function readInt32(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getInt32(offset, false);
}

export function decodeMessage({ cmd, payload }: Frame): CalibraMessage {
  if (cmd === CMD_LIVE && payload.length === 4) {
    return { kind: 'live', grams: readInt32(payload, 0) };
  }
  if (cmd === CMD_SETTLED && payload.length === 5) {
    return { kind: 'settled', seq: payload[0], grams: readInt32(payload, 1) };
  }
  if (cmd === CMD_STATUS && payload.length === 6) {
    const flags = payload[1];
    return {
      kind: 'status',
      seq: payload[0],
      settled: (flags & FLAG_SETTLED) !== 0,
      tareActive: (flags & FLAG_TARE) !== 0,
      displayUnit: UNIT_BY_CODE[payload[3]] ?? 'unknown',
    };
  }
  if (cmd === CMD_START_REPLY) {
    return { kind: 'reply', cmd, accepted: payload[payload.length - 1] === 1 };
  }
  return { kind: 'other', cmd, seq: payload.length > 0 ? payload[0] : null };
}
