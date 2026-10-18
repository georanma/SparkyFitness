/** "55 aa 98" or "55aa98" -> bytes. */
export function hex(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text.replace(/\s+/g, ''), 'hex'));
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
