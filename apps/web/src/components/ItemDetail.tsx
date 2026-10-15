import { can, CATEGORY_LABELS, hostnameOf, ROLE_LABELS, type VaultItem } from '@vault/core';
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, FolderInput, LogOut, Pencil, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ItemEditor } from '@/components/ItemEditor';
import { MoveDialog } from '@/components/MoveDialog';
import { ShareDialog } from '@/components/ShareDialog';
import { SiteAvatar } from '@/components/SiteAvatar';
import { TotpCode } from '@/components/TotpCode';
import { Badge, Button } from '@/components/ui';
import { copyText, errorMessage } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

function Row({ label, children, copy, secret }: { label: string; children: ReactNode; copy?: string; secret?: boolean }) {
  return (
    <div className="group flex items-start gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <div className="mt-0.5 break-words text-sm">{children}</div>
      </div>
      {copy && (
        <Button size="icon" variant="ghost" onClick={() => void copyText(copy, label, secret)} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
          <Copy className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function ItemDetail({ item, onBack }: { item: VaultItem; onBack: () => void }) {
  const { service, collections, refresh, keys } = useUnlockedVault();
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [moving, setMoving] = useState(false);
  const { data } = item;
  const collection = collections.find((c) => c.id === item.collectionId);
  const host = hostnameOf(data.url);
  const href = host ? (/^https?:\/\//i.test(data.url) ? data.url : `https://${data.url}`) : null;

  useEffect(() => setReveal(false), [item.id]);

  async function remove() {
    if (!confirm(`Delete "${data.title}" for everyone it is shared with? This cannot be undone.`)) return;
    try {
      await service.deleteItem(item.id);
      toast.success('Deleted');
      onBack();
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function leave() {
    if (!confirm(`Remove "${data.title}" from your vault? The owner can share it again later.`)) return;
    try {
      await service.revokeItemGrantee(item.id, keys.userId);
      toast.success('Removed from your vault');
      onBack();
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <Button size="icon" variant="ghost" className="lg:hidden" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <SiteAvatar title={data.title} url={data.url} className="h-11 w-11 text-base" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{data.title}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge>{CATEGORY_LABELS[data.category]}</Badge>
            {item.source !== 'own' && <Badge tone="sky">{ROLE_LABELS[item.role]}</Badge>}
            {collection && <Badge tone="indigo">{collection.name}</Badge>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        {can.edit(item.role) && (
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        {can.share(item.role) && (
          <Button size="sm" onClick={() => setSharing(true)}>
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
        )}
        {can.move(item.role) && (
          <Button size="sm" onClick={() => setMoving(true)}>
            <FolderInput className="h-3.5 w-3.5" /> Collection
          </Button>
        )}
        {can.delete(item.role) && (
          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950" onClick={() => void remove()}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
        {item.source === 'shared' && (
          <Button size="sm" variant="ghost" onClick={() => void leave()}>
            <LogOut className="h-3.5 w-3.5" /> Leave
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {data.username && (
            <Row label="Username" copy={data.username}>
              {data.username}
            </Row>
          )}
          {data.password && (
            <div className="group flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-500">Password</p>
                <p className="mt-0.5 break-all font-mono text-sm">{reveal ? data.password : '•'.repeat(Math.min(data.password.length, 16))}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Hide password' : 'Reveal password'}>
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => void copyText(data.password, 'Password', true)} aria-label="Copy password">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {data.totp && (
            <Row label="One-time code (TOTP)">
              <TotpCode secret={data.totp} />
            </Row>
          )}
          {data.url && (
            <Row label="Website" copy={data.url}>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                  {data.url} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                data.url
              )}
            </Row>
          )}
          {data.notes && (
            <Row label="Secure notes" copy={data.notes}>
              <p className="whitespace-pre-wrap">{data.notes}</p>
            </Row>
          )}
        </div>
        <div className="space-y-1 px-5 py-4 text-xs text-zinc-500">
          <p>
            Owner: {item.source === 'own' ? 'You' : (item.ownerEmail ?? 'Unknown')}
            {item.source !== 'own' && ` · Your access: ${ROLE_LABELS[item.role]}`}
          </p>
          <p>Last updated {new Date(item.updatedAt).toLocaleString()} · revision {item.revision}</p>
        </div>
      </div>

      <ItemEditor open={editing} onOpenChange={setEditing} item={item} />
      {sharing && <ShareDialog item={item} open={sharing} onOpenChange={setSharing} />}
      {moving && <MoveDialog item={item} open={moving} onOpenChange={setMoving} />}
    </div>
  );
}
