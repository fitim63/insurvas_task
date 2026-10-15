import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export const cn = clsx;

type Variant = 'primary' | 'secondary' | 'ghost';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; small?: boolean }>(
  ({ variant = 'secondary', loading, small, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50',
        small ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm',
        variant === 'primary' && 'bg-indigo-600 text-white hover:bg-indigo-500',
        variant === 'secondary' && 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700',
        variant === 'ghost' && 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const IconButton = ({ label, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={cn(
      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 [&>svg]:h-3.5 [&>svg]:w-3.5',
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded-lg border-0 bg-white px-3 text-sm ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:bg-zinc-900 dark:ring-zinc-800',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{children}</p>;
}

export function Avatar({ title, url }: { title: string; url: string }) {
  let h = 0;
  for (const ch of url || title) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
      style={{ background: `linear-gradient(135deg, hsl(${h} 65% 52%), hsl(${(h + 40) % 360} 65% 42%))` }}
    >
      {(title || '?').charAt(0).toUpperCase()}
    </div>
  );
}
