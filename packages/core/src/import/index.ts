import Papa from 'papaparse';
import { hostnameOf } from '../domain';
import { CATEGORIES, emptyItem, type Category, type VaultItemData } from '../types';

export type ImportFormat =
  | 'chrome-csv'
  | 'bitwarden-csv'
  | 'bitwarden-json'
  | '1password-csv'
  | 'secure-vault-json'
  | 'generic-csv';

export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  'chrome-csv': 'Chrome / Edge CSV',
  'bitwarden-csv': 'Bitwarden CSV',
  'bitwarden-json': 'Bitwarden JSON',
  '1password-csv': '1Password CSV',
  'secure-vault-json': 'Secure Vault JSON',
  'generic-csv': 'Generic CSV',
};

export interface ImportResult {
  format: ImportFormat;
  items: VaultItemData[];
  /** Rows that had neither a password nor a username, or were non-login types. */
  skipped: number;
}

type Row = Record<string, string>;

/** Guess a category from a folder / tag / collection name. */
export function inferCategory(...hints: (string | undefined)[]): Category {
  const text = hints.filter(Boolean).join(' ').toLowerCase();
  for (const c of CATEGORIES) if (c !== 'other' && text.includes(c)) return c;
  if (/(job|office|corp|team|company)/.test(text)) return 'work';
  if (/(facebook|twitter|instagram|linkedin|reddit|tiktok|social)/.test(text)) return 'social';
  return 'personal';
}

function titleFromUrl(url: string): string {
  return hostnameOf(url)?.replace(/^www\./, '') ?? '';
}

function finalize(partial: Partial<VaultItemData>): VaultItemData | null {
  const item = { ...emptyItem(), ...partial };
  for (const k of Object.keys(item) as (keyof VaultItemData)[]) {
    if (typeof item[k] === 'string') (item as Record<string, string>)[k] = (item[k] as string).trim();
  }
  if (!item.password && !item.username) return null;
  if (!item.title) item.title = titleFromUrl(item.url) || item.username || 'Untitled';
  if (!CATEGORIES.includes(item.category)) item.category = 'personal';
  return item;
}

function collect(format: ImportFormat, rows: Row[], map: (r: Row) => Partial<VaultItemData> | null): ImportResult {
  const items: VaultItemData[] = [];
  let skipped = 0;
  for (const r of rows) {
    const mapped = map(r);
    const item = mapped && finalize(mapped);
    if (item) items.push(item);
    else skipped++;
  }
  return { format, items, skipped };
}

/** Case-insensitive header lookup with aliases. */
const pick = (r: Row, ...keys: string[]): string => {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== '') return v;
  }
  return '';
};

function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const res = Papa.parse<Row>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return { headers: res.meta.fields ?? [], rows: res.data };
}

export function detectCsvFormat(headers: string[]): ImportFormat {
  const h = new Set(headers);
  if (h.has('login_password') || h.has('login_uri')) return 'bitwarden-csv';
  if (h.has('category')) return 'generic-csv'; // our own export
  if (h.has('otpauth') || (h.has('title') && (h.has('website') || h.has('url')) && h.has('password')))
    return '1password-csv';
  if (h.has('name') && h.has('url') && h.has('username') && h.has('password')) return 'chrome-csv';
  return 'generic-csv';
}

function importCsv(text: string): ImportResult {
  const { headers, rows } = parseCsv(text);
  const format = detectCsvFormat(headers);
  switch (format) {
    case 'bitwarden-csv':
      return collect(format, rows, (r) =>
        r.type && r.type !== 'login'
          ? null
          : {
              title: pick(r, 'name'),
              url: pick(r, 'login_uri').split(/[\n,]/)[0],
              username: pick(r, 'login_username'),
              password: pick(r, 'login_password'),
              totp: pick(r, 'login_totp'),
              notes: pick(r, 'notes'),
              category: inferCategory(pick(r, 'folder', 'collections')),
            },
      );
    case '1password-csv':
      return collect(format, rows, (r) => ({
        title: pick(r, 'title', 'name'),
        url: pick(r, 'url', 'website', 'urls', 'login_uri'),
        username: pick(r, 'username', 'login', 'email'),
        password: pick(r, 'password'),
        totp: pick(r, 'otpauth', 'one-time password', 'totp'),
        notes: pick(r, 'notes', 'notesplain'),
        category: inferCategory(pick(r, 'tags', 'type', 'vault')),
      }));
    case 'chrome-csv':
      return collect(format, rows, (r) => ({
        title: pick(r, 'name'),
        url: pick(r, 'url'),
        username: pick(r, 'username'),
        password: pick(r, 'password'),
        notes: pick(r, 'note', 'notes'),
      }));
    default:
      return collect(format, rows, (r) => ({
        title: pick(r, 'title', 'name', 'account'),
        url: pick(r, 'url', 'website', 'uri', 'login_uri', 'domain'),
        username: pick(r, 'username', 'user', 'login', 'email', 'login_username'),
        password: pick(r, 'password', 'pass', 'login_password'),
        totp: pick(r, 'totp', 'otp', 'otpauth'),
        notes: pick(r, 'notes', 'note', 'extra', 'comments'),
        category: CATEGORIES.includes(pick(r, 'category').toLowerCase() as Category)
          ? (pick(r, 'category').toLowerCase() as Category)
          : inferCategory(pick(r, 'category', 'folder', 'grouping', 'tags')),
      }));
  }
}

interface BitwardenJson {
  encrypted?: boolean;
  folders?: { id: string; name: string }[];
  items?: {
    type: number;
    name?: string;
    notes?: string | null;
    folderId?: string | null;
    login?: { username?: string | null; password?: string | null; totp?: string | null; uris?: { uri?: string | null }[] | null };
  }[];
}

function importJson(text: string): ImportResult {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (data.format === 'secure-vault' && Array.isArray(data.items)) {
    return collect('secure-vault-json', data.items as Row[], (r) => r as Partial<VaultItemData>);
  }
  const bw = data as BitwardenJson;
  if (bw.encrypted) throw new Error('This Bitwarden export is encrypted. Export as "JSON" (unencrypted) instead.');
  if (!Array.isArray(bw.items)) throw new Error('Unrecognised JSON format');
  const folders = new Map((bw.folders ?? []).map((f) => [f.id, f.name]));
  const rows = bw.items;
  const items: VaultItemData[] = [];
  let skipped = 0;
  for (const it of rows) {
    const item =
      it.type === 1 && it.login
        ? finalize({
            title: it.name ?? '',
            url: it.login.uris?.[0]?.uri ?? '',
            username: it.login.username ?? '',
            password: it.login.password ?? '',
            totp: it.login.totp ?? '',
            notes: it.notes ?? '',
            category: inferCategory(it.folderId ? folders.get(it.folderId) : undefined),
          })
        : null;
    if (item) items.push(item);
    else skipped++;
  }
  return { format: 'bitwarden-json', items, skipped };
}

/** Parses an export file from Bitwarden, 1Password, Chrome, or this app. */
export function importFile(fileName: string, text: string): ImportResult {
  const looksJson = fileName.toLowerCase().endsWith('.json') || /^\s*[{[]/.test(text);
  return looksJson ? importJson(text) : importCsv(text);
}
