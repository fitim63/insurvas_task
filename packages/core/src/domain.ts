import { getDomain, getHostname } from 'tldts';

/** Accepts bare hosts ("github.com") as well as full URLs. */
function toUrlish(input: string): string {
  const s = input.trim();
  if (!s) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}

export function hostnameOf(input: string): string | null {
  if (!input.trim()) return null;
  return getHostname(toUrlish(input))?.toLowerCase() ?? null;
}

/**
 * Registrable domain (eTLD+1) using the Public Suffix List, e.g.
 * app.github.com -> github.com, foo.bar.co.uk -> bar.co.uk.
 * Falls back to the hostname for IPs / localhost / intranet names.
 */
export function registrableDomain(input: string): string | null {
  const host = hostnameOf(input);
  if (!host) return null;
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

export type MatchQuality = 'exact' | 'domain' | null;

/** How well a stored vault URL matches the page the user is on. */
export function matchUrl(vaultUrl: string, pageUrl: string): MatchQuality {
  const vHost = hostnameOf(vaultUrl);
  const pHost = hostnameOf(pageUrl);
  if (!vHost || !pHost) return null;
  if (vHost === pHost || vHost === `www.${pHost}` || pHost === `www.${vHost}`) return 'exact';
  const vDom = registrableDomain(vHost);
  return vDom && vDom === registrableDomain(pHost) ? 'domain' : null;
}

/** Filter + rank items for the current page: exact host matches first. */
export function matchItems<T>(items: T[], pageUrl: string, urlOf: (t: T) => string): T[] {
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const q = matchUrl(urlOf(item), pageUrl);
    if (q) scored.push({ item, score: q === 'exact' ? 0 : 1 });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.item);
}

/** Only http(s) pages are eligible for autofill / capture. */
export function isFillableUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}
