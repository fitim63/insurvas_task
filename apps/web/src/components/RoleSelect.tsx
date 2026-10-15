import { grantableRoles, ROLE_LABELS, type Role } from '@vault/core';
import { Select } from '@/components/ui';
import { cn } from '@/lib/utils';

export const ROLE_HINTS: Record<Role, string> = {
  viewer: 'View & auto-fill',
  editor: 'View, auto-fill & edit',
  admin: 'Full access incl. re-sharing',
  owner: 'Owner',
};

export function RoleSelect({
  value,
  onChange,
  granter,
  className,
  disabled,
}: {
  value: Role;
  onChange: (r: Role) => void;
  granter: Role;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Role)} className={cn('w-auto', className)} disabled={disabled}>
      {grantableRoles(granter).map((r) => (
        <option key={r} value={r} title={ROLE_HINTS[r]}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}
