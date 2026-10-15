import { can, ROLE_LABELS, type Collection, type Grantee, type Role } from '@vault/core';
import { ArrowRight, FolderLock, LogOut, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { GranteeList } from '@/components/GranteeList';
import { RoleSelect, ROLE_HINTS } from '@/components/RoleSelect';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

function CreateCollectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { service, refresh } = useUnlockedVault();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await service.createCollection(name.trim());
      await refresh();
      toast.success(`Created "${name.trim()}"`);
      setName('');
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New collection" description="A shared folder. Everyone you add gets access to every item inside.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input required autoFocus placeholder="Marketing Team, Family…" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CollectionCard({ collection }: { collection: Collection }) {
  const { service, refresh, keys, items } = useUnlockedVault();
  const [members, setMembers] = useState<Grantee[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(collection.name);
  const isAdmin = can.share(collection.role);
  const count = items.filter((i) => i.collectionId === collection.id).length;

  const load = useCallback(async () => {
    try {
      setMembers(await service.listMembers(collection.id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, [service, collection.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>, msg: string, reload: 'members' | 'vault' = 'members') => {
    try {
      await fn();
      toast.success(msg);
      if (reload === 'vault') await refresh();
      else await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await run(() => service.addMember(collection, email, role), `Added ${email}`);
    setEmail('');
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          <FolderLock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setRenaming(false);
                void run(() => service.renameCollection(collection, name.trim()), 'Renamed', 'vault');
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required className="h-8" />
              <Button size="sm" type="submit" variant="primary">
                Save
              </Button>
            </form>
          ) : (
            <h2 className="flex items-center gap-2 font-semibold">
              {collection.name}
              {isAdmin && (
                <button onClick={() => setRenaming(true)} className="text-zinc-400 hover:text-zinc-700" aria-label="Rename">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </h2>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">
            {count} item{count === 1 ? '' : 's'} · {members?.length ?? '…'} member{members?.length === 1 ? '' : 's'} · You are{' '}
            <Badge tone="indigo">{ROLE_LABELS[collection.role]}</Badge>
          </p>
        </div>
        <div className="flex gap-1">
          <Link to={`/?collection=${collection.id}`}>
            <Button size="sm">
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          {collection.role === 'owner' ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete collection"
              title="Delete collection"
              onClick={() =>
                confirm(`Delete "${collection.name}"? Items go back to their owners' private vaults and members lose access.`) &&
                void run(() => service.deleteCollection(collection.id), 'Collection deleted', 'vault')
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Leave collection"
              title="Leave collection"
              onClick={() =>
                confirm(`Leave "${collection.name}"?`) && void run(() => service.removeMember(collection.id, keys.userId), 'Left collection', 'vault')
              }
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <GranteeList
          grantees={members}
          myRole={collection.role}
          myUserId={keys.userId}
          onRoleChange={(g, r) => void run(() => service.setMemberRole(collection.id, g.userId, r), 'Role updated')}
          onRemove={(g) => void run(() => service.removeMember(collection.id, g.userId), `Removed ${g.email}`)}
        />
      </div>

      {isAdmin && (
        <form onSubmit={add} className="mt-3 space-y-1 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            <Input type="email" required placeholder="Invite by email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-48 flex-1" />
            <RoleSelect value={role} onChange={setRole} granter={collection.role} />
            <Button type="submit" variant="primary" loading={busy}>
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>
          <p className="text-xs text-zinc-500">{ROLE_HINTS[role]} on every item in this collection.</p>
        </form>
      )}
    </Card>
  );
}

export function CollectionsPage() {
  const { collections } = useUnlockedVault();
  const [creating, setCreating] = useState(false);
  const sorted = [...collections].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Teams & collections</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Shared folders for a group, like "Marketing Team" or "Family". Each collection has its own key, sealed to every
              member's public key.
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New collection
          </Button>
        </div>

        {sorted.length === 0 ? (
          <Card>
            <EmptyState icon={<Users className="h-5 w-5" />} title="No collections yet">
              Create one, invite people by email, then move items into it.
            </EmptyState>
          </Card>
        ) : (
          sorted.map((c) => <CollectionCard key={c.id} collection={c} />)
        )}

        <Card className="p-5 text-sm">
          <h2 className="mb-3 font-semibold">Permission levels</h2>
          <table className="w-full text-left">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">View</th>
                <th className="pb-2 font-medium">Auto-fill</th>
                <th className="pb-2 font-medium">Edit</th>
                <th className="pb-2 font-medium">Re-share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(
                [
                  ['Viewer', true, true, false, false],
                  ['Editor', true, true, true, false],
                  ['Admin / Owner', true, true, true, true],
                ] as const
              ).map(([r, ...caps]) => (
                <tr key={r}>
                  <td className="py-2 font-medium">{r}</td>
                  {caps.map((c, i) => (
                    <td key={i} className={c ? 'text-emerald-600' : 'text-zinc-300 dark:text-zinc-700'}>
                      {c ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <CreateCollectionDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
