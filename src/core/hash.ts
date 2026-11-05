/**
 * SHA-256 through WebCrypto (pages, workers and Node 20+), with no dependency. Hashes are lowercase hex.
 *
 * Every hash of a structured value is tagged with what it is (`smaltfl/<kind>/<version>`), so two different kinds
 * of value can never share a hash even if their canonical JSON were equal.
 */
import { canonicalJSON } from './canonical.js';

const encoder = new TextEncoder();

/** UTF-8 bytes of a string. */
export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text) as Uint8Array<ArrayBuffer>;
}

/** Lowercase hex of bytes. */
export function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Bytes of a lowercase or uppercase hex string. */
export function unhex(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text)) throw new TypeError('not a hex string');
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** SHA-256 of bytes or of a string's UTF-8 bytes. */
export async function sha256(data: Uint8Array<ArrayBuffer> | string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** SHA-256 as lowercase hex. */
export async function sha256Hex(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
  return hex(await sha256(data));
}

/** The hash of a JSON value of one kind: SHA-256 of `smaltfl/<kind>\n` and its canonical JSON. */
export async function hashOf(kind: string, value: unknown): Promise<string> {
  return sha256Hex(`smaltfl/${kind}\n${canonicalJSON(value)}`);
}
