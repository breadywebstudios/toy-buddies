(function () {
  const { C, $, esc, money, debounce, toast, imgOf, api, renderChrome, openModal, waLink } = App;
  renderChrome("catalog");
  document.title = `${C.STORE_NAME} — Anime Figures`;
  if (C.STORE_TAGLINE) $("#tagline").textContent = C.STORE_TAGLINE + " — browse the catalogue, bid on rare finds, or make an offer.";

  const params = new URLSearchParams(location.search);
  const state = { q: params.get("q") || "", cat: params.get("cat") || "", sort: params.get("sort") || "new", page: +params.get("page") || 1 };
  let categories = [], lastRows = [];

  $("#q").value = state.q; $("#sort").value = state.sort;

  async function init() {
    try { categories = await api.categories(); } catch (e) { toast(e.message, true); }
    $("#cat").innerHTML = `<option value="">All categories</option>` + categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    $("#cat").value = state.cat;
    renderChips();
    load();
  }

  function renderChips() {
    $("#chips").innerHTML = [`<button class="chip ${!state.cat ? "active" : ""}" data-id="">All</button>`]
      .concat(categories.map((c) => `<button class="chip ${state.cat === c.id ? "active" : ""}" data-id="${esc(c.id)}">${esc(c.name)}</button>`)).join("");
    $("#chips").querySelectorAll(".chip").forEach((b) => (b.onclick = () => { state.cat = b.dataset.id; state.page = 1; $("#cat").value = state.cat; renderChips(); load(); }));
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q); if (state.cat) p.set("cat", state.cat);
    if (state.sort !== "new") p.set("sort", state.sort); if (state.page > 1) p.set("page", state.page);
    history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : "") + location.hash);
  }

  async function load() {
    syncUrl();
    $("#grid").innerHTML = `<div class="empty" style="grid-column:1/-1">Loading figures…</div>`;
    try {
      const size = C.PAGE_SIZE || 24;
      const { rows, count } = await api.products({ ...state, size });
      lastRows = rows;
      const start = count ? (state.page - 1) * size + 1 : 0;
      $("#meta").textContent = count ? `Showing ${start}–${start + rows.length - 1} of ${count} figures` : "";
      $("#grid").innerHTML = rows.length ? rows.map(card).join("") :
        `<div class="empty" style="grid-column:1/-1">No figures found. Try another search or category.</div>`;
      $("#grid").querySelectorAll(".card").forEach((el) => (el.onclick = () => openDetail(lastRows[+el.dataset.i], +el.dataset.i)));
      renderPager(Math.ceil(count / size));
    } catch (e) {
      $("#grid").innerHTML = `<div class="empty" style="grid-column:1/-1">Couldn't load the catalogue.</div>`;
      toast(e.message, true);
    }
  }

  function card(p, i) {
    const out = p.stock <= 0;
    return `<article class="card ${out ? "soldout" : ""}" data-i="${i}" tabindex="0">
      <div class="img"><img loading="lazy" src="${esc(imgOf(p, i))}" alt="${esc(p.name)}">
        ${out ? `<span class="badge navy">Sold out</span>` : p.condition?.startsWith("Pre") ? `<span class="badge gold">Pre-owned</span>` : ""}
        ${p.accept_offers && !out ? `<span class="badge orange right">Offers</span>` : ""}
      </div>
      <div class="body">
        <span class="series">${esc(p.series || "")}</span>
        <h3>${esc(p.name)}</h3>
        <span class="price">${p.price != null ? money(p.price) : `<small>Price on request</small>`}</span>
      </div></article>`;
  }

  function renderPager(pages) {
    if (pages <= 1) { $("#pager").innerHTML = ""; return; }
    const p = state.page, nums = new Set([1, pages, p - 1, p, p + 1].filter((n) => n >= 1 && n <= pages));
    const list = [...nums].sort((a, b) => a - b);
    let html = `<button data-p="${p - 1}" ${p === 1 ? "disabled" : ""}>‹</button>`;
    list.forEach((n, i) => {
      if (i && n - list[i - 1] > 1) html += `<button disabled>…</button>`;
      html += `<button data-p="${n}" class="${n === p ? "active" : ""}">${n}</button>`;
    });
    html += `<button data-p="${p + 1}" ${p === pages ? "disabled" : ""}>›</button>`;
    $("#pager").innerHTML = html;
    $("#pager").querySelectorAll("button[data-p]").forEach((b) => (b.onclick = () => {
      state.page = +b.dataset.p; load(); $("#catalog").scrollIntoView({ behavior: "smooth" });
    }));
  }

  function openDetail(p, i) {
    const cat = categories.find((c) => c.id === p.category_id)?.name || p.category?.name || "";
    const wa = waLink(`Hi! I'm interested in "${p.name}"${p.price != null ? ` (${money(p.price)})` : ""}. Is it available?`);
    openModal(`<div class="detail">
      <div class="img"><img src="${esc(imgOf(p, i))}" alt="${esc(p.name)}"></div>
      <div class="info">
        <span class="series" style="color:var(--sea);font-weight:800;text-transform:uppercase;font-size:.8rem">${esc(p.series || "")}</span>
        <h2>${esc(p.name)}</h2>
        <div style="font-size:1.6rem;font-weight:900;color:var(--red)">${money(p.price)}</div>
        <dl class="specs">
          ${cat ? `<dt>Category</dt><dd>${esc(cat)}</dd>` : ""}
          ${p.brand ? `<dt>Brand</dt><dd>${esc(p.brand)}</dd>` : ""}
          ${p.scale ? `<dt>Scale</dt><dd>${esc(p.scale)}</dd>` : ""}
          <dt>Condition</dt><dd>${esc(p.condition || "")}</dd>
          <dt>Stock</dt><dd>${p.stock > 0 ? `${p.stock} available` : "Sold out"}</dd>
        </dl>
        ${p.description ? `<p>${esc(p.description)}</p>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          ${wa && p.stock > 0 ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Ask on WhatsApp</a>` : ""}
          ${p.accept_offers && p.stock > 0 ? `<a class="btn gold" href="bidding.html#offers">Make an offer</a>` : ""}
        </div>
      </div></div>`);
  }

  $("#q").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300));
  $("#cat").onchange = (e) => { state.cat = e.target.value; state.page = 1; renderChips(); load(); };
  $("#sort").onchange = (e) => { state.sort = e.target.value; state.page = 1; load(); };
  $("#grid").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("card")) e.target.click(); });

  init();
})();
