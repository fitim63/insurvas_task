import { CATEGORIES, CATEGORY_LABELS } from '@vault/core';
import {
  Briefcase,
  FolderLock,
  Import,
  KeyRound,
  Lock,
  LogOut,
  Menu,
  Settings,
  Share2,
  ShieldCheck,
  Tag,
  User,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

function NavItem({ to, icon, label, count, active, onClick }: { to: string; icon: ReactNode; label: string; count?: number; active: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
        active
          ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
      )}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-zinc-400">{count}</span>}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { items, collections, email, lock, logOut } = useUnlockedVault();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onVault = pathname === '/';
  const filter = params.get('filter') ?? 'all';
  const category = params.get('category');
  const collection = params.get('collection');
  const isVaultFilter = (f: string) => onVault && !category && !collection && filter === f;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">Secure Vault</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          <NavItem to="/" icon={<KeyRound />} label="All items" count={items.length} active={isVaultFilter('all')} onClick={onNavigate} />
          <NavItem to="/?filter=mine" icon={<User />} label="My items" count={items.filter((i) => i.source === 'own').length} active={isVaultFilter('mine')} onClick={onNavigate} />
          <NavItem
            to="/?filter=shared"
            icon={<Share2 />}
            label="Shared with me"
            count={items.filter((i) => i.source !== 'own').length}
            active={isVaultFilter('shared')}
            onClick={onNavigate}
          />
        </div>

        <div>
          <p className="mb-1 px-2.5 text-xs font-medium uppercase tracking-wider text-zinc-400">Categories</p>
          <div className="space-y-0.5">
            {CATEGORIES.map((c) => (
              <NavItem
                key={c}
                to={`/?category=${c}`}
                icon={c === 'work' ? <Briefcase /> : <Tag />}
                label={CATEGORY_LABELS[c]}
                count={items.filter((i) => i.data.category === c).length}
                active={onVault && category === c}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-2.5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Collections</p>
            <NavLink to="/collections" onClick={onNavigate} className="text-xs text-indigo-600 hover:underline">
              Manage
            </NavLink>
          </div>
          <div className="space-y-0.5">
            {collections.length === 0 && <p className="px-2.5 text-xs text-zinc-400">No shared folders yet</p>}
            {collections.map((c) => (
              <NavItem
                key={c.id}
                to={`/?collection=${c.id}`}
                icon={<FolderLock />}
                label={c.name}
                count={items.filter((i) => i.collectionId === c.id).length}
                active={onVault && collection === c.id}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>

        <div className="space-y-0.5">
          <NavItem to="/collections" icon={<Users />} label="Teams & sharing" active={pathname.startsWith('/collections')} onClick={onNavigate} />
          <NavItem to="/import" icon={<Import />} label="Import / Export" active={pathname === '/import'} onClick={onNavigate} />
          <NavItem to="/settings" icon={<Settings />} label="Settings" active={pathname === '/settings'} onClick={onNavigate} />
        </div>
      </nav>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <p className="mb-2 truncate px-1 text-xs text-zinc-500" title={email ?? ''}>
          {email}
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={lock}>
            <Lock className="h-3.5 w-3.5" /> Lock
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void logOut()} aria-label="Log out" title="Log out">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white lg:block dark:border-zinc-800 dark:bg-zinc-900/50">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-zinc-900">
            <Button variant="ghost" size="icon" className="absolute right-3 top-4" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </Button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 lg:hidden dark:border-zinc-800">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </Button>
          <span className="font-semibold">Secure Vault</span>
        </div>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
