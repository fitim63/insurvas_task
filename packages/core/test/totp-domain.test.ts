import { describe, expect, it } from 'vitest';
import { generatePassword, hotp, matchItems, matchUrl, parseTotp, registrableDomain, totpNow } from '../src';

// RFC 6238 Appendix B test vectors (8 digits). Secrets are the ASCII seeds, base32-encoded.
const SHA1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
const SHA256 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA';
const SHA512 =
  'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA';

describe('TOTP (RFC 6238)', () => {
  const cases: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1234567890, '89005924', '91819424', '93441116'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  it.each(cases)('t=%i', async (t, e1, e256, e512) => {
    const counter = Math.floor(t / 30);
    const p1 = parseTotp(`otpauth://totp/x?secret=${SHA1}&digits=8`)!;
    const p256 = parseTotp(`otpauth://totp/x?secret=${SHA256}&digits=8&algorithm=SHA256`)!;
    const p512 = parseTotp(`otpauth://totp/x?secret=${SHA512}&digits=8&algorithm=SHA512`)!;
    expect(await hotp(p1, counter)).toBe(e1);
    expect(await hotp(p256, counter)).toBe(e256);
    expect(await hotp(p512, counter)).toBe(e512);
  });

  it('accepts a bare base32 secret and reports time remaining', async () => {
    const res = await totpNow('gezd gnbv gy3t qojq', 59_000);
    expect(res?.code).toHaveLength(6);
    expect(res?.remaining).toBe(1);
  });

  it('returns null for garbage', async () => {
    expect(await totpNow('not base32!!')).toBeNull();
    expect(await totpNow('')).toBeNull();
  });
});

describe('domain matching', () => {
  it('reduces to the registrable domain', () => {
    expect(registrableDomain('https://app.github.com/login')).toBe('github.com');
    expect(registrableDomain('accounts.google.co.uk')).toBe('google.co.uk');
    expect(registrableDomain('http://localhost:3000')).toBe('localhost');
  });

  it('matches subdomains but not look-alikes', () => {
    expect(matchUrl('github.com', 'https://app.github.com/')).toBe('domain');
    expect(matchUrl('https://www.github.com', 'https://github.com/login')).toBe('exact');
    expect(matchUrl('github.com', 'https://github.com.evil.io/')).toBeNull();
    expect(matchUrl('github.com', 'https://notgithub.com/')).toBeNull();
    expect(matchUrl('', 'https://github.com/')).toBeNull();
  });

  it('keeps separate tenants of a public-suffix host apart', () => {
    expect(matchUrl('https://alice.github.io', 'https://bob.github.io')).toBeNull();
  });

  it('ranks exact host matches first', () => {
    const items = ['github.com', 'https://gist.github.com', 'gitlab.com'];
    expect(matchItems(items, 'https://gist.github.com/x', (s) => s)).toEqual(['https://gist.github.com', 'github.com']);
  });
});

describe('password generator', () => {
  it('honours length and character sets', () => {
    const pw = generatePassword({ length: 32, lower: true, upper: true, digits: true, symbols: false });
    expect(pw).toHaveLength(32);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).not.toMatch(/[^a-zA-Z0-9]/);
  });
});
