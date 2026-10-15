import { changeMasterPassword, fingerprint } from '@vault/core';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PasswordStrength } from '@/components/PasswordStrength';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

const LOCK_OPTIONS = [1, 5, 15, 30, 60, 240];

function ChangePasswordCard() {
  const { keys } = useUnlockedVault();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 10) return toast.error('Use at least 10 characters.');
    if (next !== confirm) return toast.error('New passwords do not match.');
    setBusy(true);
    try {
      await changeMasterPassword(supabase, keys, current, next);
      toast.success('Master password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Change master password</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Only your vault key is re-encrypted. Items and shares stay as they are. There is no recovery: if you forget it, your
        data is gone.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Current master password">
          <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New master password">
          <Input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <PasswordStrength password={next} userInputs={[keys.email]} />
        <Field label="Confirm new master password">
          <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const { keys, autoLockMinutes, setAutoLockMinutes } = useUnlockedVault();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <Card className="p-6">
          <h2 className="font-semibold">Account</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Email</dt>
              <dd>{keys.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Public key fingerprint</dt>
              <dd className="font-mono">{fingerprint(keys.publicKey)}</dd>
              <dd className="mt-1 text-xs text-zinc-500">
                Compare this over a trusted channel with people who share with you. It shows them they're encrypting to
                the right key.
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">Auto-lock</h2>
          <p className="mt-1 text-sm text-zinc-500">Clear decrypted data from memory after a period of inactivity.</p>
          <Field label="Lock after" className="mt-4 max-w-xs">
            <Select value={autoLockMinutes} onChange={(e) => setAutoLockMinutes(Number(e.target.value))}>
              {LOCK_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} minute${m === 1 ? '' : 's'}` : `${m / 60} hour${m === 60 ? '' : 's'}`}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <ChangePasswordCard />
      </div>
    </div>
  );
}
