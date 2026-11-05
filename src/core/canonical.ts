/**
 * Canonical JSON (RFC 8785, the JSON Canonicalization Scheme): object keys sorted by UTF-16 code units, no
 * insignificant whitespace, numbers in ECMAScript's shortest round-trip form, strings escaped as
 * `JSON.stringify` escapes them. Equal values give equal text, so equal text gives equal hashes.
 *
 * Only plain JSON data is accepted: `undefined` object properties are left out (they are absent in JSON), but
 * `undefined` in an array, non-finite numbers, bigints, functions, symbols and objects other than plain objects
 * and arrays are refused, so nothing is silently changed on the way to a hash.
 */
export function canonicalJSON(value: unknown): string {
  return write(value, '$');
}

function write(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`canonical JSON: ${path} is ${value}, which JSON cannot hold`);
      return JSON.stringify(value); // -0 is written as 0, as RFC 8785 requires
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        const parts: string[] = [];
        for (let i = 0; i < value.length; i++) {
          if (value[i] === undefined) throw new TypeError(`canonical JSON: ${path}[${i}] is undefined`);
          parts.push(write(value[i], `${path}[${i}]`));
        }
        return `[${parts.join(',')}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError(`canonical JSON: ${path} is a ${proto?.constructor?.name ?? 'non-plain object'}, not a plain object`);
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((k) => record[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${write(record[k], `${path}.${k}`)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonical JSON: ${path} is a ${typeof value}, which JSON cannot hold`);
  }
}
