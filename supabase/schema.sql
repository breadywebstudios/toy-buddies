-- =====================================================================
-- Anime Figure Catalogue + Bidding — Supabase schema
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent where possible).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Profiles (one per signed-up user) ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  phone        text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Admins ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Categories ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Products (the figures) ----------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  series       text,                 -- anime / franchise
  brand        text,                 -- manufacturer
  scale        text,                 -- e.g. 1/7, Nendoroid, Figma
  condition    text not null default 'New - Sealed',
  price        numeric(10,2),        -- fixed price in AED (null = price on request)
  stock        int not null default 1,
  description  text,
  image_url    text,
  category_id  uuid references public.categories(id) on delete set null,
  is_published boolean not null default true,
  accept_offers boolean not null default false,  -- shows on bidding page "Make an offer"
  min_offer    numeric(10,2),        -- optional lowest offer allowed
  created_at   timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_created_idx  on public.products(created_at desc);

-- ---------- Timed auctions ----------
create table if not exists public.auctions (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  start_price    numeric(10,2) not null check (start_price >= 0),
  min_increment  numeric(10,2) not null default 10 check (min_increment > 0),
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz not null,
  current_bid    numeric(10,2),
  current_bidder uuid references public.profiles(id) on delete set null,
  bid_count      int not null default 0,
  cancelled      boolean not null default false,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.bids (
  id          uuid primary key default gen_random_uuid(),
  auction_id  uuid not null references public.auctions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  bidder_name text not null,          -- masked name shown publicly, e.g. "J***a"
  amount      numeric(10,2) not null,
  created_at  timestamptz not null default now()
);
create index if not exists bids_auction_idx on public.bids(auction_id, created_at desc);

-- ---------- Open offers ----------
create table if not exists public.offers (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  message     text,
  status      text not null default 'pending'
              check (status in ('pending','accepted','rejected','withdrawn')),
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Place a bid safely (checks timing + minimum, anti-sniping extension)
-- =====================================================================
create or replace function public.place_bid(p_auction uuid, p_amount numeric)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare
  a      public.auctions;
  v_min  numeric;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to bid';
  end if;

  select * into a from public.auctions where id = p_auction for update;
  if not found then raise exception 'Auction not found'; end if;
  if a.cancelled or now() < a.starts_at or now() >= a.ends_at then
    raise exception 'This auction is not open for bids';
  end if;
  if a.current_bidder = auth.uid() then
    raise exception 'You are already the highest bidder';
  end if;

  v_min := coalesce(a.current_bid + a.min_increment, a.start_price);
  if p_amount < v_min then
    raise exception 'Your bid must be at least AED %', v_min;
  end if;

  select coalesce(nullif(trim(display_name), ''), 'Bidder') into v_name
  from public.profiles where id = auth.uid();
  v_name := coalesce(v_name, 'Bidder');
  v_name := left(v_name, 1) || '***' || case when length(v_name) > 2 then right(v_name, 1) else '' end;

  insert into public.bids (auction_id, user_id, bidder_name, amount)
  values (p_auction, auth.uid(), v_name, p_amount);

  update public.auctions
     set current_bid    = p_amount,
         current_bidder = auth.uid(),
         bid_count      = bid_count + 1,
         -- a bid in the final 2 minutes extends the auction by 2 minutes
         ends_at = case when ends_at - now() < interval '2 minutes'
                        then now() + interval '2 minutes' else ends_at end
   where id = p_auction
   returning * into a;

  return a;
end $$;

revoke all on function public.place_bid(uuid, numeric) from public, anon;
grant execute on function public.place_bid(uuid, numeric) to authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles   enable row level security;
alter table public.admins     enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.auctions   enable row level security;
alter table public.bids       enable row level security;
alter table public.offers     enable row level security;

-- profiles: you see/edit your own; admin sees all
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- admins: a user can check whether they are an admin
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select using (user_id = auth.uid());

-- categories: public read, admin write
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- products: public sees published ones, admin sees & edits everything
drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (is_published or public.is_admin());
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all using (public.is_admin()) with check (public.is_admin());

-- auctions: public read, admin write
drop policy if exists auctions_read on public.auctions;
create policy auctions_read on public.auctions for select using (true);
drop policy if exists auctions_admin on public.auctions;
create policy auctions_admin on public.auctions for all using (public.is_admin()) with check (public.is_admin());

-- bids: public read (masked names); inserts only through place_bid(); admin can delete
drop policy if exists bids_read on public.bids;
create policy bids_read on public.bids for select using (true);
drop policy if exists bids_admin_delete on public.bids;
create policy bids_admin_delete on public.bids for delete using (public.is_admin());

-- offers: you see your own, admin sees all; you can submit on offer-enabled figures
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers for insert with check (
  user_id = auth.uid()
  and status = 'pending'
  and exists (select 1 from public.products p
              where p.id = product_id and p.accept_offers and p.is_published
                and (p.min_offer is null or amount >= p.min_offer))
);
drop policy if exists offers_withdraw on public.offers;
create policy offers_withdraw on public.offers for update
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'withdrawn');
drop policy if exists offers_admin on public.offers;
create policy offers_admin on public.offers for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- Storage bucket for figure photos
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('figures', 'figures', true)
on conflict (id) do nothing;

drop policy if exists figures_public_read on storage.objects;
create policy figures_public_read on storage.objects for select using (bucket_id = 'figures');
drop policy if exists figures_admin_write on storage.objects;
create policy figures_admin_write on storage.objects for insert with check (bucket_id = 'figures' and public.is_admin());
drop policy if exists figures_admin_update on storage.objects;
create policy figures_admin_update on storage.objects for update using (bucket_id = 'figures' and public.is_admin());
drop policy if exists figures_admin_delete on storage.objects;
create policy figures_admin_delete on storage.objects for delete using (bucket_id = 'figures' and public.is_admin());

-- =====================================================================
-- Realtime: live price updates on the bidding page
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.auctions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.bids;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- AFTER your friend signs up on the site, make him admin:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'HIS_EMAIL@example.com';
-- =====================================================================
