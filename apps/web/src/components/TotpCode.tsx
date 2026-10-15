import { totpNow, type TotpCode as Code } from '@vault/core';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copyText } from '@/lib/utils';

export function useTotp(secret: string): Code | null {
  const [code, setCode] = useState<Code | null>(null);
  useEffect(() => {
    if (!secret) return setCode(null);
    let alive = true;
    const tick = () => void totpNow(secret).then((c) => alive && setCode(c));
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [secret]);
  return code;
}

export function TotpCode({ secret }: { secret: string }) {
  const code = useTotp(secret);
  if (!code) return <span className="text-sm text-red-600">Invalid TOTP secret</span>;
  const pct = (code.remaining / code.period) * 100;
  return (
    <button
      type="button"
      onClick={() => void copyText(code.code, 'TOTP code', true)}
      className="group inline-flex items-center gap-3 rounded-lg py-1 text-left"
      title="Copy code"
    >
      <span className="font-mono text-xl tracking-[0.2em] tabular-nums">
        {code.code.slice(0, Math.ceil(code.code.length / 2))} {code.code.slice(Math.ceil(code.code.length / 2))}
      </span>
      <svg viewBox="0 0 36 36" className="h-6 w-6 -rotate-90" aria-label={`${code.remaining} seconds left`}>
        <circle cx="18" cy="18" r="15" fill="none" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          className={code.remaining <= 5 ? 'stroke-red-500' : 'stroke-indigo-500'}
          strokeWidth="4"
          strokeDasharray={`${(pct / 100) * 94.2} 94.2`}
        />
      </svg>
      <Copy className="h-4 w-4 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
