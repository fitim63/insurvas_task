import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Zxcvbn = (pw: string, userInputs?: string[]) => { score: 0 | 1 | 2 | 3 | 4; feedback: { warning: string | null } };

let loader: Promise<Zxcvbn> | null = null;

/** zxcvbn's dictionaries are ~1 MB, so load them only when a strength meter is shown. */
function loadZxcvbn(): Promise<Zxcvbn> {
  loader ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]).then(([core, common, en]) => {
    const z = new core.ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...en.dictionary },
      graphs: common.adjacencyGraphs,
      translations: en.translations,
    });
    return ((pw, inputs) => z.check(pw, inputs)) as Zxcvbn;
  });
  return loader;
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const COLORS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600'];

export function usePasswordScore(password: string, userInputs: string[] = []) {
  const [result, setResult] = useState<{ score: number; warning: string | null } | null>(null);
  const inputsKey = userInputs.join('|');
  useEffect(() => {
    if (!password) return setResult(null);
    let alive = true;
    void loadZxcvbn().then((z) => {
      if (!alive) return;
      const r = z(password, inputsKey.split('|'));
      setResult({ score: r.score, warning: r.feedback.warning });
    });
    return () => {
      alive = false;
    };
  }, [password, inputsKey]);
  return result;
}

export function PasswordStrength({ password, userInputs }: { password: string; userInputs?: string[] }) {
  const result = usePasswordScore(password, userInputs);
  if (!password) return null;
  const score = result?.score ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn('h-1 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800', result && i <= score && COLORS[score])}
          />
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        {result ? LABELS[score] : 'Checking…'}
        {result?.warning ? ` · ${result.warning}` : ''}
      </p>
    </div>
  );
}
