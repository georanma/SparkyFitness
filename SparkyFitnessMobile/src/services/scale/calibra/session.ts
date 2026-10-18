import type {
  GattAddress,
  ScaleEvent,
  ScaleSession,
  ScaleTransport,
} from '../ScaleDriver';
import {
  ACKED_COMMANDS,
  CMD_STATUS,
  EMPTY_0X98_FRAME,
  createFrameReader,
  decodeMessage,
  encodeAck,
  type ReadResult,
} from './codec';

const SERVICE = '00001a10-0000-1000-8000-00805f9b34fb';
export const CALIBRA_WRITE: GattAddress = {
  service: SERVICE,
  characteristic: '00001a11-0000-1000-8000-00805f9b34fb',
};
export const CALIBRA_LIVE: GattAddress = {
  service: SERVICE,
  characteristic: '00001a12-0000-1000-8000-00805f9b34fb',
};
export const CALIBRA_EVENT: GattAddress = {
  service: SERVICE,
  characteristic: '00001a13-0000-1000-8000-00805f9b34fb',
};

/** If no status frame arrives to trigger the start frame, send it anyway. */
const START_FALLBACK_MS = 3000;

export interface CalibraSessionOptions {
  readonly onDiagnostic?: (message: string) => void;
}

function hexCmd(cmd: number): string {
  return `0x${cmd.toString(16).padStart(2, '0')}`;
}

export function createCalibraSession(
  transport: ScaleTransport,
  options: CalibraSessionOptions = {}
): ScaleSession {
  const diagnostic = options.onDiagnostic ?? (() => undefined);
  const liveReader = createFrameReader();
  const eventReader = createFrameReader();
  let emit: (event: ScaleEvent) => void = () => undefined;
  let writes: Promise<void> = Promise.resolve();
  let stopped = false;
  let startSent = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let releases: (() => void)[] = [];

  const write = (bytes: Uint8Array): void => {
    writes = writes
      .then(() => transport.write(CALIBRA_WRITE, bytes))
      .catch((error: unknown) => {
        diagnostic(`write failed: ${String(error)}`);
      });
  };

  const sendStart = (): void => {
    if (startSent || stopped) return;
    startSent = true;
    write(EMPTY_0X98_FRAME);
  };

  const handleRead = (result: ReadResult): void => {
    if (result.kind === 'partial') return;
    if (result.kind === 'invalid') {
      diagnostic(`dropped frame: ${result.reason}`);
      return;
    }
    const { frame } = result;
    const message = decodeMessage(frame);

    if (ACKED_COMMANDS.has(frame.cmd) && frame.payload.length > 0) {
      write(encodeAck(frame.cmd, frame.payload[0]));
    }
    if (frame.cmd === CMD_STATUS) sendStart();

    switch (message.kind) {
      case 'live':
        emit({ kind: 'live', grams: message.grams });
        break;
      case 'settled':
        emit({ kind: 'settled', grams: message.grams });
        break;
      case 'status':
        emit({
          kind: 'status',
          tareActive: message.tareActive,
          displayUnit: message.displayUnit,
        });
        break;
      case 'reply':
        if (!message.accepted) {
          diagnostic(`start frame rejected (${hexCmd(message.cmd)})`);
        }
        break;
      case 'other':
        diagnostic(`ignored command ${hexCmd(message.cmd)}`);
        break;
    }
  };

  const onChunk =
    (reader: (chunk: Uint8Array) => ReadResult) => (bytes: Uint8Array) => {
      if (!stopped) handleRead(reader(bytes));
    };

  const release = (): void => {
    if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
    releases.forEach((fn) => fn());
    releases = [];
  };

  return {
    async start(onEvent) {
      emit = onEvent;
      releases = [
        transport.subscribe(CALIBRA_LIVE, onChunk(liveReader)),
        transport.subscribe(CALIBRA_EVENT, onChunk(eventReader)),
        transport.onDisconnected(() => {
          if (stopped) return;
          stopped = true;
          release();
          emit({ kind: 'disconnected' });
        }),
      ];
      fallbackTimer = setTimeout(sendStart, START_FALLBACK_MS);
    },
    async stop() {
      stopped = true;
      release();
    },
  };
}
