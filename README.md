# Toy Buddies — Anime Figure Catalogue + Bidding

Static site (HTML/CSS/JS) on Vercel with a Supabase backend. No build step.

| Page | What it does |
|---|---|
| `index.html` | Catalogue — search, category chips, sort, 24 per page (handles hundreds of figures) |
| `bidding.html` | **Timed auctions** (live countdown, min bid step, anti-snipe +2 min) and **Make an offer** on figures marked "open to offers". Email sign-up/login required. |
| `admin.html` | Admin only — categories, figures (add/edit/photo upload/CSV import), auctions (start, extend, cancel, see winner contact), offers (accept/reject, WhatsApp the buyer) |

Prices are in AED. Colours follow a One Piece–inspired palette (`assets/css/style.css` → `:root`).

## Setup

1. **Supabase** → new project → SQL Editor → run `supabase/schema.sql`.
2. **Auth** → Providers → Email enabled. Under URL Configuration set Site URL to the Vercel URL.
3. Copy **Project URL** and **anon/publishable key** into `config.js` (also set `STORE_NAME`, `WHATSAPP`).
4. Deploy the folder to Vercel (framework: Other, no build command).
5. The owner signs up on the site, then in SQL Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'OWNER_EMAIL';
   ```
6. Open `/admin.html`, create categories, then add figures or import a CSV (download the template from the Figures tab).

Until `config.js` has Supabase keys the site runs in **demo mode** with sample figures, so you can preview the design.

## How bidding works
- Bids go through the `place_bid` database function, which checks the auction is open, the bid is at least *current bid + step* (or the starting price), and that the bidder isn't already leading.
- A bid in the final 2 minutes pushes the end time out to 2 minutes from now.
- When the timer ends, the leader is the winner — their name, email and mobile show in Admin → Auctions.
- Offers: buyers send an amount + message; admin accepts/rejects and the buyer sees the status under "My offers".
