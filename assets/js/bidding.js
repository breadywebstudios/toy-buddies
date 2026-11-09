(function () {
  const { C, $, $$, esc, money, toast, imgOf, auth, api, renderChrome, openModal, closeModal, openAuth } = App;
  renderChrome("bidding");
  document.title = `Auctions & Offers — ${C.STORE_NAME}`;

  let auctions = [], user = null;

  const state = (a) => {
    const now = Date.now();
    if (now < new Date(a.starts_at)) return "upcoming";
    if (now >= new Date(a.ends_at)) return "ended";
    return "live";
  };
  const minBid = (a) => (a.current_bid != null ? +a.current_bid + +a.min_increment : +a.start_price);

  function fmtLeft(ms) {
    if (ms <= 0) return "Ended";
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return d ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(x)}`;
  }

  async function loadAuctions() {
    try { auctions = await api.auctions(); } catch (e) { toast(e.message, true); auctions = []; }
    renderAuctions();
  }

  function renderAuctions() {
    const live = auctions.filter((a) => state(a) !== "ended");
    const ended = auctions.filter((a) => state(a) === "ended").sort((a, b) => new Date(b.ends_at) - new Date(a.ends_at));
    $("#liveGrid").innerHTML = live.length ? live.map(auctionCard).join("") :
      `<div class="empty" style="grid-column:1/-1">No auctions running right now — check back soon!</div>`;
    $("#endedWrap").classList.toggle("hidden", !ended.length);
    $("#endedGrid").innerHTML = ended.map(auctionCard).join("");
    wireAuctionCards();
    tick();
  }

  function auctionCard(a, i) {
    const p = a.product || {}, st = state(a), mine = user && a.current_bidder === user.id;
    const top = a.current_bid != null;
    let action;
    if (st === "ended") {
      action = top ? `<div class="${mine ? "leading" : "notice"}" style="margin:0">${mine ? "🎉 You won! The seller will contact you." : `Sold for ${money(a.current_bid)}`}</div>`
                   : `<div class="notice" style="margin:0">Ended with no bids</div>`;
    } else if (st === "upcoming") {
      action = `<div class="notice" style="margin:0">Opens ${new Date(a.starts_at).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })}</div>`;
    } else if (mine) {
      action = `<div class="leading">You're the highest bidder</div>`;
    } else {
      action = `<form class="bid-form" data-id="${esc(a.id)}">
        <input type="number" inputmode="decimal" min="${minBid(a)}" step="any" value="${minBid(a)}" aria-label="Your bid in ${esc(C.CURRENCY)}">
        <button class="btn" type="submit">Bid</button></form>`;
    }
    return `<article class="auction" data-id="${esc(a.id)}">
      <div class="img"><img loading="lazy" src="${esc(imgOf(p, i + 3))}" alt="${esc(p.name || "")}">
        <span class="badge ${st === "live" ? "" : st === "upcoming" ? "gold" : "navy"}">${st === "live" ? "Live" : st === "upcoming" ? "Soon" : "Ended"}</span></div>
      <div class="body">
        <span class="series" style="color:var(--sea);font-weight:800;text-transform:uppercase;font-size:.75rem">${esc(p.series || "")}</span>
        <h3>${esc(p.name || "Figure")}</h3>
        <span class="timer" data-end="${esc(a.ends_at)}" data-start="${esc(a.starts_at)}">⏱ <b>—</b></span>
        <div class="bid-now">
          <div><div class="lbl">${top ? "Current bid" : "Starting bid"}</div><div class="amt">${money(top ? a.current_bid : a.start_price)}</div></div>
          <div style="text-align:right"><div class="lbl">Bids</div><b>${a.bid_count || 0}</b></div>
        </div>
        ${st === "live" && !mine ? `<small style="color:var(--muted);font-weight:700">Min. next bid ${money(minBid(a))} · steps of ${money(a.min_increment)}</small>` : ""}
        ${action}
        <details data-hist="${esc(a.id)}"><summary>Bid history</summary><ul class="history"><li>Loading…</li></ul></details>
      </div></article>`;
  }

  function wireAuctionCards() {
    $$(".bid-form").forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const id = f.dataset.id, amount = parseFloat(f.querySelector("input").value);
      if (!user) return openAuth("in", () => {});
      if (!(amount > 0)) return toast("Enter a valid amount", true);
      const a = auctions.find((x) => x.id === id);
      if (!confirm(`Place a bid of ${money(amount)} on "${a.product?.name}"?\n\nBids are binding — if you win, you agree to buy.`)) return;
      const btn = f.querySelector("button"); btn.disabled = true;
      try { await api.placeBid(id, amount); toast("Bid placed — you're in the lead!"); await loadAuctions(); }
      catch (x) { toast(x.message.replace(/^.*?:\s*/, ""), true); await loadAuctions(); }
      finally { btn.disabled = false; }
    }));
    $$("details[data-hist]").forEach((d) => d.addEventListener("toggle", async () => {
      if (!d.open) return;
      try {
        const bids = await api.bids(d.dataset.hist);
        d.querySelector("ul").innerHTML = bids.length ? bids.map((b) => `<li><span>${esc(b.bidder_name)} · ${new Date(b.created_at).toLocaleString("en-AE", { dateStyle: "short", timeStyle: "short" })}</span><b>${money(b.amount)}</b></li>`).join("")
          : "<li>No bids yet — be the first!</li>";
      } catch (e) { d.querySelector("ul").innerHTML = `<li>${esc(e.message)}</li>`; }
    }));
  }

  function tick() {
    let needsRefresh = false;
    $$(".timer").forEach((t) => {
      const end = new Date(t.dataset.end), start = new Date(t.dataset.start), now = Date.now();
      const left = end - now;
      if (now < start) { t.querySelector("b").textContent = "Starts in " + fmtLeft(start - now); t.className = "timer"; return; }
      t.querySelector("b").textContent = fmtLeft(left);
      t.className = "timer" + (left <= 0 ? " ended" : left < 5 * 60e3 ? " ending" : "");
      if (left <= 0 && t.closest("#liveGrid")) needsRefresh = true;
    });
    if (needsRefresh) loadAuctions();
  }
  setInterval(tick, 1000);
  setInterval(loadAuctions, 20000); // safety net in case realtime is off
  api.subscribeAuctions(() => loadAuctions());

  // ---------- Offers ----------
  let offerProducts = [];
  async function loadOffers() {
    try { offerProducts = await api.offerProducts(); } catch (e) { toast(e.message, true); offerProducts = []; }
    $("#offerGrid").innerHTML = offerProducts.length ? offerProducts.map((p, i) => `
      <article class="card" data-i="${i}" tabindex="0">
        <div class="img"><img loading="lazy" src="${esc(imgOf(p, i))}" alt="${esc(p.name)}"><span class="badge orange">Open to offers</span></div>
        <div class="body"><span class="series">${esc(p.series || "")}</span><h3>${esc(p.name)}</h3>
          <span class="price">${p.price != null ? `<small>Listed</small> ${money(p.price)}` : `<small>Make your best offer</small>`}</span>
          <button class="btn sm gold" style="margin-top:8px">Make offer</button></div>
      </article>`).join("") : `<div class="empty" style="grid-column:1/-1">No figures are open to offers right now.</div>`;
    $$("#offerGrid .card").forEach((c) => (c.onclick = () => offerDialog(offerProducts[+c.dataset.i], +c.dataset.i)));
    loadMyOffers();
  }

  function offerDialog(p, i) {
    if (!user) return openAuth("in", () => offerDialog(p, i));
    const m = openModal(`<div class="detail">
      <div class="img"><img src="${esc(imgOf(p, i))}" alt="${esc(p.name)}"></div>
      <div class="info"><h2>${esc(p.name)}</h2>
        ${p.price != null ? `<p style="margin:0">Listed at <b>${money(p.price)}</b></p>` : ""}
        ${p.min_offer ? `<p style="margin:4px 0 0;color:var(--muted)">Minimum offer ${money(p.min_offer)}</p>` : ""}
        <form id="offerForm" style="margin-top:14px">
          <div class="field"><label>Your offer (${esc(C.CURRENCY)})</label><input name="amount" type="number" inputmode="decimal" min="${p.min_offer || 1}" step="any" required></div>
          <div class="field"><label>Message (optional)</label><textarea name="message" rows="3" maxlength="500" placeholder="e.g. pickup location, bundle deal…"></textarea></div>
          <button class="btn block" type="submit">Send offer</button>
        </form></div></div>`);
    $("#offerForm", m).onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), amount = parseFloat(f.get("amount"));
      if (p.min_offer && amount < p.min_offer) return toast(`Minimum offer is ${money(p.min_offer)}`, true);
      try { await api.submitOffer(p.id, amount, f.get("message").trim()); closeModal(); toast("Offer sent! The seller will get back to you."); loadMyOffers(); }
      catch (x) { toast(x.message, true); }
    };
  }

  async function loadMyOffers() {
    const rows = user ? await api.myOffers().catch(() => []) : [];
    $("#myOffersWrap").classList.toggle("hidden", !rows.length);
    const pill = { pending: "gold", accepted: "ok", rejected: "red", withdrawn: "no" };
    $("#myOffers").innerHTML = rows.map((o) => `<tr>
      <td>${esc(o.product?.name || "")}</td><td><b>${money(o.amount)}</b></td>
      <td><span class="pill ${pill[o.status]}">${esc(o.status)}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString("en-AE")}</td>
      <td>${o.status === "pending" ? `<button class="btn sm ghost" data-w="${esc(o.id)}">Withdraw</button>` : ""}</td></tr>`).join("");
    $$("[data-w]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Withdraw this offer?")) return;
      try { await api.withdrawOffer(b.dataset.w); toast("Offer withdrawn"); loadMyOffers(); } catch (e) { toast(e.message, true); }
    }));
  }

  async function refreshUser() { user = await auth.user(); renderAuctions(); loadMyOffers(); }
  document.addEventListener("auth-changed", refreshUser);
  auth.onChange(refreshUser);

  (async () => { user = await auth.user(); await loadAuctions(); await loadOffers(); if (location.hash) document.querySelector(location.hash)?.scrollIntoView(); })();
})();
