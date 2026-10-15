import { ROLES, type Role } from './types';

/**
 * PRD §3.2 permission matrix. The UI uses this to hide actions; the same rules are
 * enforced server-side by Postgres RLS (supabase/migrations/*_rls.sql).
 *
 * | Role          | View | Auto-fill | Edit | Re-share |
 * | Viewer        |  ✓   |    ✓      |      |          |
 * | Editor        |  ✓   |    ✓      |  ✓   |          |
 * | Admin / Owner |  ✓   |    ✓      |  ✓   |    ✓     |
 */
export const roleRank = (r: Role): number => ROLES.indexOf(r);
export const atLeast = (r: Role, min: Role): boolean => roleRank(r) >= roleRank(min);

export const can = {
  view: (_r: Role) => true,
  autofill: (_r: Role) => true,
  edit: (r: Role) => atLeast(r, 'editor'),
  share: (r: Role) => atLeast(r, 'admin'),
  delete: (r: Role) => r === 'owner',
  /** Move into / out of a collection. */
  move: (r: Role) => atLeast(r, 'admin'),
};

/** Roles a user with `granter` may hand out (never 'owner'). */
export function grantableRoles(granter: Role): Role[] {
  if (!can.share(granter)) return [];
  return ['viewer', 'editor', 'admin'];
}

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
  owner: 'Owner',
};

export function maxRole(...roles: (Role | null | undefined)[]): Role | null {
  let best: Role | null = null;
  for (const r of roles) if (r && (!best || roleRank(r) > roleRank(best))) best = r;
  return best;
}
