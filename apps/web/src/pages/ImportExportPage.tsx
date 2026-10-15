import {
  atLeast,
  CATEGORY_LABELS,
  exportCsv,
  exportJson,
  IMPORT_FORMAT_LABELS,
  importFile,
  unlockWithPassword,
  wipe,
  type ImportResult,
} from '@vault/core';
import { AlertTriangle, Download, FileUp, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { cn, downloadFile, errorMessage } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

function ImportCard() {
  const { service, collections, refresh } = useUnlockedVault();
  const [result, setResult] = useState<(ImportResult & { fileName: string }) | null>(null);
  const [target, setTarget] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    try {
      const r = importFile(file.name, await file.text());
      setResult({ ...r, fileName: file.name });
      if (!r.items.length) toast.warning('No logins found in that file');
    } catch (e) {
      toast.error(`Could not read file: ${errorMessage(e)}`);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void readFile(f);
  }

  async function runImport() {
    if (!result) return;
    setProgress(0);
    try {
      const n = await service.createItems(result.items, collections.find((c) => c.id === target) ?? null, setProgress);
      toast.success(`Imported ${n} item${n === 1 ? '' : 's'}`);
      setResult(null);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Import</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Bitwarden (CSV or unencrypted JSON), 1Password CSV, Chrome/Edge CSV, or a Secure Vault export. The file is parsed and
        encrypted in your browser. Nothing is uploaded in plaintext.
      </p>

      {!result ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800',
          )}
        >
          <FileUp className="mb-2 h-6 w-6 text-zinc-400" />
          <p className="text-sm font-medium">Drop an export file here, or click to choose</p>
          <p className="text-xs text-zinc-500">.csv or .json</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{result.fileName}</span>
            <Badge tone="indigo">{IMPORT_FORMAT_LABELS[result.format]}</Badge>
            <Badge tone="emerald">{result.items.length} logins</Badge>
            {result.skipped > 0 && <Badge tone="amber">{result.skipped} skipped (non-login / empty)</Badge>}
          </div>
          <div className="max-h-72 overflow-auto rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Username</th>
                  <th className="px-3 py-2 font-medium">Website</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {result.items.slice(0, 200).map((i, idx) => (
                  <tr key={idx}>
                    <td className="max-w-40 truncate px-3 py-1.5">{i.title}</td>
                    <td className="max-w-40 truncate px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{i.username}</td>
                    <td className="max-w-48 truncate px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{i.url}</td>
                    <td className="px-3 py-1.5">{CATEGORY_LABELS[i.category]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.items.length > 200 && <p className="text-xs text-zinc-500">Showing first 200 of {result.items.length}.</p>}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Import into" className="min-w-56 flex-1">
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">My vault (private)</option>
                {collections
                  .filter((c) => atLeast(c.role, 'editor'))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button variant="ghost" onClick={() => setResult(null)} disabled={progress !== null}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void runImport()} loading={progress !== null} disabled={!result.items.length}>
              {progress !== null ? `Encrypting ${progress}/${result.items.length}` : <><Upload className="h-4 w-4" /> Import {result.items.length}</>}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ExportCard() {
  const { items } = useUnlockedVault();
  const [format, setFormat] = useState<'csv' | 'json'>('json');
  const [scope, setScope] = useState<'own' | 'all'>('own');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Re-authenticate locally before releasing plaintext.
      const check = await unlockWithPassword(supabase, password);
      wipe(check.userKey, check.privateKey);
      const data = items.filter((i) => scope === 'all' || i.source === 'own').map((i) => i.data);
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'csv') downloadFile(`secure-vault-${stamp}.csv`, exportCsv(data), 'text/csv');
      else downloadFile(`secure-vault-${stamp}.json`, exportJson(data), 'application/json');
      toast.success(`Exported ${data.length} items`);
      setPassword('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Export</h2>
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Exports are <b>unencrypted</b>. Anyone with the file can read every password. Store it safely and delete it when done.
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Format">
          <Select value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </Select>
        </Field>
        <Field label="Include">
          <Select value={scope} onChange={(e) => setScope(e.target.value as 'own' | 'all')}>
            <option value="own">Items I own</option>
            <option value="all">Everything I can access</option>
          </Select>
        </Field>
        <Field label="Confirm master password" className="sm:col-span-2">
          <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ImportExportPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Import & export</h1>
        <ImportCard />
        <ExportCard />
      </div>
    </div>
  );
}
