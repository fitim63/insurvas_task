-- RPCs that expose the minimum cross-user information sharing needs, without opening
-- the profiles table to enumeration.

-- Exact-email lookup of a recipient's public key (needed to seal a key to them).
create function public.lookup_user(p_email text)
returns table (id uuid, email text, public_key text)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.public_key
    from profiles p
   where auth.uid() is not null
     and p.email = lower(trim(p_email));
$$;

-- Resolve user ids (seen on shares / collection members / item owners) to emails.
-- Only users you are actually connected to through an item or collection resolve.
create function public.get_emails(p_ids uuid[])
returns table (id uuid, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.email
    from profiles p
   where p.id = any (p_ids)
     and auth.uid() is not null
     and (
       p.id = auth.uid()
       or exists (select 1 from items i where i.owner_id = p.id and public.item_role(i.id) is not null)
       or exists (select 1 from item_access a where a.user_id = p.id and public.item_role(a.item_id) is not null)
       or exists (select 1 from collection_members m where m.user_id = p.id
                    and public.collection_role(m.collection_id) is not null)
       or exists (select 1 from collections c where c.owner_id = p.id
                    and public.collection_role(c.id) is not null)
     );
$$;

-- Atomically create items together with the owner's key rows (used for single
-- creates and bulk import). SECURITY INVOKER: every insert still goes through RLS.
-- p_items: [{ id, encrypted_data, owner_item_key, collection_id?, collection_item_key? }]
create function public.create_items(p_items jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  it jsonb;
  n integer := 0;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    insert into items (id, owner_id, collection_id, collection_item_key, encrypted_data)
    values ((it ->> 'id')::uuid, auth.uid(), (it ->> 'collection_id')::uuid,
            it ->> 'collection_item_key', it ->> 'encrypted_data');
    insert into item_access (item_id, user_id, role, encrypted_item_key, key_wrap, granted_by)
    values ((it ->> 'id')::uuid, auth.uid(), 'owner', it ->> 'owner_item_key', 'user_key', auth.uid());
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Atomically create a collection plus the owner's membership row.
create function public.create_collection(p_id uuid, p_encrypted_name text, p_owner_key text)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  insert into collections (id, owner_id, encrypted_name) values (p_id, auth.uid(), p_encrypted_name);
  insert into collection_members (collection_id, user_id, role, encrypted_collection_key, key_wrap, granted_by)
  values (p_id, auth.uid(), 'owner', p_owner_key, 'user_key', auth.uid());
end;
$$;

revoke all on function public.create_items(jsonb) from public, anon;
revoke all on function public.create_collection(uuid, text, text) from public, anon;
grant execute on function public.create_items(jsonb) to authenticated;
grant execute on function public.create_collection(uuid, text, text) to authenticated;

revoke all on function public.lookup_user(text) from public, anon;
revoke all on function public.get_emails(uuid[]) from public, anon;
grant execute on function public.lookup_user(text) to authenticated;
grant execute on function public.get_emails(uuid[]) to authenticated;
