import Papa from 'papaparse';
import type { VaultItemData } from '../types';

const COLUMNS: (keyof VaultItemData)[] = ['title', 'url', 'username', 'password', 'category', 'notes', 'totp'];

/** Plaintext CSV export. Round-trips through importFile() as 'generic-csv'. */
export function exportCsv(items: VaultItemData[]): string {
  return Papa.unparse({ fields: COLUMNS, data: items.map((i) => COLUMNS.map((c) => i[c])) });
}

/** Plaintext JSON export. Round-trips through importFile() as 'secure-vault-json'. */
export function exportJson(items: VaultItemData[]): string {
  return JSON.stringify(
    {
      format: 'secure-vault',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: items.map((i) => Object.fromEntries(COLUMNS.map((c) => [c, i[c]]))),
    },
    null,
    2,
  );
}
