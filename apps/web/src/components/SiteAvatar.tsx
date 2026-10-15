import { registrableDomain } from '@vault/core';
import { cn, hueFor } from '@/lib/utils';

/**
 * Letter avatar. We deliberately don't load favicons: fetching them from a third-party
 * service would leak the list of sites in your vault.
 */
export function SiteAvatar({ title, url, className }: { title: string; url: string; className?: string }) {
  const key = registrableDomain(url) ?? title;
  const letter = (title || key || '?').trim().charAt(0).toUpperCase();
  const hue = hueFor(key || title);
  return (
    <div
      aria-hidden
      className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white', className)}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 52%), hsl(${(hue + 40) % 360} 65% 42%))` }}
    >
      {letter}
    </div>
  );
}
