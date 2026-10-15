/**
 * Login-form heuristics shared by inline autofill and credential capture.
 * Works on plain forms, SPA logins without a <form>, and two-step logins
 * (username page, then password page).
 */

const USERNAME_HINT = /user|email|e-mail|login|account|identifier|phone|mail|benutzer|usuario/i;
const NOT_USERNAME = /search|query|filter|coupon|promo|captcha|otp|code|zip|postal/i;
const TEXTLIKE = new Set(['text', 'email', 'tel', '']);

export function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
}

export const isPassword = (el: unknown): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type === 'password';

const isTextLike = (el: HTMLInputElement) => TEXTLIKE.has(el.type) && !el.readOnly && !el.disabled;

/** Strong signals only: used for standalone username fields (step 1 of a two-step login). */
export function looksLikeUsername(el: HTMLInputElement): boolean {
  if (!isTextLike(el)) return false;
  const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase();
  if (ac.includes('username') || ac === 'email') return true;
  const hay = [el.name, el.id, el.placeholder, el.getAttribute('aria-label')].join(' ');
  if (NOT_USERNAME.test(hay)) return false;
  return el.type === 'email' || USERNAME_HINT.test(hay);
}

function inputsIn(scope: ParentNode): HTMLInputElement[] {
  return Array.from(scope.querySelectorAll('input')).filter(isVisible);
}

const precedes = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** The username field that belongs to a password field (nearest preceding text-like input). */
export function usernameFor(pw: HTMLInputElement): HTMLInputElement | null {
  const before = inputsIn(pw.form ?? document)
    .filter((i) => isTextLike(i) && precedes(i, pw))
    .reverse();
  return before.find(looksLikeUsername) ?? before[0] ?? null;
}

/** The password field that follows a username field, if any. */
export function passwordFor(user: HTMLInputElement): HTMLInputElement | null {
  return inputsIn(user.form ?? document).find((i) => isPassword(i) && precedes(user, i)) ?? null;
}

/** Fields that get an inline vault icon. */
export function findFillableFields(root: ParentNode = document): HTMLInputElement[] {
  const out = new Set<HTMLInputElement>();
  for (const pw of inputsIn(root).filter(isPassword)) {
    // Don't offer saved passwords inside "choose a new password" fields.
    if ((pw.getAttribute('autocomplete') ?? '').includes('new-password')) continue;
    out.add(pw);
    const u = usernameFor(pw);
    if (u) out.add(u);
  }
  for (const i of inputsIn(root)) if (looksLikeUsername(i)) out.add(i);
  return [...out];
}

/** React / Vue / Angular ignore plain `.value =`; use the native setter + events. */
export function setFieldValue(el: HTMLInputElement, value: string): void {
  el.focus({ preventScroll: true });
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter ? setter.call(el, value) : (el.value = value);
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Fill a login. `anchor` is the field the user clicked, if any. Returns true if anything was filled. */
export function fillLogin(creds: { username: string; password: string }, anchor?: HTMLInputElement | null): boolean {
  let pw: HTMLInputElement | null = null;
  let user: HTMLInputElement | null = null;
  if (anchor && isPassword(anchor)) {
    pw = anchor;
    user = usernameFor(anchor);
  } else if (anchor) {
    user = anchor;
    pw = passwordFor(anchor);
  } else {
    pw = inputsIn(document).find(isPassword) ?? null;
    user = pw ? usernameFor(pw) : (inputsIn(document).find(looksLikeUsername) ?? null);
  }
  if (user && creds.username) setFieldValue(user, creds.username);
  if (pw && creds.password) setFieldValue(pw, creds.password);
  return !!(user || pw);
}

/** Credentials currently typed into the form that contains `scopeEl` (or the page). */
export function readCredentials(scopeEl?: Element | null): { username: string; password: string } | null {
  const form = scopeEl?.closest('form');
  const scope: ParentNode = form ?? document;
  const pw = inputsIn(scope).find((i) => isPassword(i) && i.value);
  if (pw) return { username: usernameFor(pw)?.value.trim() ?? '', password: pw.value };
  const user = inputsIn(scope).find((i) => looksLikeUsername(i) && i.value.trim());
  return user ? { username: user.value.trim(), password: '' } : null;
}
