import { hostnameOf, registrableDomain } from '@vault/core/domain';
import { totpNow, type TotpCode } from '@vault/core/totp';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { browser } from 'wxt/browser';
import { send, type PopupItem, type PopupState } from '@/lib/messages';
import { Avatar, Button, cn, ErrorText, IconButton, Input } from './components';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function copy(value: string, secret: boolean, flash: (m: string) => void, label: string) {
  await navigator.clipboard.writeText(value);
  void send({ type: 'popup:copied', secret });
  flash(`${label} copied${secret ? ' · clears in 30s' : ''}`);
}

// ---------------------------------------------------------------- shell

function Header({ state, onSettings, onSync, syncing }: { state: PopupState; onSettings?: () => void; onSync?: () => void; syncing?: boolean }) {
  return (
    <header className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
        <ShieldCheck className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">Secure Vault</p>
        {state.email && <p className="truncate text-[11px] leading-tight text-zinc-500">{state.email}</p>}
      </div>
      {state.status === 'unlocked' && (
        <>
          {onSync && (
            <IconButton label="Sync" onClick={onSync}>
              <RefreshCw className={cn(syncing && 'animate-spin')} />
            </IconButton>
          )}
          {onSettings && (
            <IconButton label="Settings" onClick={onSettings}>
              <Settings />
            </IconButton>
          )}
          <IconButton label="Lock now" onClick={() => void send({ type: 'popup:lock' }).then(() => location.reload())}>
            <Lock />
          </IconButton>
        </>
      )}
    </header>
  );
}

// ---------------------------------------------------------------- login / unlock

function LoginView({ state, onDone }: { state: PopupState; onDone: (s: PopupState) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await send<PopupState>({ type: 'popup:login', email, password }));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-5">
      <div className="pb-2 text-center">
        <h1 className="text-lg font-semibold">Log in</h1>
        <p className="text-xs text-zinc-500">Your master password is never sent anywhere.</p>
      </div>
      <Input type="email" placeholder="Email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input type="password" placeholder="Master password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        {busy ? 'Deriving keys…' : 'Log in'}
      </Button>
      <p className="pt-2 text-center text-xs text-zinc-500">
        No account?{' '}
        <a href={`${state.webUrl}/signup`} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
          Create one in the web vault
        </a>
      </p>
    </form>
  );
}

