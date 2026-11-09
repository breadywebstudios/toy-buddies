-- =====================================================================
-- 002 — Users management for the admin page
-- Run in Supabase → SQL Editor AFTER schema.sql. Safe to re-run.
-- =====================================================================

-- Block flag on users (blocked users can't bid or make offers)
alter table public.profiles add column if not exists is_blocked boolean not null default false;

-- Admins can see/add/remove admins
drop policy if exists admins_admin on public.admins;
create policy admins_admin on public.admins for all
  using (public.is_admin()) with check (public.is_admin());

-- Admins can edit any profile (e.g. block / unblock)
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- Normal users can't change their own block flag
create or replace function public.protect_profile_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_blocked is distinct from old.is_blocked and not public.is_admin() then
    new.is_blocked := old.is_blocked;
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_block on public.profiles;
create trigger protect_profile_block before update on public.profiles
  for each row execute function public.protect_profile_block();

-- Never remove the last admin
create or replace function public.keep_one_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.admins) <= 1 then
    raise exception 'You cannot remove the last admin';
  end if;
  return old;
end $$;
drop trigger if exists keep_one_admin on public.admins;
create trigger keep_one_admin before delete on public.admins
  for each row execute function public.keep_one_admin();

-- Offers: blocked users can't submit
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers for insert with check (
  user_id = auth.uid()
  and status = 'pending'
  and not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_blocked)
  and exists (select 1 from public.products p
              where p.id = product_id and p.accept_offers and p.is_published
                and (p.min_offer is null or amount >= p.min_offer))
);

-- Bids: blocked users can't bid
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
  if exists (select 1 from public.profiles where id = auth.uid() and is_blocked) then
    raise exception 'Your account cannot place bids. Please contact the seller.';
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
         ends_at = case when ends_at - now() < interval '2 minutes'
                        then now() + interval '2 minutes' else ends_at end
   where id = p_auction
   returning * into a;

  return a;
end $$;
revoke all on function public.place_bid(uuid, numeric) from public, anon;
grant execute on function public.place_bid(uuid, numeric) to authenticated;

-- =====================================================================
-- Admin management from the website (no SQL needed after this file)
-- =====================================================================

-- Pending admin invites for people who haven't signed up yet
create table if not exists public.admin_invites (
  email      text primary key,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;
drop policy if exists admin_invites_admin on public.admin_invites;
create policy admin_invites_admin on public.admin_invites for all
  using (public.is_admin()) with check (public.is_admin());

-- Are there any admins yet? (lets the admin page offer "claim owner access")
create or replace function public.has_admins()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins);
$$;
grant execute on function public.has_admins() to anon, authenticated;

-- The very first signed-in user can claim admin, only while there are no admins
create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  lock table public.admins in exclusive mode;
  if exists (select 1 from public.admins) then
    raise exception 'This store already has an admin. Ask them to add you.';
  end if;
  insert into public.admins (user_id) values (auth.uid());
  return true;
end $$;
revoke all on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;

-- Add an admin by email: instant if they have an account, otherwise saved as an invite
create or replace function public.add_admin_by_email(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'Only admins can add admins'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is not null then
    insert into public.admins (user_id) values (v_id) on conflict do nothing;
    delete from public.admin_invites where email = v_email;
    return 'added';
  end if;
  insert into public.admin_invites (email, invited_by) values (v_email, auth.uid())
  on conflict (email) do nothing;
  return 'invited';
end $$;
revoke all on function public.add_admin_by_email(text) from public, anon;
grant execute on function public.add_admin_by_email(text) to authenticated;

-- When an invited person signs up, they become admin automatically
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
  if exists (select 1 from public.admin_invites where email = lower(new.email)) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
    delete from public.admin_invites where email = lower(new.email);
  end if;
  return new;
end $$;

-- That's it — after running this file, add admins from Admin → Users.
