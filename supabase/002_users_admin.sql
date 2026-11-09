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
-- Make the first admin (change the email, then run this line):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'ADMIN_EMAIL' on conflict do nothing;
-- =====================================================================
