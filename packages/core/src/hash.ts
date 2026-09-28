/**
 * Deterministic hash bucketing, matching the backend exactly.
 *
 * The backend buckets a user into [0, 100) with
 * `int(md5(f"{user_id}:{flag_key}").hexdigest()[:8], 16) % 10000 / 100`
 * (`core_flags/services.py`). SDKs need the same bucket for the same
 * `(user_id, flag_key)` so a user sees the same variant or rollout side
 * from the server and from local evaluation.
 *
 * There is no synchronous Web Crypto MD5 (the Web Crypto API is async-only
 * and does not implement MD5 at all), and this SDK carries no runtime
 * dependencies, so MD5 is vendored here as a small, self-contained,
 * synchronous implementation of RFC 1321. It works identically in the
 * browser, Node and edge runtimes because it only uses plain JS numbers,
 * bitwise ops and `TextEncoder` -- no `Buffer`, no `crypto` module.
 */

// RFC 1321 S values: shift amounts per round.
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

// RFC 1321 K values: floor(abs(sin(i + 1)) * 2^32), for i in 0..63.
const K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function rotateLeft(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

// 32-bit unsigned addition, wrapping like the reference C implementation.
function addUnsigned(a: number, b: number): number {
  return (a + b) >>> 0;
}

/**
 * Pad and length-append the message, per RFC 1321 3.1-3.2, then split it into
 * 512-bit (16 x 32-bit little-endian word) blocks.
 */
function toBlocks(bytes: Uint8Array): Uint32Array[] {
  const bitLength = bytes.length * 8;

  // +1 for the mandatory 0x80 byte, +8 for the 64-bit length, then round up
  // to a multiple of 64 bytes.
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  // Length in bits, little-endian 64-bit (only the low 32 bits matter for
  // any input this SDK will ever hash).
  const lengthOffset = paddedLength - 8;
  padded[lengthOffset] = bitLength & 0xff;
  padded[lengthOffset + 1] = (bitLength >>> 8) & 0xff;
  padded[lengthOffset + 2] = (bitLength >>> 16) & 0xff;
  padded[lengthOffset + 3] = (bitLength >>> 24) & 0xff;
  // bitLength as a JS number stays exact well past any realistic input size,
  // so the high 32 bits of the 64-bit length are always zero here.

  const blocks: Uint32Array[] = [];
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      const base = offset + i * 4;
      words[i] =
        padded[base] | (padded[base + 1] << 8) | (padded[base + 2] << 16) | (padded[base + 3] << 24);
    }
    blocks.push(words);
  }

  return blocks;
}

/** MD5 of a UTF-8 encoded string, as lowercase hex -- the same shape as Python's `hashlib.md5(...).hexdigest()`. */
export function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const blocks = toBlocks(bytes);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (const block of blocks) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      f = addUnsigned(f, addUnsigned(a, addUnsigned(K[i], block[g])));
      a = d;
      d = c;
      c = b;
      b = addUnsigned(b, rotateLeft(f, S[i]));
    }

    a0 = addUnsigned(a0, a);
    b0 = addUnsigned(b0, b);
    c0 = addUnsigned(c0, c);
    d0 = addUnsigned(d0, d);
  }

  return [a0, b0, c0, d0].map(toLittleEndianHex).join("");
}

function toLittleEndianHex(word: number): string {
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Deterministic bucket in [0, 100) for one (userId, flagKey) pair.
 *
 * Mirrors `_hash_bucket` in `core_flags/services.py` exactly: same salt
 * format (`${userId}:${flagKey}`), same 8 hex digits taken from the front of
 * the digest, same modulo/divide. `userId` is stringified with `String(...)`,
 * matching Python's f-string interpolation of a non-string user id.
 */
export function hashBucket(userId: unknown, flagKey: string): number {
  const digest = md5Hex(`${String(userId)}:${flagKey}`);
  const leading8 = parseInt(digest.slice(0, 8), 16);
  return (leading8 % 10000) / 100;
}
