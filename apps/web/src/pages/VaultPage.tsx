import { useVirtualizer } from '@tanstack/react-virtual';
import { CATEGORY_LABELS, hostnameOf, type Category, type VaultItem } from '@vault/core';
import { FolderLock, KeyRound, Plus, RefreshCw, Search, Share2, Users } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ItemDetail } from '@/components/ItemDetail';
import { ItemEditor } from '@/components/ItemEditor';
import { SiteAvatar } from '@/components/SiteAvatar';
import { Button, EmptyState, Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

/** Every query term must appear in the title, domain, username or category. */
function matches(item: VaultItem, terms: string[]): boolean {
  if (!terms.length) return true;
  const d = item.data;
  const hay = `${d.title} ${hostnameOf(d.url) ?? d.url} ${d.username} ${CATEGORY_LABELS[d.category]}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function VaultPage() {
  const { items, collections, loading, refresh } = useUnlockedVault();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filter = params.get('filter');
  const category = params.get('category') as Category | null;
  const collectionId = params.get('collection');
  const collection = collections.find((c) => c.id === collectionId);

  const heading = collection?.name ?? (category ? CATEGORY_LABELS[category] : filter === 'mine' ? 'My items' : filter === 'shared' ? 'Shared with me' : 'All items');

  const visible = useMemo(() => {
    const terms = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((i) => {
        if (filter === 'mine' && i.source !== 'own') return false;
        if (filter === 'shared' && i.source === 'own') return false;
        if (category && i.data.category !== category) return false;
        if (collectionId && i.collectionId !== collectionId) return false;
        return matches(i, terms);
      })
      .sort((a, b) => a.data.title.localeCompare(b.data.title, undefined, { sensitivity: 'base' }));
  }, [items, deferredQuery, filter, category, collectionId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  // "/" focuses search, like most productivity apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 60,
    overscan: 8,
  });

  return (
    <div className="flex h-full">
      <section className={cn('flex w-full min-w-0 flex-col border-r border-zinc-200 lg:w-[400px] lg:shrink-0 dark:border-zinc-800', selected && 'hidden lg:flex')}>
        <div className="space-y-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 truncate text-lg font-semibold">
              {collection && <FolderLock className="h-4 w-4 text-indigo-500" />}
              {heading}
              <span className="text-sm font-normal text-zinc-400">{visible.length}</span>
            </h1>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => void refresh()} aria-label="Sync" title="Sync">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> New
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              ref={searchRef}
              type="search"
              placeholder="Search title, domain, username…  ( / )"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              aria-label="Search vault"
            />
          </div>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : visible.length === 0 ? (
            query ? (
              <EmptyState icon={<Search className="h-5 w-5" />} title="No matches">
                Nothing matches “{query}”.
              </EmptyState>
            ) : (
              <EmptyState icon={<KeyRound className="h-5 w-5" />} title="Nothing here yet">
                Add a login with <b>New</b>, or import from Bitwarden, 1Password or Chrome.
              </EmptyState>
            )
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((v) => {
                const item = visible[v.index]!;
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'absolute left-0 top-0 flex w-full items-center gap-3 px-4 text-left transition-colors',
                      active ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'hover:bg-zinc-100/70 dark:hover:bg-zinc-900',
                    )}
                    style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                  >
                    <SiteAvatar title={item.data.title} url={item.data.url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.data.title}</p>
                      <p className="truncate text-xs text-zinc-500">{item.data.username || hostnameOf(item.data.url) || ' '}</p>
                    </div>
                    {item.source === 'shared' && <Share2 className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-label="Shared with you" />}
                    {item.collectionId && !collectionId && <Users className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-label="In a collection" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className={cn('min-w-0 flex-1', !selected && 'hidden lg:block')}>
        {selected ? (
          <ItemDetail item={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={<KeyRound className="h-5 w-5" />} title="Select an item">
              Everything is decrypted locally in your browser.
            </EmptyState>
          </div>
        )}
      </section>

      <ItemEditor open={creating} onOpenChange={setCreating} defaultCollectionId={collectionId} />
    </div>
  );
}
