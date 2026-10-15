import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportCsv, exportJson, importFile } from '../src';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('importers', () => {
  it('Chrome CSV', () => {
    const r = importFile('Chrome Passwords.csv', fixture('chrome.csv'));
    expect(r.format).toBe('chrome-csv');
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ title: 'github.com', url: 'https://github.com/login', username: 'alice', password: 'gh-pass' });
    expect(r.items[2]?.notes).toBe('has, a comma');
  });

  it('Bitwarden CSV skips non-login rows and maps folders', () => {
    const r = importFile('bitwarden_export.csv', fixture('bitwarden.csv'));
    expect(r.format).toBe('bitwarden-csv');
    expect(r.items).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.items[0]).toMatchObject({ title: 'Slack', category: 'work', totp: 'JBSWY3DPEHPK3PXP' });
  });

  it('Bitwarden JSON', () => {
    const r = importFile('bitwarden.json', fixture('bitwarden.json'));
    expect(r.format).toBe('bitwarden-json');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ title: 'Twitter', url: 'https://twitter.com', category: 'social' });
  });

  it('1Password CSV', () => {
    const r = importFile('1password.csv', fixture('1password.csv'));
    expect(r.format).toBe('1password-csv');
    expect(r.items).toHaveLength(2);
    expect(r.items[1]).toMatchObject({ title: 'Bank', username: 'me@example.com', totp: 'otpauth://totp/Bank?secret=JBSWY3DPEHPK3PXP' });
  });

  it('rejects encrypted Bitwarden exports with a clear message', () => {
    expect(() => importFile('x.json', '{"encrypted":true,"items":[]}')).toThrow(/encrypted/);
  });

  it('round-trips through our own CSV and JSON exports', () => {
    const { items } = importFile('Chrome Passwords.csv', fixture('chrome.csv'));
    expect(importFile('vault.csv', exportCsv(items)).items).toEqual(items);
    expect(importFile('vault.json', exportJson(items)).items).toEqual(items);
  });
});
