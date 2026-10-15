import { type Grantee, type Role, type VaultItem } from '@vault/core';
import { ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { GranteeList } from '@/components/GranteeList';
import { RoleSelect, ROLE_HINTS } from '@/components/RoleSelect';
import { Button, Dialog, Input } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { useUnlockedVault } from '@/state/vault';

export function ShareDialog({ item, open, onOpenChange }: { item: VaultItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { service, keys, collections } = useUnlockedVault();
  const [grantees, setGrantees] = useState<Grantee[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const collection = collections.find((c) => c.id === item.collectionId);

  const load = useCallback(async () => {
    try {
      setGrantees(await service.listItemGrantees(item.id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, [service, item.id]);

  useEffect(() => {
    if (open) {
      setGrantees(null);
      void load();
    }
  }, [open, load]);

  async function share(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await service.shareItem(item, email, role);
      toast.success(`Shared with ${email}`);
      setEmail('');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const mutate = async (fn: () => Promise<void>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Share "${item.data.title}"`}
      description="The item key is encrypted with the recipient's public key in your browser. The server never sees it."
    >
      <form onSubmit={share} className="space-y-2">
        <div className="flex gap-2">
          <Input type="email" required placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
          <RoleSelect value={role} onChange={setRole} granter={item.role} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">{ROLE_HINTS[role]}</p>
          <Button type="submit" variant="primary" size="sm" loading={busy}>
            Share
          </Button>
        </div>
      </form>

      <div className="mt-6">
        <p className="mb-1 text-sm font-medium">People with direct access</p>
        <GranteeList
          grantees={grantees}
          myRole={item.role}
          myUserId={keys.userId}
          onRoleChange={(g, r) => void mutate(() => service.setItemGranteeRole(item.id, g.userId, r), 'Role updated')}
          onRemove={(g) => void mutate(() => service.revokeItemGrantee(item.id, g.userId), `Removed ${g.email}`)}
        />
      </div>

      {collection && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Everyone in the <b>{collection.name}</b> collection also has access.
        </p>
      )}
      <p className="mt-4 text-xs text-zinc-500">
        Revoking removes future access. Someone who already viewed the password may have copied it, so rotate the password
        after removing a person.
      </p>
    </Dialog>
  );
}
