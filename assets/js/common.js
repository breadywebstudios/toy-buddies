/* Shared helpers: Supabase client, auth, header/footer, demo data, API layer */
(function () {
  const C = window.APP_CONFIG || {};
  const DEMO = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
  const sb = DEMO ? null : window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

  // ---------- small utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => n == null || n === "" ? "Price on request" :
    `${C.CURRENCY || "AED"} ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg, isErr = false) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.className = isErr ? "err show" : "show";
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = isErr ? "err" : ""), 3200);
  }

  // Placeholder art when a figure has no photo (also used by demo data)
  const PALETTE = [["#FBE3E1", "#D3202A"], ["#DDEBF7", "#14365F"], ["#FCEFC2", "#9E1219"], ["#DFF1E3", "#2E8B3E"], ["#FDE6D2", "#E07A1F"], ["#E3F3FB", "#1F7FB5"]];
  function placeholder(name = "?", i = 0) {
    const [bg, fg] = PALETTE[Math.abs(i) % PALETTE.length];
    const initials = esc(name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase());
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><rect width='300' height='300' fill='${bg}'/>
      <circle cx='150' cy='300' r='150' fill='${fg}' opacity='.18'/>
      <g fill='${fg}' opacity='.9'><circle cx='150' cy='92' r='34'/><path d='M104 140 h92 l18 80 h-26 l-6 60 h-64 l-6-60 h-26z'/></g></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  const imgOf = (p, i = 0) => p?.image_url || placeholder(p?.name, i);

  // ---------- Demo data (only when Supabase isn't configured) ----------
  const D = { user: null, isAdmin: true, categories: [], products: [], auctions: [], bids: [], offers: [], profiles: [] };
  if (DEMO) {
    const cats = ["Shonen Heroes", "Mecha & Robots", "Nendoroid / Chibi", "Scale Figures", "Prize Figures", "Limited Editions"];
    D.categories = cats.map((n, i) => ({ id: "c" + i, name: n, description: "", sort_order: i }));
    const series = ["Pirate Saga", "Ninja Chronicles", "Dragon Fighters", "Titan Wars", "Demon Blade", "Hero Academy", "Spirit Hunters", "Mobile Armor"];
    const brands = ["Bandai Spirits", "Good Smile", "Banpresto", "Kotobukiya", "MegaHouse", "Max Factory"];
    const scales = ["1/7", "1/8", "Nendoroid", "Figma", "1/6", "Non-scale"];
    const names = ["Captain of the Sea", "Swordsman Three Blades", "Navigator Storm", "Sniper of the South", "Cook Black Leg", "Doctor Reindeer", "Shadow Ninja", "Fox Spirit Kid", "Saiyan Warrior", "Scout Regiment Captain", "Flame Pillar", "Water Breather", "Quirkless Hero", "Ice-Fire Prodigy", "Hunter Exam Rookie", "Gundam RX Custom", "Titan Shifter", "Sorcerer Supreme", "Cursed Vessel", "Sky Island Priest"];
    for (let i = 0; i < 64; i++) {
      const n = names[i % names.length] + (i >= names.length ? ` Ver. ${Math.floor(i / names.length) + 1}` : "");
      D.products.push({
        id: "p" + i, name: n, series: series[i % series.length], brand: brands[i % brands.length], scale: scales[i % scales.length],
        condition: i % 5 === 0 ? "Pre-owned - Boxed" : "New - Sealed", price: i % 9 === 0 ? null : 120 + ((i * 37) % 900),
        stock: i % 11 === 0 ? 0 : 1 + (i % 3), description: "Highly detailed collectible figure with display base. Authentic product, ships across the UAE.",
        image_url: null, category_id: "c" + (i % cats.length), is_published: true, accept_offers: i % 7 === 3, min_offer: i % 7 === 3 ? 100 : null,
        created_at: new Date(Date.now() - i * 86400000).toISOString(),
      });
    }
    const now = Date.now();
    D.auctions = [
      { id: "a1", product_id: "p2", start_price: 300, min_increment: 20, starts_at: new Date(now - 3600e3).toISOString(), ends_at: new Date(now + 2 * 3600e3 + 125e3).toISOString(), current_bid: 420, current_bidder: "u9", bid_count: 5, cancelled: false },
      { id: "a2", product_id: "p8", start_price: 150, min_increment: 10, starts_at: new Date(now - 7200e3).toISOString(), ends_at: new Date(now + 90e3).toISOString(), current_bid: 210, current_bidder: "u8", bid_count: 4, cancelled: false },
      { id: "a3", product_id: "p15", start_price: 800, min_increment: 50, starts_at: new Date(now - 3600e3).toISOString(), ends_at: new Date(now + 26 * 3600e3).toISOString(), current_bid: null, current_bidder: null, bid_count: 0, cancelled: false },
      { id: "a4", product_id: "p21", start_price: 200, min_increment: 10, starts_at: new Date(now - 5 * 86400e3).toISOString(), ends_at: new Date(now - 86400e3).toISOString(), current_bid: 340, current_bidder: "u8", bid_count: 9, cancelled: false },
    ];
    D.bids = [
      { id: "b1", auction_id: "a1", bidder_name: "R***o", amount: 420, created_at: new Date(now - 600e3).toISOString(), user_id: "u9" },
      { id: "b2", auction_id: "a1", bidder_name: "M***a", amount: 380, created_at: new Date(now - 1600e3).toISOString(), user_id: "u8" },
      { id: "b3", auction_id: "a2", bidder_name: "M***a", amount: 210, created_at: new Date(now - 300e3).toISOString(), user_id: "u8" },
    ];
    D.profiles = [{ id: "u8", email: "mira@example.com", display_name: "Mira", phone: "0501234567" }, { id: "u9", email: "rico@example.com", display_name: "Rico", phone: "0559876543" }];
    D.offers = [{ id: "o1", product_id: "p3", user_id: "u9", amount: 260, message: "Can pick up in JLT", status: "pending", created_at: new Date(now - 7200e3).toISOString() }];
  }
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const withProduct = (row) => ({ ...row, product: byId(D.products, row.product_id) });
  const withProfile = (row, key = "user_id") => ({ ...row, profile: byId(D.profiles, row[key]) || null });
  const uid = () => Math.random().toString(36).slice(2, 10);
  const err = (e) => { if (e) throw new Error(e.message || String(e)); };

  // ---------- Auth ----------
  const auth = {
    async user() {
      if (DEMO) return D.user;
      const { data } = await sb.auth.getSession();
      return data.session?.user || null;
    },
    async signUp(email, password, display_name, phone) {
      if (DEMO) { D.user = { id: "demo-user", email }; D.profiles.push({ id: "demo-user", email, display_name, phone }); return; }
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name, phone }, emailRedirectTo: location.href } });
      err(error);
      return data;
    },
    async signIn(email, password) {
      if (DEMO) { D.user = { id: "demo-user", email }; if (!byId(D.profiles, "demo-user")) D.profiles.push({ id: "demo-user", email, display_name: email.split("@")[0] }); return; }
      const { error } = await sb.auth.signInWithPassword({ email, password }); err(error);
    },
    async resetPassword(email) {
      if (DEMO) return;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); err(error);
    },
    async signOut() { if (DEMO) { D.user = null; return; } await sb.auth.signOut(); },
    async isAdmin() {
      if (DEMO) return !!D.user;
      const u = await auth.user(); if (!u) return false;
      const { data } = await sb.from("admins").select("user_id").eq("user_id", u.id).maybeSingle();
      return !!data;
    },
    onChange(cb) { if (!DEMO) sb.auth.onAuthStateChange(() => cb()); },
  };

  // ---------- Public API ----------
  const api = {
    async categories() {
      if (DEMO) return [...D.categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      const { data, error } = await sb.from("categories").select("*").order("sort_order").order("name"); err(error); return data;
    },
    async products({ q = "", cat = "", sort = "new", page = 1, size = C.PAGE_SIZE || 24, admin = false } = {}) {
      if (DEMO) {
        let rows = D.products.filter((p) => admin || p.is_published);
        if (cat) rows = rows.filter((p) => p.category_id === cat);
        if (q) { const s = q.toLowerCase(); rows = rows.filter((p) => [p.name, p.series, p.brand].join(" ").toLowerCase().includes(s)); }
        rows = sortRows(rows, sort);
        return { rows: rows.slice((page - 1) * size, page * size), count: rows.length };
      }
      let qy = sb.from("products").select("*, category:categories(name)", { count: "exact" });
      if (!admin) qy = qy.eq("is_published", true);
      if (cat) qy = qy.eq("category_id", cat);
      if (q) { const s = q.replace(/[%,()]/g, " ").trim(); qy = qy.or(`name.ilike.%${s}%,series.ilike.%${s}%,brand.ilike.%${s}%`); }
      if (sort === "price_asc") qy = qy.order("price", { ascending: true, nullsFirst: false });
      else if (sort === "price_desc") qy = qy.order("price", { ascending: false, nullsFirst: false });
      else if (sort === "name") qy = qy.order("name");
      else qy = qy.order("created_at", { ascending: false });
      const from = (page - 1) * size;
      const { data, count, error } = await qy.range(from, from + size - 1); err(error);
      return { rows: data, count };
    },
    async auctions() {
      if (DEMO) return D.auctions.filter((a) => !a.cancelled).map(withProduct);
      const since = new Date(Date.now() - 7 * 86400e3).toISOString();
      const { data, error } = await sb.from("auctions").select("*, product:products(id,name,series,brand,scale,condition,image_url,description)")
        .eq("cancelled", false).gte("ends_at", since).order("ends_at"); err(error); return data;
    },
    async bids(auctionId, limit = 15) {
      if (DEMO) return D.bids.filter((b) => b.auction_id === auctionId).sort((a, b) => b.amount - a.amount).slice(0, limit);
      const { data, error } = await sb.from("bids").select("id,bidder_name,amount,created_at").eq("auction_id", auctionId)
        .order("amount", { ascending: false }).limit(limit); err(error); return data;
    },
    async placeBid(auctionId, amount) {
      if (DEMO) {
        if (!D.user) throw new Error("Please sign in to bid");
        const a = byId(D.auctions, auctionId);
        if (Date.now() >= new Date(a.ends_at)) throw new Error("This auction is not open for bids");
        if (a.current_bidder === D.user.id) throw new Error("You are already the highest bidder");
        const min = a.current_bid != null ? a.current_bid + a.min_increment : a.start_price;
        if (amount < min) throw new Error(`Your bid must be at least ${money(min)}`);
        const name = (byId(D.profiles, D.user.id)?.display_name || "Bidder");
        D.bids.push({ id: uid(), auction_id: auctionId, user_id: D.user.id, bidder_name: name[0] + "***" + (name.length > 2 ? name.slice(-1) : ""), amount, created_at: new Date().toISOString() });
        Object.assign(a, { current_bid: amount, current_bidder: D.user.id, bid_count: a.bid_count + 1 });
        if (new Date(a.ends_at) - Date.now() < 120e3) a.ends_at = new Date(Date.now() + 120e3).toISOString();
        return a;
      }
      const { data, error } = await sb.rpc("place_bid", { p_auction: auctionId, p_amount: amount }); err(error); return data;
    },
    async offerProducts() {
      if (DEMO) return D.products.filter((p) => p.accept_offers && p.is_published);
      const { data, error } = await sb.from("products").select("*").eq("accept_offers", true).eq("is_published", true).order("created_at", { ascending: false }); err(error); return data;
    },
    async myOffers() {
      const u = await auth.user(); if (!u) return [];
      if (DEMO) return D.offers.filter((o) => o.user_id === u.id).map(withProduct);
      const { data, error } = await sb.from("offers").select("*, product:products(name)").eq("user_id", u.id).order("created_at", { ascending: false }); err(error); return data;
    },
    async submitOffer(product_id, amount, message) {
      const u = await auth.user(); if (!u) throw new Error("Please sign in to make an offer");
      if (DEMO) { D.offers.push({ id: uid(), product_id, user_id: u.id, amount, message, status: "pending", created_at: new Date().toISOString() }); return; }
      const { error } = await sb.from("offers").insert({ product_id, user_id: u.id, amount, message });
      if (error && /row-level security/i.test(error.message)) throw new Error("Offer is below the minimum, or this figure no longer accepts offers.");
      err(error);
    },
    async withdrawOffer(id) {
      if (DEMO) { byId(D.offers, id).status = "withdrawn"; return; }
      const { error } = await sb.from("offers").update({ status: "withdrawn" }).eq("id", id); err(error);
    },
    subscribeAuctions(cb) {
      if (DEMO) return;
      sb.channel("auctions-live").on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, cb).subscribe();
    },
  };
  function sortRows(rows, sort) {
    const r = [...rows];
    if (sort === "price_asc") r.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
    else if (sort === "price_desc") r.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    else if (sort === "name") r.sort((a, b) => a.name.localeCompare(b.name));
    else r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return r;
  }

  // ---------- Admin API ----------
  const admin = {
    async saveCategory(row) {
      if (DEMO) { if (row.id) Object.assign(byId(D.categories, row.id), row); else D.categories.push({ ...row, id: uid() }); return; }
      const { error } = row.id ? await sb.from("categories").update(row).eq("id", row.id) : await sb.from("categories").insert(row);
      if (error?.code === "23505") throw new Error("A category with that name already exists"); err(error);
    },
    async deleteCategory(id) {
      if (DEMO) { D.categories = D.categories.filter((c) => c.id !== id); D.products.forEach((p) => { if (p.category_id === id) p.category_id = null; }); return; }
      const { error } = await sb.from("categories").delete().eq("id", id); err(error);
    },
    async categoryCounts() {
      if (DEMO) { const m = {}; D.products.forEach((p) => (m[p.category_id] = (m[p.category_id] || 0) + 1)); return m; }
      const { data, error } = await sb.from("products").select("category_id"); err(error);
      const m = {}; data.forEach((p) => (m[p.category_id] = (m[p.category_id] || 0) + 1)); return m;
    },
    async saveProduct(row) {
      if (DEMO) { if (row.id) Object.assign(byId(D.products, row.id), row); else D.products.unshift({ ...row, id: uid(), created_at: new Date().toISOString() }); return; }
      const { error } = row.id ? await sb.from("products").update(row).eq("id", row.id) : await sb.from("products").insert(row); err(error);
    },
    async deleteProduct(id) {
      if (DEMO) { D.products = D.products.filter((p) => p.id !== id); D.auctions = D.auctions.filter((a) => a.product_id !== id); return; }
      const { error } = await sb.from("products").delete().eq("id", id); err(error);
    },
    async uploadImage(file) {
      if (DEMO) return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("figures").upload(path, file, { cacheControl: "31536000", upsert: false }); err(error);
      return sb.storage.from("figures").getPublicUrl(path).data.publicUrl;
    },
    async allAuctions() {
      if (DEMO) return D.auctions.map((a) => withProfile(withProduct(a), "current_bidder")).sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));
      const { data, error } = await sb.from("auctions").select("*, product:products(name,image_url), profile:profiles!auctions_current_bidder_fkey(display_name,email,phone)")
        .order("ends_at", { ascending: false }); err(error); return data;
    },
    async saveAuction(row) {
      if (DEMO) { if (row.id) Object.assign(byId(D.auctions, row.id), row); else D.auctions.push({ ...row, id: uid(), current_bid: null, current_bidder: null, bid_count: 0, cancelled: false }); return; }
      const { error } = row.id ? await sb.from("auctions").update(row).eq("id", row.id) : await sb.from("auctions").insert(row); err(error);
    },
    async deleteAuction(id) {
      if (DEMO) { D.auctions = D.auctions.filter((a) => a.id !== id); return; }
      const { error } = await sb.from("auctions").delete().eq("id", id); err(error);
    },
    async allBids(auctionId) {
      if (DEMO) return D.bids.filter((b) => b.auction_id === auctionId).map((b) => withProfile(b)).sort((a, b) => b.amount - a.amount);
      const { data, error } = await sb.from("bids").select("*, profile:profiles(display_name,email,phone)").eq("auction_id", auctionId).order("amount", { ascending: false }); err(error); return data;
    },
    async allOffers() {
      if (DEMO) return D.offers.map((o) => withProfile(withProduct(o))).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const { data, error } = await sb.from("offers").select("*, product:products(name,image_url,price), profile:profiles(display_name,email,phone)").order("created_at", { ascending: false }); err(error); return data;
    },
    async setOfferStatus(id, status) {
      if (DEMO) { byId(D.offers, id).status = status; return; }
      const { error } = await sb.from("offers").update({ status }).eq("id", id); err(error);
    },
    async productOptions() {
      if (DEMO) return D.products.map((p) => ({ id: p.id, name: p.name }));
      const { data, error } = await sb.from("products").select("id,name").order("name"); err(error); return data;
    },
  };

  // ---------- Layout ----------
  function renderChrome(active) {
    const head = document.createElement("header");
    head.className = "site-header";
    head.innerHTML = `<div class="container bar">
      <a class="brand" href="index.html"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">${esc(C.STORE_NAME || "Figure Store")}</span></a>
      <nav class="nav">
        <a href="index.html" class="${active === "catalog" ? "active" : ""}">Catalogue</a>
        <a href="bidding.html" class="${active === "bidding" ? "active" : ""}">Bid &amp; Offers</a>
        <span id="authSlot"></span>
      </nav></div>`;
    document.body.prepend(head);
    if (DEMO) {
      const n = document.createElement("div");
      n.className = "container";
      n.innerHTML = `<div class="notice">Demo mode — showing sample figures. Add your Supabase URL and key in <code>config.js</code> to go live.</div>`;
      head.after(n);
    }
    const foot = document.createElement("footer");
    foot.className = "site-footer";
    foot.innerHTML = `<div class="container">
      <span>© ${new Date().getFullYear()} ${esc(C.STORE_NAME || "")} · ${esc(C.STORE_TAGLINE || "")}</span>
      <span>Powered by <a href="https://breadywebstudio.vercel.app" target="_blank" rel="noopener">Bready Web Studios</a></span></div>`;
    document.body.appendChild(foot);
    refreshAuthSlot();
    auth.onChange(refreshAuthSlot);
  }

  async function refreshAuthSlot() {
    const slot = $("#authSlot"); if (!slot) return;
    const u = await auth.user();
    if (u) {
      slot.innerHTML = `<button class="user-chip" id="signOutBtn" title="Sign out">${esc(u.email.split("@")[0])} · Sign out</button>`;
      $("#signOutBtn").onclick = async () => { await auth.signOut(); toast("Signed out"); refreshAuthSlot(); document.dispatchEvent(new Event("auth-changed")); };
    } else {
      slot.innerHTML = `<button id="signInBtn">Sign in</button>`;
      $("#signInBtn").onclick = () => openAuth();
    }
  }

  // ---------- Modal + auth dialog ----------
  function openModal(html, narrow = false) {
    closeModal();
    const m = document.createElement("div");
    m.className = "modal"; m.id = "modal";
    m.innerHTML = `<div class="modal-box ${narrow ? "narrow" : ""}" role="dialog" aria-modal="true"><button class="modal-close" aria-label="Close">×</button>${html}</div>`;
    m.addEventListener("click", (e) => { if (e.target === m || e.target.classList.contains("modal-close")) closeModal(); });
    document.body.appendChild(m);
    document.addEventListener("keydown", escClose);
    return m;
  }
  function escClose(e) { if (e.key === "Escape") closeModal(); }
  function closeModal() { $("#modal")?.remove(); document.removeEventListener("keydown", escClose); }

  function openAuth(mode = "in", onDone) {
    const m = openModal(`<div class="modal-pad">
      <h2>Ahoy! Sign in to bid</h2>
      <div class="tabs"><button class="btn sm" data-t="in">Sign in</button><button class="btn sm ghost" data-t="up">Create account</button></div>
      <form id="authForm">
        <div class="field up-only"><label>Name</label><input name="name" autocomplete="name"></div>
        <div class="field up-only"><label>Mobile (for winner contact)</label><input name="phone" type="tel" placeholder="05X XXX XXXX" autocomplete="tel"></div>
        <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Password</label><input name="password" type="password" minlength="6" required autocomplete="current-password"></div>
        <button class="btn block" type="submit" id="authSubmit">Sign in</button>
        <p style="text-align:center;margin:10px 0 0"><a href="#" id="forgot">Forgot password?</a></p>
      </form></div>`, true);
    const setMode = (t) => {
      mode = t;
      $$("[data-t]", m).forEach((b) => b.classList.toggle("ghost", b.dataset.t !== t));
      $$(".up-only", m).forEach((el) => el.classList.toggle("hidden", t !== "up"));
      $("[name=name]", m).required = t === "up";
      $("#authSubmit", m).textContent = t === "up" ? "Create account" : "Sign in";
    };
    $$("[data-t]", m).forEach((b) => (b.onclick = () => setMode(b.dataset.t)));
    setMode(mode);
    $("#forgot", m).onclick = async (e) => {
      e.preventDefault();
      const email = $("[name=email]", m).value.trim();
      if (!email) return toast("Type your email first", true);
      try { await auth.resetPassword(email); toast("Password reset link sent to your email"); } catch (x) { toast(x.message, true); }
    };
    $("#authForm", m).onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), btn = $("#authSubmit", m);
      btn.disabled = true;
      try {
        if (mode === "up") {
          const r = await auth.signUp(f.get("email").trim(), f.get("password"), f.get("name").trim(), f.get("phone").trim());
          if (!DEMO && !r?.session) { closeModal(); toast("Check your email to confirm your account, then sign in."); return; }
          toast("Welcome aboard!");
        } else {
          await auth.signIn(f.get("email").trim(), f.get("password"));
          toast("Signed in");
        }
        closeModal(); refreshAuthSlot(); document.dispatchEvent(new Event("auth-changed")); onDone && onDone();
      } catch (x) { toast(x.message, true); } finally { btn.disabled = false; }
    };
  }

  function waLink(text) {
    if (!C.WHATSAPP) return "";
    return `https://wa.me/${C.WHATSAPP}?text=${encodeURIComponent(text)}`;
  }

  window.App = { C, DEMO, sb, $, $$, esc, money, debounce, toast, placeholder, imgOf, auth, api, admin, renderChrome, refreshAuthSlot, openModal, closeModal, openAuth, waLink };
})();
