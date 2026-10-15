import { can, ROLE_LABELS, type Grantee, type Role } from '@vault/core';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Spinner } from '@/components/ui';
import { RoleSelect } from '@/components/RoleSelect';

/** People with access to an item or collection, with inline role changes. */
export function GranteeList({
  grantees,
  myRole,
  myUserId,
  loading,
  onRoleChange,
  onRemove,
}: {
  grantees: Grantee[] | null;
  myRole: Role;
  myUserId: string;
  loading?: boolean;
  onRoleChange: (g: Grantee, role: Role) => void;
  onRemove: (g: Grantee) => void;
}) {
  if (!grantees || loading) return <Spinner className="mx-auto my-4" />;
  const sorted = [...grantees].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.email.localeCompare(b.email)));
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {sorted.map((g) => {
        const editable = can.share(myRole) && g.role !== 'owner' && g.userId !== myUserId;
        return (
          <li key={g.userId} className="flex items-center gap-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {g.email.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {g.email}
                {g.userId === myUserId && <span className="text-zinc-400"> (you)</span>}
              </p>
            </div>
            {editable ? (
              <>
                <RoleSelect value={g.role} granter={myRole} onChange={(r) => onRoleChange(g, r)} className="h-8 text-xs" />
                <Button size="icon" variant="ghost" onClick={() => onRemove(g)} aria-label={`Remove ${g.email}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Badge tone={g.role === 'owner' ? 'indigo' : 'zinc'}>{ROLE_LABELS[g.role]}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