function UnlockView({ state, onDone }: { state: PopupState; onDone: (s: PopupState) => void }) {
  const [usePin, setUsePin] = useState(state.hasPin);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await send<PopupState>(usePin ? { type: 'popup:unlockPin', pin: secret } : { type: 'popup:unlock', password: secret }));
    } catch (err) {
      setError(errMsg(err));
      setSecret('');
      const fresh = await send<PopupState>({ type: 'popup:getState' });
      if (usePin && !fresh.hasPin) setUsePin(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-5">
      <div className="flex flex-col items-center pb-2 text-center">
        <div className="mb-2 rounded-full bg-zinc-100 p-3 text-zinc-500 dark:bg-zinc-800">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold">Vault locked</h1>
      </div>
      <Input
        key={String(usePin)}
        type="password"
        inputMode={usePin ? 'numeric' : undefined}
        placeholder={usePin ? 'PIN' : 'Master password'}
        autoFocus
        required
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        Unlock
      </Button>
      <div className="flex justify-between pt-1 text-xs">
        {state.hasPin ? (
          <button type="button" className="text-indigo-600 hover:underline" onClick={() => setUsePin((p) => !p)}>
            {usePin ? 'Use master password' : 'Use PIN'}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="text-zinc-500 hover:underline" onClick={() => void send<PopupState>({ type: 'popup:logout' }).then(onDone)}>
          Log out
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- vault list

function useTotp(secret: string | undefined): TotpCode | null {
  const [code, setCode] = useState<TotpCode | null>(null);
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

function ItemDetails({ item, flash }: { item: PopupItem; flash: (m: string) => void }) {
  const totp = useTotp(item.data.totp || undefined);
  const Line = ({ label, value, display, secret }: { label: string; value: string; display?: string; secret?: boolean }) => (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-zinc-500">{label}</span>
      <span className={cn('min-w-0 flex-1 truncate text-xs', secret && 'font-mono')}>{display ?? value}</span>
      <IconButton label={`Copy ${label.toLowerCase()}`} onClick={() => void copy(value, !!secret, flash, label)}>
        <Copy />
      </IconButton>
    </div>
  );
  return (
    <div className="space-y-1 px-3 pb-2.5 pl-[3.25rem]">
      {item.data.username && <Line label="Username" value={item.data.username} />}
      {item.data.password && <Line label="Password" value={item.data.password} display="••••••••••" secret />}
      {totp && <Line label="TOTP" value={totp.code} display={`${totp.code.slice(0, 3)} ${totp.code.slice(3)}  ·  ${totp.remaining}s`} secret />}
      {item.source !== 'own' && item.ownerEmail && (
        <p className="pt-0.5 text-[11px] text-zinc-500">
          Shared by {item.ownerEmail} · {item.role}
        </p>
      )}
    </div>
  );
}

function VaultView({ state, onSettings }: { state: PopupState; onSettings: () => void }) {
  const [items, setItems] = useState<PopupItem[] | null>(null);
  const [tab, setTab] = useState<{ id?: number; url?: string }>({});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 1800);
  }, []);

  const load = useCallback(async (refresh = false) => {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    setTab({ id: active?.id, url: active?.url });
    setSyncing(refresh);
    try {
      setItems(await send<PopupItem[]>({ type: 'popup:listItems', tabUrl: active?.url, refresh }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const site = tab.url ? hostnameOf(tab.url) : null;

  const visible = useMemo(() => {
    if (!items) return [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = items.filter((i) => {
      if (!terms.length) return true;
      const hay = `${i.data.title} ${hostnameOf(i.data.url) ?? ''} ${i.data.username} ${i.data.category}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const rank = (i: PopupItem) => (i.match === 'exact' ? 0 : i.match === 'domain' ? 1 : 2);
    return filtered.sort((a, b) => rank(a) - rank(b) || a.data.title.localeCompare(b.data.title)).slice(0, 200);
  }, [items, query]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  async function fill(item: PopupItem) {
    if (!tab.id) return;
    try {
      await send({ type: 'popup:fill', itemId: item.id, tabId: tab.id });
      window.close();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      const item = visible[selected];
      if (!item) return;
      e.preventDefault();
      if (item.match) void fill(item);
      else void copy(item.data.password, true, flash, 'Password');
    }
  }

  const matchCount = visible.filter((i) => i.match).length;

  return (
    <div className="flex h-[520px] flex-col">
      <Header state={state} onSettings={onSettings} onSync={() => void load(true)} syncing={syncing} />
      <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            ref={searchRef}
            autoFocus
            placeholder={site ? `Search vault · ${registrableDomain(site) ?? site}` : 'Search vault'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="pl-8"
            aria-label="Search vault"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">↑↓ to choose · Enter to fill (or copy password) · Ctrl+Shift+L to open</p>
      </div>

      {error && (
        <div className="px-3 pt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
        {!items ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500">
            <KeyRound className="mx-auto mb-2 h-5 w-5" />
            {query ? 'No matches' : 'Your vault is empty'}
          </div>
        ) : (
          visible.map((item, idx) => {
            const showHeader = !query && (idx === 0 || (visible[idx - 1]!.match && !item.match));
            return (
              <div key={item.id}>
                {showHeader && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    {item.match ? `Suggested for ${site}` : matchCount ? 'All items' : 'Vault'}
                  </p>
                )}
                <div
                  data-index={idx}
                  className={cn('mx-1 rounded-lg', idx === selected && 'bg-indigo-50 dark:bg-indigo-950/50')}
                  onMouseEnter={() => setSelected(idx)}
                >
                  <div className="flex items-center gap-2.5 px-2 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      onClick={() => setExpanded((x) => (x === item.id ? null : item.id))}
                    >
                      <Avatar title={item.data.title} url={item.data.url} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span className="truncate">{item.data.title}</span>
                          {item.source !== 'own' && <Share2 className="h-3 w-3 shrink-0 text-sky-500" aria-label="Shared" />}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{item.data.username || hostnameOf(item.data.url) || ' '}</p>
                      </div>
                    </button>
                    {item.match ? (
                      <Button small variant="primary" onClick={() => void fill(item)}>
                        <Zap className="h-3 w-3" /> Fill
                      </Button>
                    ) : (
                      <>
                        <IconButton label="Copy username" onClick={() => void copy(item.data.username, false, flash, 'Username')}>
                          <User />
                        </IconButton>
                        <IconButton label="Copy password" onClick={() => void copy(item.data.password, true, flash, 'Password')}>
                          <Copy />
                        </IconButton>
                      </>
                    )}
                  </div>
                  {expanded === item.id && <ItemDetails item={item} flash={flash} />}
                </div>
              </div>
            );
          })
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
        <span className="text-zinc-500">{items ? `${items.length} items` : ''}</span>
        <a href={state.webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
          Open web vault <ExternalLink className="h-3 w-3" />
        </a>
      </footer>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-12 flex justify-center">
          <div className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">{toast}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsView({ state, onBack, onChange }: { state: PopupState; onBack: () => void; onChange: (s: PopupState) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const run = async (fn: () => Promise<PopupState>, msg: string) => {
    setError('');
    try {
      onChange(await fn());
      setNote(msg);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <div className="flex min-h-[500px] flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
        <p className="text-sm font-semibold">Settings</p>
      </header>
      <div className="flex-1 space-y-5 p-4 text-sm">
        <section className="space-y-1.5">
          <label className="font-medium" htmlFor="autolock">
            Auto-lock after inactivity
          </label>
          <select
            id="autolock"
            value={state.autoLockMinutes}
            onChange={(e) => void run(() => send({ type: 'popup:setAutoLock', minutes: Number(e.target.value) }), 'Auto-lock updated')}
            className="h-9 w-full rounded-lg bg-white px-2 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
          >
            {[1, 5, 15, 30, 60, 240].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">The vault also locks when your computer's screen locks.</p>
        </section>

        <section className="space-y-1.5">
          <p className="font-medium">Unlock with PIN</p>
          {state.hasPin ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-emerald-600">PIN enabled until the browser restarts.</p>
              <Button small onClick={() => void run(() => send({ type: 'popup:clearPin' }), 'PIN removed')}>
                Remove PIN
              </Button>
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => send({ type: 'popup:setPin', pin }), 'PIN set').then(() => setPin(''));
              }}
            >
              <Input type="password" inputMode="numeric" pattern="\d{4,8}" placeholder="4–8 digits" value={pin} onChange={(e) => setPin(e.target.value)} required />
              <Button type="submit" variant="primary">
                Set PIN
              </Button>
            </form>
          )}
          <p className="text-xs text-zinc-500">
            The PIN only works for this browser session. After a restart, or 5 wrong tries, your master password is required.
          </p>
        </section>

        <section className="space-y-1.5">
          <p className="font-medium">Keyboard shortcut</p>
          <p className="text-xs text-zinc-500">
            Ctrl+Shift+L (⌘+Shift+L on Mac) opens quick search. Change it at <span className="font-mono">chrome://extensions/shortcuts</span>.
          </p>
        </section>

        <ErrorText>{error}</ErrorText>
        {note && <p className="text-xs text-emerald-600">{note}</p>}
      </div>
      <footer className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <Button className="w-full" onClick={() => void send<PopupState>({ type: 'popup:logout' }).then(onChange)}>
          <LogOut className="h-3.5 w-3.5" /> Log out
        </Button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- root

export function App() {
  const [state, setState] = useState<PopupState | null>(null);
  const [view, setView] = useState<'vault' | 'settings'>('vault');
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    send<PopupState>({ type: 'popup:getState' }).then(setState, (e) => setBootError(errMsg(e)));
  }, []);

  if (bootError) {
    return (
      <div className="flex h-[500px] flex-col items-center justify-center gap-3 p-6 text-center">
        <ErrorText>{bootError}</ErrorText>
        <Button onClick={() => location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex h-[500px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (state.status === 'unlocked') {
    return view === 'settings' ? (
      <SettingsView state={state} onBack={() => setView('vault')} onChange={setState} />
    ) : (
      <VaultView state={state} onSettings={() => setView('settings')} />
    );
  }

  return (
    <div className="min-h-[500px]">
      <Header state={state} />
      {state.status === 'signedOut' ? <LoginView state={state} onDone={setState} /> : <UnlockView state={state} onDone={setState} />}
    </div>
  );
}
