import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from 'sonner';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const CLEAR_AFTER_MS = 30_000;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** Copies to the clipboard. Secrets are cleared again after 30 s (best effort). */
export async function copyText(value: string, label: string, secret = false): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`, { description: secret ? 'Clipboard clears in 30 seconds' : undefined });
    if (secret) {
      clearTimeout(clearTimer);
      clearTimer = setTimeout(async () => {
        try {
          if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
        } catch {
          /* page not focused / permission denied: nothing we can do */
        }
      }, CLEAR_AFTER_MS);
    }
  } catch {
    toast.error('Could not access the clipboard');
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Deterministic hue so each site gets a stable avatar colour (no favicon fetches). */
export function hueFor(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
