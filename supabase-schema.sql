-- Run this once in the Supabase SQL Editor for a new project.
create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin'))
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  image_url text,
  category_id uuid references public.categories(id) on delete set null,
  market_price numeric(12,2) not null check (market_price >= 0),
  offer_price numeric(12,2) not null check (offer_price >= 0),
  public_price numeric(12,2) not null check (public_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_published_created_idx
  on public.products (is_published, created_at desc);
create index if not exists products_category_idx
  on public.products (category_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- This helper is evaluated by RLS policies. Its fixed search_path avoids
-- resolving attacker-controlled objects while it checks the caller's role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;

drop policy if exists "Admins can read product rows" on public.products;
drop policy if exists "Admins can insert product rows" on public.products;
drop policy if exists "Admins can update product rows" on public.products;
drop policy if exists "Admins can delete product rows" on public.products;
create policy "Admins can read product rows"
  on public.products for select to authenticated
  using ((select public.is_admin()));
create policy "Admins can insert product rows"
  on public.products for insert to authenticated
  with check ((select public.is_admin()));
create policy "Admins can update product rows"
  on public.products for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "Admins can delete product rows"
  on public.products for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists "Anyone can read categories" on public.categories;
drop policy if exists "Admins can manage categories" on public.categories;
create policy "Anyone can read categories"
  on public.categories for select to anon, authenticated
  using (true);
create policy "Admins can manage categories"
  on public.categories for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.products from anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

-- This view intentionally exposes only customer-safe columns. It is an
-- owner-rights view; do not add internal pricing or admin-only fields here.
create or replace view public.public_products
with (security_barrier = true, security_invoker = false)
as
select
  p.id,
  p.name,
  p.description,
  p.image_url,
  p.category_id,
  c.name as category_name,
  p.public_price,
  (p.stock_quantity > 0) as in_stock,
  p.created_at
from public.products as p
left join public.categories as c on c.id = p.category_id
where p.is_published = true;

alter view public.public_products owner to postgres;
revoke all on public.public_products from public, anon, authenticated;
grant select on public.public_products to anon, authenticated;

-- Product photos are public to view; only authenticated admins can change them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view product images" on storage.objects;
drop policy if exists "Admins can upload product images" on storage.objects;
drop policy if exists "Admins can update product images" on storage.objects;
drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Anyone can view product images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "Admins can upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "Admins can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

-- After creating the first user in Supabase Auth, grant admin access:
-- insert into public.user_roles (user_id, role)
-- values ('AUTH_USER_UUID_HERE', 'admin');
