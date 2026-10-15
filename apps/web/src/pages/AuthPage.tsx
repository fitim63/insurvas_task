import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/AuthLayout';
import { PasswordStrength, usePasswordScore } from '@/components/PasswordStrength';
import { Button, Card, Field, Input } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { useVault } from '@/state/vault';

const MIN_LENGTH = 10;

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const vault = useVault();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const signup = mode === 'signup';
  const score = usePasswordScore(signup ? password : '', [email]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (signup) {
      if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
      if ((score?.score ?? 0) < 2) return setError('That master password is too easy to guess.');
      if (password !== confirm) return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      if (signup) {
        const res = await vault.signUp(email, password);
        if (res.needsEmailConfirmation) setConfirmSent(true);
      } else {
        await vault.logIn(email, password);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (confirmSent) {
    return (
      <AuthLayout title="Check your inbox" subtitle={`We sent a confirmation link to ${email}.`}>
        <Card className="p-6 text-center text-sm">
          After confirming, <Link to="/login" className="font-medium text-indigo-600 hover:underline">log in</Link> with your
          master password.
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={signup ? 'Create your vault' : 'Welcome back'}
      subtitle={signup ? 'Your master password encrypts everything. We can never see or reset it.' : 'Log in to unlock your vault.'}
    >
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Master password" htmlFor="master-password">
            <div className="relative">
              <Input
                id="master-password"
                type={show ? 'text' : 'password'}
                autoComplete={signup ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
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
          </Field>
          {signup && (
            <>
              <PasswordStrength password={password} userInputs={[email]} />
              <Field label="Confirm master password">
                <Input type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            </>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            {busy ? (signup ? 'Generating keys…' : 'Deriving keys…') : signup ? 'Create account' : 'Log in'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-zinc-500">
        {signup ? 'Already have an account? ' : 'New here? '}
        <Link to={signup ? '/login' : '/signup'} className="font-medium text-indigo-600 hover:underline">
          {signup ? 'Log in' : 'Create an account'}
        </Link>
      </p>
    </AuthLayout>
  );
}
