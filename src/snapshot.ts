export type SimulationSnapshot = {
  version: 1;
  width: number;
  height: number;
  particleSide: number;
  step: number;
  seed: number;
  positions: Float32Array;
  trail: Float32Array;
};

const MAX_BYTES = 48 * 1024 * 1024;
const MAX_TEXT_LENGTH = Math.ceil(MAX_BYTES / 3) * 4 + 4096;
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function invalid(reason: string): never {
  throw new Error(`Invalid simulation snapshot: ${reason}`);
}

function integer(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    invalid(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function metadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('expected an object');
  const source = value as Record<string, unknown>;
  if (source.version !== 1) invalid('unsupported version');
  const width = integer(source.width, 32, 2048, 'width');
  const height = integer(source.height, 32, 2048, 'height');
  const particleSide = integer(source.particleSide, 32, 1024, 'particleSide');
  const step = integer(source.step, 0, Number.MAX_SAFE_INTEGER, 'step');
  const seed = integer(source.seed, 0, 0xffffffff, 'seed');
  const positionsBytes = particleSide * particleSide * 4 * Float32Array.BYTES_PER_ELEMENT;
  const trailBytes = width * height * 4 * Float32Array.BYTES_PER_ELEMENT;
  if (positionsBytes + trailBytes > MAX_BYTES) invalid('decoded buffers exceed 48 MiB');
  return { source, width, height, particleSide, step, seed, positionsBytes, trailBytes };
}

function finiteBuffer(value: unknown, byteLength: number, name: string): Float32Array {
  if (!(value instanceof Float32Array) || value.byteLength !== byteLength) {
    invalid(`${name} must be a Float32Array of ${byteLength / 4} values`);
  }
  for (const number of value) {
    if (!Number.isFinite(number)) invalid(`${name} contains a nonfinite value`);
  }
  return value;
}

function swapEndian(bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i += 4) {
    const first = bytes[i], second = bytes[i + 1];
    bytes[i] = bytes[i + 3];
    bytes[i + 1] = bytes[i + 2];
    bytes[i + 2] = second;
    bytes[i + 3] = first;
  }
}

function encodeBuffer(values: Float32Array): string {
  let bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  if (!LITTLE_ENDIAN) {
    bytes = bytes.slice();
    swapEndian(bytes);
  }
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return btoa(chunks.join(''));
}

// Check both payloads before atob allocates either decoded binary string.
function base64(value: unknown, byteLength: number, name: string): string {
  const encodedLength = Math.ceil(byteLength / 3) * 4;
  if (typeof value !== 'string' || value.length !== encodedLength) invalid(`${name} byte length mismatch`);
  const padding = (3 - byteLength % 3) % 3;
  const dataLength = value.length - padding;
  for (let i = 0; i < dataLength; i++) {
    const code = value.charCodeAt(i);
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57) || code === 43 || code === 47)) {
      invalid(`${name} is not valid base64`);
    }
  }
  if (value.slice(dataLength) !== '='.repeat(padding)) invalid(`${name} has invalid base64 padding`);
  const last = BASE64_ALPHABET.indexOf(value[dataLength - 1]);
  if ((padding === 2 && (last & 15) !== 0) || (padding === 1 && (last & 3) !== 0)) {
    invalid(`${name} has invalid base64 padding bits`);
  }
  return value;
}

function decodeBuffer(encoded: string, byteLength: number, name: string): Float32Array {
  const binary = atob(encoded);
  if (binary.length !== byteLength || binary.length % 4 !== 0) invalid(`${name} byte length mismatch`);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (!LITTLE_ENDIAN) swapEndian(bytes);
  return finiteBuffer(new Float32Array(bytes.buffer), byteLength, name);
}

/** Serialize finite RGBA float buffers in a portable, little-endian format. */
export function encodeSnapshot(snapshot: SimulationSnapshot): string {
  const meta = metadata(snapshot);
  const positions = finiteBuffer(meta.source.positions, meta.positionsBytes, 'positions');
  const trail = finiteBuffer(meta.source.trail, meta.trailBytes, 'trail');
  return JSON.stringify({
    version: 1, endian: 'little', width: meta.width, height: meta.height,
    particleSide: meta.particleSide, step: meta.step, seed: meta.seed,
    positions: encodeBuffer(positions), trail: encodeBuffer(trail),
  });
}

/** Validate bounds and payload lengths before allocating simulation buffers. */
export function decodeSnapshot(text: string): SimulationSnapshot {
  if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) invalid('JSON exceeds size limit');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    invalid('malformed JSON');
  }
  const meta = metadata(value);
  if (meta.source.endian !== 'little') invalid('unsupported endian marker');
  const positions = base64(meta.source.positions, meta.positionsBytes, 'positions');
  const trail = base64(meta.source.trail, meta.trailBytes, 'trail');
  return {
    version: 1, width: meta.width, height: meta.height, particleSide: meta.particleSide,
    step: meta.step, seed: meta.seed,
    positions: decodeBuffer(positions, meta.positionsBytes, 'positions'),
    trail: decodeBuffer(trail, meta.trailBytes, 'trail'),
  };
}
