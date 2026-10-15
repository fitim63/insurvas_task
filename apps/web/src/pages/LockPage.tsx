import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/AuthLayout';
import { Button, Card, Field, Input } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { useVault } from '@/state/vault';

export function LockPage() {
  const vault = useVault();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await vault.unlock(password);
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Vault locked" subtitle={vault.email ? <>Signed in as <b>{vault.email}</b></> : undefined}>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <input type="email" autoComplete="username" value={vault.email ?? ''} readOnly hidden />
          <Field label="Master password">
            <Input type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            {!busy && <Lock className="h-4 w-4" />}
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm">
        <button className="text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200" onClick={() => void vault.logOut()}>
          Log out
        </button>
      </p>
    </AuthLayout>
  );
}
