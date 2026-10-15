/**
 * RFC 6238 TOTP using WebCrypto (works in browsers, MV3 service workers and Node 20+).
 * Accepts an otpauth:// URI or a bare base32 secret.
 */
export interface TotpParams {
  secret: Uint8Array;
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
  digits: number;
  period: number;
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function parseTotp(input: string): TotpParams | null {
  const s = input.trim();
  if (!s) return null;
  try {
    if (s.toLowerCase().startsWith('otpauth://')) {
      const u = new URL(s);
      const secret = u.searchParams.get('secret');
      if (!secret) return null;
      const alg = (u.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '');
      return {
        secret: base32Decode(secret),
        algorithm: alg === 'SHA256' ? 'SHA-256' : alg === 'SHA512' ? 'SHA-512' : 'SHA-1',
        digits: Number(u.searchParams.get('digits') ?? 6) || 6,
        period: Number(u.searchParams.get('period') ?? 30) || 30,
      };
    }
    return { secret: base32Decode(s), algorithm: 'SHA-1', digits: 6, period: 30 };
  } catch {
    return null;
  }
}

export async function hotp(params: TotpParams, counter: number): Promise<string> {
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    'raw',
    params.secret as BufferSource,
    { name: 'HMAC', hash: params.algorithm },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;
  return String(bin % 10 ** params.digits).padStart(params.digits, '0');
}

export interface TotpCode {
  code: string;
  /** Seconds until the code rotates. */
  remaining: number;
  period: number;
}

export async function totpNow(input: string, nowMs = Date.now()): Promise<TotpCode | null> {
  const p = parseTotp(input);
  if (!p || p.secret.length === 0) return null;
  const t = Math.floor(nowMs / 1000);
  const code = await hotp(p, Math.floor(t / p.period));
  return { code, remaining: p.period - (t % p.period), period: p.period };
}
