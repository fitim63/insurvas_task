-- Secure Vault schema.
-- Zero-knowledge: every column holding user secrets is ciphertext produced on the
-- client (XChaCha20-Poly1305 or X25519 sealed boxes). The server only ever sees who
-- has access to which opaque blob, never the contents.

create type public.access_role as enum ('viewer', 'editor', 'admin', 'owner');
create type public.key_wrap as enum ('user_key', 'public_key');

-- One row per account. Created by a trigger on auth.users from the signUp metadata.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  public_key text not null,               -- X25519 public key (plaintext by design)
  encrypted_private_key text not null,    -- wrapped by the user's vault key
  encrypted_user_key text not null,       -- vault key wrapped by K_sym (Argon2id of master pw)
  kdf_version smallint not null default 1,
  created_at timestamptz not null default now()
);

-- Team workspaces / shared folders.
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  encrypted_name text not null,           -- encrypted with the collection key
  created_at timestamptz not null default now()
);

create table public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.access_role not null,
  encrypted_collection_key text not null, -- collection key, wrapped for this member
  key_wrap public.key_wrap not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

-- Credentials. The entire payload (title, url, username, password, notes, totp,
-- category) is one ciphertext so the server cannot even see which sites you use.
create table public.items (
  id uuid primary key,                    -- generated client-side: bound into the AEAD
  owner_id uuid not null references public.profiles (id) on delete cascade,
  collection_id uuid references public.collections (id) on delete set null,
  collection_item_key text,               -- item key wrapped by the collection key
  encrypted_data text not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint collection_key_present check ((collection_id is null) = (collection_item_key is null))
);

-- Direct access grants: the owner's own row plus one per direct share.
create table public.item_access (
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.access_role not null,
  encrypted_item_key text not null,
  key_wrap public.key_wrap not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index items_owner_idx on public.items (owner_id);
create index items_collection_idx on public.items (collection_id);
create index item_access_user_idx on public.item_access (user_id);
create index collection_members_user_idx on public.collection_members (user_id);

-- Create the profile from the key material the client sends with supabase.auth.signUp().
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := new.raw_user_meta_data;
begin
  if meta ->> 'public_key' is null
     or meta ->> 'encrypted_private_key' is null
     or meta ->> 'encrypted_user_key' is null then
    raise exception 'Missing vault key material in signup metadata';
  end if;
  insert into public.profiles (id, email, public_key, encrypted_private_key, encrypted_user_key)
  values (new.id, lower(new.email), meta ->> 'public_key', meta ->> 'encrypted_private_key', meta ->> 'encrypted_user_key');
  -- Don't leave the key material in auth metadata (it would ride along in every JWT).
  update auth.users
     set raw_user_meta_data = raw_user_meta_data - 'public_key' - 'encrypted_private_key' - 'encrypted_user_key'
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
