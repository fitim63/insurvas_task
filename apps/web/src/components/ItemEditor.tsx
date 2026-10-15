import {
  atLeast,
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_GENERATOR,
  emptyItem,
  generatePassword,
  parseTotp,
  type Category,
  type GeneratorOptions,
  type VaultItem,
  type VaultItemData,
} from '@vault/core';
import { Eye, EyeOff, RefreshCw, Wand2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PasswordStrength } from '@/components/PasswordStrength';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

function Generator({ onUse }: { onUse: (pw: string) => void }) {
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR);
  const [pw, setPw] = useState(() => generatePassword(DEFAULT_GENERATOR));
  const update = (o: GeneratorOptions) => {
    setOpts(o);
    setPw(generatePassword(o));
  };
  return (
    <div className="space-y-3 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all font-mono text-sm">{pw}</code>
        <Button type="button" size="icon" variant="ghost" onClick={() => setPw(generatePassword(opts))} aria-label="Regenerate">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="w-20 text-zinc-500">Length {opts.length}</span>
        <input
          type="range"
          min={8}
          max={64}
          value={opts.length}
          onChange={(e) => update({ ...opts, length: Number(e.target.value) })}
          className="flex-1 accent-indigo-600"
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {(['upper', 'lower', 'digits', 'symbols'] as const).map((k) => (
          <label key={k} className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={opts[k]} onChange={(e) => update({ ...opts, [k]: e.target.checked })} className="accent-indigo-600" />
            {{ upper: 'A-Z', lower: 'a-z', digits: '0-9', symbols: '!@#' }[k]}
          </label>
        ))}
      </div>
      <Button type="button" size="sm" variant="primary" onClick={() => onUse(pw)}>
        Use password
      </Button>
    </div>
  );
}

export function ItemEditor({
  open,
  onOpenChange,
  item,
  defaultCollectionId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: VaultItem;
  defaultCollectionId?: string | null;
  onSaved?: () => void;
}) {
  const { service, collections, refresh } = useUnlockedVault();
  const [data, setData] = useState<VaultItemData>(emptyItem());
  const [collectionId, setCollectionId] = useState<string>('');
  const [show, setShow] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const writableCollections = collections.filter((c) => atLeast(c.role, 'editor'));

  useEffect(() => {
    if (!open) return;
    setData(item ? { ...item.data } : emptyItem());
    setCollectionId(item ? '' : (defaultCollectionId ?? ''));
    setShow(false);
    setGenOpen(false);
  }, [open, item, defaultCollectionId]);

  const set = <K extends keyof VaultItemData>(k: K, v: VaultItemData[K]) => setData((d) => ({ ...d, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (data.totp && !parseTotp(data.totp)) return toast.error('TOTP must be a base32 secret or an otpauth:// URI');
    setBusy(true);
    try {
      if (item) {
        await service.updateItem(item, data);
        toast.success('Saved');
      } else {
        await service.createItems([data], collections.find((c) => c.id === collectionId) ?? null);
        toast.success('Added to vault');
      }
      await refresh();
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={item ? 'Edit item' : 'New login'} wide>
      <form onSubmit={submit} className="space-y-4" autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input required value={data.title} onChange={(e) => set('title', e.target.value)} placeholder="GitHub" autoFocus />
          </Field>
          <Field label="Category">
            <Select value={data.category} onChange={(e) => set('category', e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Website">
          <Input value={data.url} onChange={(e) => set('url', e.target.value)} placeholder="https://github.com/login" inputMode="url" />
        </Field>
        <Field label="Username / email">
          <Input value={data.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Password" htmlFor="item-password">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={show ? 'text' : 'password'}
                id="item-password"
                value={data.password}
                onChange={(e) => set('password', e.target.value)}
                className="pr-10 font-mono"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-400 hover:text-zinc-600"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button type="button" onClick={() => setGenOpen((o) => !o)} aria-expanded={genOpen}>
              <Wand2 className="h-4 w-4" /> Generate
            </Button>
          </div>
        </Field>
        {genOpen && (
          <Generator
            onUse={(pw) => {
              set('password', pw);
              setShow(true);
              setGenOpen(false);
            }}
          />
        )}
        <PasswordStrength password={data.password} userInputs={[data.username, data.title]} />
        <Field label="TOTP secret" hint="Base32 secret or otpauth:// URI from the site's 2FA setup (optional)">
          <Input value={data.totp} onChange={(e) => set('totp', e.target.value)} className="font-mono" autoComplete="off" />
        </Field>
        <Field label="Secure notes">
          <Textarea value={data.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </Field>
        {!item && writableCollections.length > 0 && (
          <Field label="Save to" hint="Items in a collection are visible to all of its members.">
            <Select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">My vault (private)</option>
              {writableCollections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {item ? 'Save changes' : 'Save to vault'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
