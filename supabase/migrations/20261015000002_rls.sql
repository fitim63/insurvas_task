-- Row Level Security: server-side enforcement of the PRD §3.2 permission matrix.
--
--   Role          View  Auto-fill  Edit  Re-share
--   viewer         ✓       ✓
--   editor         ✓       ✓        ✓
--   admin/owner    ✓       ✓        ✓       ✓
--
-- Effective role on an item = max(owner, direct grant, collection membership).
-- Crypto makes "view" enforceable (no key -> no plaintext). Edit / re-share are
-- enforced here, because anyone who can read an item key could otherwise re-upload.

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can consult other tables without RLS recursion.

create function public.collection_role(p_collection uuid) returns public.access_role
language sql stable security definer set search_path = public as $$
  select greatest(
    (select 'owner'::public.access_role from collections c
      where c.id = p_collection and c.owner_id = auth.uid()),
    (select m.role from collection_members m
      where m.collection_id = p_collection and m.user_id = auth.uid())
  );
$$;

create function public.item_role(p_item uuid) returns public.access_role
language sql stable security definer set search_path = public as $$
  select greatest(
    (select 'owner'::public.access_role from items i
      where i.id = p_item and i.owner_id = auth.uid()),
    (select a.role from item_access a
      where a.item_id = p_item and a.user_id = auth.uid()),
    -- Collection owners act as admins on items other people put in their collection.
    (select least(m.role, 'admin'::public.access_role)
       from items i join collection_members m on m.collection_id = i.collection_id
      where i.id = p_item and m.user_id = auth.uid())
  );
$$;

revoke all on function public.collection_role(uuid) from public, anon;
revoke all on function public.item_role(uuid) from public, anon;
grant execute on function public.collection_role(uuid) to authenticated;
grant execute on function public.item_role(uuid) to authenticated;

-- ---------------------------------------------------------------- triggers

create function public.items_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
  elsif pg_trigger_depth() > 1 then
    -- Cascade from a deleted collection (FK ON DELETE SET NULL): the item simply
    -- falls back to its owner's vault. Drop the now-useless collection-wrapped key.
    if new.collection_id is null then
      new.collection_item_key := null;
    end if;
    return new;
  else
    if new.owner_id <> old.owner_id then
      raise exception 'Item ownership cannot be transferred' using errcode = '42501';
    end if;
    if (new.collection_id is distinct from old.collection_id
        or new.collection_item_key is distinct from old.collection_item_key) then
      if public.item_role(old.id) < 'admin' then
        raise exception 'Only admins can move items between collections' using errcode = '42501';
      end if;
      if new.collection_id is not null and coalesce(public.collection_role(new.collection_id) >= 'editor', false) = false then
        raise exception 'You cannot add items to that collection' using errcode = '42501';
      end if;
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger items_before_write
  before insert or update on public.items
  for each row execute function public.items_before_write();

create function public.collections_before_update() returns trigger
language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'Collection ownership cannot be transferred' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger collections_before_update
  before update on public.collections
  for each row execute function public.collections_before_update();

-- ---------------------------------------------------------------- profiles

alter table public.profiles enable row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Only the wrapped vault key may change (master password change). Inserts come from
-- the auth trigger; other users' public keys are reached via lookup_user().
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (encrypted_user_key, kdf_version) on public.profiles to authenticated;

-- ---------------------------------------------------------------- items

alter table public.items enable row level security;

create policy items_select on public.items
  for select to authenticated using (public.item_role(id) is not null);

create policy items_insert on public.items
  for insert to authenticated with check (
    owner_id = auth.uid()
    and (collection_id is null or public.collection_role(collection_id) >= 'editor')
  );

create policy items_update on public.items
  for update to authenticated
  using (public.item_role(id) >= 'editor')
  with check (public.item_role(id) >= 'editor');

create policy items_delete on public.items
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------- item_access

alter table public.item_access enable row level security;

create policy item_access_select on public.item_access
  for select to authenticated
  using (user_id = auth.uid() or public.item_role(item_id) >= 'admin');

create policy item_access_insert on public.item_access
  for insert to authenticated with check (
    granted_by = auth.uid()
    and (
      -- the owner's own key row, created together with the item
      (user_id = auth.uid() and role = 'owner' and key_wrap = 'user_key'
        and public.item_role(item_id) = 'owner')
      or
      -- re-share: admin/owner only, sealed to the recipient's public key
      (user_id <> auth.uid() and role <> 'owner' and key_wrap = 'public_key'
        and public.item_role(item_id) >= 'admin')
    )
  );

create policy item_access_update on public.item_access
  for update to authenticated
  using (role <> 'owner' and user_id <> auth.uid() and public.item_role(item_id) >= 'admin')
  with check (role <> 'owner');

create policy item_access_delete on public.item_access
  for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.item_role(item_id) >= 'admin'));

-- ---------------------------------------------------------------- collections

alter table public.collections enable row level security;

create policy collections_select on public.collections
  for select to authenticated using (public.collection_role(id) is not null);

create policy collections_insert on public.collections
  for insert to authenticated with check (owner_id = auth.uid());

create policy collections_update on public.collections
  for update to authenticated using (public.collection_role(id) >= 'admin');

create policy collections_delete on public.collections
  for delete to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------- collection_members

alter table public.collection_members enable row level security;

create policy collection_members_select on public.collection_members
  for select to authenticated
  using (user_id = auth.uid() or public.collection_role(collection_id) is not null);

create policy collection_members_insert on public.collection_members
  for insert to authenticated with check (
    granted_by = auth.uid()
    and (
      (user_id = auth.uid() and role = 'owner' and key_wrap = 'user_key'
        and public.collection_role(collection_id) = 'owner')
      or
      (user_id <> auth.uid() and role <> 'owner' and key_wrap = 'public_key'
        and public.collection_role(collection_id) >= 'admin')
    )
  );

create policy collection_members_update on public.collection_members
  for update to authenticated
  using (role <> 'owner' and user_id <> auth.uid() and public.collection_role(collection_id) >= 'admin')
  with check (role <> 'owner');

create policy collection_members_delete on public.collection_members
  for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.collection_role(collection_id) >= 'admin'));

-- Nothing is reachable without a session.
revoke all on public.profiles, public.items, public.item_access, public.collections, public.collection_members from anon;
