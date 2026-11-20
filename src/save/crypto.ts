/**
 * Save-file sealing: AES-256-GCM (authenticated encryption) with a per-save random salt + nonce.
 * Any changed byte, truncation, or blob moved to another slot fails authentication.
 *
 * We use @noble (pure JS, audited) instead of WebCrypto because:
 *  - WebCrypto only exists on HTTPS/localhost, which breaks testing on a phone over LAN;
 *  - it's synchronous, so saving in `pagehide` (tab closing) is reliable.
 *
 * LIMITATION (by design, documented in PLAN.md §8): the key ships in the game's JS. This stops
 * casual editing and save editors, not someone who reverse-engineers the bundle.
 */
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const BLOB_PREFIX = "MKSS1.";

// Key material is stored split and masked so it isn't a single greppable constant.
const P1 = [146, 168, 50, 112, 59, 217, 92, 247, 98, 35, 109, 131, 181, 128, 205, 16];
const P2 = [147, 154, 60, 117, 130, 198, 212, 27, 172, 90, 224, 81, 113, 174, 236, 89];
const MK = [205, 235, 23, 100, 3, 49, 237, 179, 85, 184, 203, 241, 224, 74, 195, 214, 42, 19, 228, 139, 69, 137, 239, 22, 86, 102, 164, 61, 84, 100, 217, 11];

let cachedIkm: Uint8Array | null = null;
function ikm(): Uint8Array {
  if (!cachedIkm) {
    const joined = P1.concat(P2);
    cachedIkm = sha256(Uint8Array.from(joined, (v, i) => v ^ MK[i] ^ ((i * 37 + 11) & 0xff)));
  }
  return cachedIkm;
}

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

function deriveKey(salt: Uint8Array): Uint8Array {
  return hkdf(sha256, ikm(), salt, enc.encode("mkss/save/v1"), 32);
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Encrypt + authenticate. `context` (e.g. the slot name) is bound as associated data. */
export function seal(plaintext: string, context: string): string {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const ct = gcm(deriveKey(salt), nonce, enc.encode(context)).encrypt(enc.encode(plaintext));
  const out = new Uint8Array(salt.length + nonce.length + ct.length);
  out.set(salt, 0);
  out.set(nonce, 16);
  out.set(ct, 28);
  return BLOB_PREFIX + toBase64Url(out);
}

/** Returns the plaintext, or null if the blob was modified, truncated, or used in the wrong context. */
export function open(blob: string, context: string): string | null {
  if (typeof blob !== "string" || !blob.startsWith(BLOB_PREFIX)) return null;
  const raw = fromBase64Url(blob.slice(BLOB_PREFIX.length));
  if (!raw || raw.length < 16 + 12 + 16) return null;
  try {
    const pt = gcm(deriveKey(raw.subarray(0, 16)), raw.subarray(16, 28), enc.encode(context)).decrypt(
      raw.subarray(28),
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}
