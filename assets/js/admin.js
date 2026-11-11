(function () {
  const { C, DEMO, $, $$, esc, money, debounce, toast, imgOf, auth, api, admin, renderChrome, openModal, closeModal, openAuth, waLink } = App;
  renderChrome("admin");
  document.title = `Admin \u2014 ${C.STORE_NAME}`;

  let categories = [];
  const ps = { q: "", cat: "", page: 1, size: 25 };
  let prodRows = [];

  // ---------- Owner / admin login ----------
  // Completely separate from member accounts:
  //  - its own session (see APP_AREA in common.js), so a shopper's login never opens the admin
  //  - no public sign-up: only the very first owner can create an account here, plus people the
  //    owner has invited under Users -> Add a site admin
  //  - nobody ever needs to open the database to get access
  const GATE = {
    setup:  { title: "Set up the owner account", sub: "This store has no owner yet. Create the owner account to start managing figures, auctions and users.", btn: "Create owner account" },
    login:  { title: "Owner & admin sign in",    sub: "For the store owner and staff only. Shoppers sign in from the shop.",                                    btn: "Sign in" },
    invite: { title: "Create your admin account", sub: "Use the exact email address the owner invited. It becomes an admin account automatically.",            btn: "Create admin account" },
  };

  async function gate(denyMsg) {
    const u = await auth.user();
    let ok = false;
    if (u) {
      ok = await auth.isAdmin();
      // First ever sign-in on a brand-new store: that account becomes the owner.
      if (!ok && !(await admin.hasAdmins().catch(() => true))) {
        try { await admin.claimFirstAdmin(); ok = true; toast("Welcome! You're the store owner."); } catch (e) { /* someone else claimed it first */ }
      }
      if (!ok) {
        await auth.signOut(); App.refreshAuthSlot();
        return showGate("login", typeof denyMsg === "string" ? denyMsg : `${u.email} doesn't have admin access. Members sign in from the shop, not here.`, "red");
      }
    }
    if (!ok) return showGate();
    $("#gate").classList.add("hidden");
    $("#app").classList.remove("hidden");
    App.refreshAuthSlot();
    await loadCats(); showTab(location.hash.slice(1) || "dash");
  }

  async function showGate(mode, msg = "", kind = "ok") {
    $("#app").classList.add("hidden");
    const g = $("#gate"); g.classList.remove("hidden");
    if (!mode) mode = (await admin.hasAdmins().catch(() => true)) ? "login" : "setup";
    const t = GATE[mode], isNew = mode !== "login";
    g.innerHTML = `
      <div class="gate-head"><img src="assets/img/logo-180.png" alt="" width="64" height="64"><span class="gate-kicker">\uD83D\uDD12 Store admin</span></div>
      <h2>${t.title}</h2>
      <p class="gate-sub">${t.sub}</p>
      ${DEMO ? `<div class="notice">Demo mode: any email and password will open the admin.</div>` : ""}
      ${msg ? `<div class="notice ${kind === "red" ? "red" : "ok"}">${esc(msg)}</div>` : ""}
      <form id="gateForm">
        ${isNew ? `<div class="field"><label for="gName">Your name</label><input id="gName" name="name" required autocomplete="name"></div>` : ""}
        <div class="field"><label for="gEmail">Email</label><input id="gEmail" name="email" type="email" required autocomplete="username"></div>
        <div class="field"><label for="gPw">Password</label><input id="gPw" name="password" type="password" ${isNew ? 'minlength="8"' : ""} required autocomplete="${isNew ? "new-password" : "current-password"}"></div>
        ${isNew ? `<div class="field"><label for="gPw2">Repeat password</label><input id="gPw2" name="password2" type="password" minlength="8" required autocomplete="new-password"></div>` : ""}
        <button class="btn navy block" type="submit">${t.btn}</button>
      </form>
      <div class="gate-links">
        ${mode === "login" ? `<a href="#" data-go="forgot">Forgot password?</a><a href="#" data-go="invite">Invited by the owner? Create your admin account</a>` : ""}
        ${mode === "invite" ? `<a href="#" data-go="login">Already have an admin account? Sign in</a>` : ""}
        ${mode === "setup" ? `<a href="#" data-go="login">Owner account already created? Sign in</a>` : ""}
        <a href="index.html">\u2190 Back to the shop</a>
      </div>`;

    $$("[data-go]", g).forEach((a) => (a.onclick = async (e) => {
      e.preventDefault();
      if (a.dataset.go !== "forgot") return showGate(a.dataset.go);
      const email = $("#gEmail").value.trim();
      if (!email) return toast("Type your email first", true);
      try { await auth.resetPassword(email); toast("Password reset link sent \u2014 check your email"); } catch (x) { toast(x.message, true); }
    }));

    $("#gateForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), btn = $("button[type=submit]", e.target);
      const email = f.get("email").trim(), pw = f.get("password");
      if (isNew && pw !== f.get("password2")) return toast("The passwords don't match", true);
      btn.disabled = true;
      try {
        if (mode === "login") { await auth.signIn(email, pw); return await gate(); }
        const r = await auth.signUp(email, pw, f.get("name").trim(), "");
        if (!DEMO && !r?.session) {
          return showGate("login", `Almost done \u2014 we emailed a confirmation link to ${email}. Click it, then sign in here.`);
        }
        await gate(mode === "invite"
          ? `${email} hasn't been invited as an admin. Ask the owner to add it under Users \u2192 Add a site admin, then sign in here.`
          : undefined);
      } catch (x) { toast(x.message, true); }
      finally { btn.disabled = false; }
    };
  }
  document.addEventListener("auth-changed", () => gate());

  // ---------- Tabs ----------
  function showTab(t) {
    if (!$(`[data-pane="${t}"]`)) t = "dash";
    $$("#side button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    $$("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== t));
    history.replaceState(null, "", "#" + t);
    ({ dash: loadDash, cats: renderCats, prods: loadProds, aucs: loadAucs, offs: loadOffs, gal: loadGal, users: loadUsers })[t]();
  }
  $$("#side button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

  // ---------- Dashboard ----------
  async function loadDash() {
    try {
      const [{ count }, aucs, offs] = await Promise.all([api.products({ admin: true, size: 1 }), admin.allAuctions(), admin.allOffers()]);
      const now = Date.now();
      const live = aucs.filter((a) => !a.cancelled && new Date(a.starts_at) <= now && new Date(a.ends_at) > now).length;
      const pend = offs.filter((o) => o.status === "pending").length;
      const ended = aucs.filter((a) => !a.cancelled && new Date(a.ends_at) <= now && a.current_bid != null).length;
      $("#stats").innerHTML = [["Figures", count], ["Categories", categories.length], ["Live auctions", live], ["Pending offers", pend], ["Auctions won", ended]]
        .map(([l, v]) => `<div class="stat">${l}<b>${v}</b></div>`).join("");
    } catch (e) { toast(e.message, true); }
  }

  // ---------- Categories ----------
  async function loadCats() {
    categories = await api.categories();
    const opts = categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    $("#pcat").innerHTML = `<option value="">All categories</option>` + opts;
    $("#pcat").value = ps.cat;
  }
  async function renderCats() {
    await loadCats();
    const counts = await admin.categoryCounts().catch(() => ({}));
    $("#catRows").innerHTML = categories.length ? categories.map((c) => `<tr>
      <td>${c.sort_order}</td><td><b>${esc(c.name)}</b>${c.description ? `<br><small style="color:var(--muted)">${esc(c.description)}</small>` : ""}</td>
      <td>${counts[c.id] || 0}</td>
      <td class="actions"><button class="btn sm navy" data-ce="${esc(c.id)}">Edit</button><button class="btn sm ghost" data-cd="${esc(c.id)}">Delete</button></td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">No categories yet \u2014 add your first one above.</td></tr>`;
    $$("[data-ce]").forEach((b) => (b.onclick = () => {
      const c = categories.find((x) => x.id === b.dataset.ce), f = $("#catForm");
      f.id.value = c.id; f.name.value = c.name; f.sort_order.value = c.sort_order; f.description.value = c.description || "";
      $("#catSave").textContent = "Save changes"; $("#catCancel").classList.remove("hidden"); f.name.focus();
    }));
    $$("[data-cd]").forEach((b) => (b.onclick = async () => {
      const c = categories.find((x) => x.id === b.dataset.cd);
      if (!confirm(`Delete category "${c.name}"?\nFigures in it will stay but become uncategorised.`)) return;
      try { await admin.deleteCategory(c.id); toast("Category deleted"); renderCats(); } catch (e) { toast(e.message, true); }
    }));
  }
  function resetCatForm() { const f = $("#catForm"); f.reset(); f.id.value = ""; $("#catSave").textContent = "Add category"; $("#catCancel").classList.add("hidden"); }
  $("#catCancel").onclick = resetCatForm;
  $("#catForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, row = { name: f.name.value.trim(), sort_order: +f.sort_order.value || 0, description: f.description.value.trim() || null };
    if (f.id.value) row.id = f.id.value;
    try { await admin.saveCategory(row); toast(row.id ? "Category updated" : "Category added"); resetCatForm(); renderCats(); } catch (x) { toast(x.message, true); }
  };

  // ---------- Figures ----------
  async function loadProds() {
    try {
      const { rows, count } = await api.products({ q: ps.q, cat: ps.cat, page: ps.page, size: ps.size, sort: "new", admin: true });
      prodRows = rows;
      const catName = (id) => categories.find((c) => c.id === id)?.name || "\u2014";
      $("#prodRows").innerHTML = rows.length ? rows.map((p, i) => `<tr>
        <td><img class="thumb" src="${esc(imgOf(p, i))}" alt=""></td>
        <td><b>${esc(p.name)}</b><br><small style="color:var(--muted)">${esc([p.series, p.brand, p.scale].filter(Boolean).join(" \u00B7 "))}</small></td>
        <td>${esc(catName(p.category_id))}</td><td>${p.price != null ? money(p.price) : "\u2014"}</td>
        <td>${p.stock}</td>
        <td>${p.is_published ? `<span class="pill ok">Visible</span>` : `<span class="pill no">Hidden</span>`} ${p.accept_offers ? `<span class="pill gold">Offers</span>` : ""}</td>
        <td class="actions"><button class="btn sm navy" data-pe="${i}">Edit</button><button class="btn sm gold" data-pa="${i}">Auction</button><button class="btn sm ghost" data-pd="${i}">Delete</button></td></tr>`).join("")
        : `<tr><td colspan="7" class="empty">No figures found.</td></tr>`;
      $$("[data-pe]").forEach((b) => (b.onclick = () => prodDialog(prodRows[+b.dataset.pe])));
      $$("[data-pa]").forEach((b) => (b.onclick = () => { const p = prodRows[+b.dataset.pa]; showTab("aucs"); $("#aucForm").product.value = p.name; $("#aucForm").start_price.value = p.price ? Math.round(p.price * 0.6) : ""; $("#aucForm").start_price.focus(); }));
      $$("[data-pd]").forEach((b) => (b.onclick = async () => {
        const p = prodRows[+b.dataset.pd];
        if (!confirm(`Delete "${p.name}"? This also removes its auctions, bids and offers.`)) return;
        try { await admin.deleteProduct(p.id); toast("Figure deleted"); loadProds(); } catch (e) { toast(e.message, true); }
      }));
      const pages = Math.ceil(count / ps.size);
      $("#ppager").innerHTML = pages > 1 ? `<button ${ps.page === 1 ? "disabled" : ""} data-p="${ps.page - 1}">\u2039 Prev</button><button disabled>Page ${ps.page} of ${pages} \u00B7 ${count} figures</button><button ${ps.page === pages ? "disabled" : ""} data-p="${ps.page + 1}">Next \u203A</button>` : "";
      $$("#ppager [data-p]").forEach((b) => (b.onclick = () => { ps.page = +b.dataset.p; loadProds(); }));
    } catch (e) { toast(e.message, true); }
  }
  $("#pq").addEventListener("input", debounce((e) => { ps.q = e.target.value.trim(); ps.page = 1; loadProds(); }));
  $("#pcat").onchange = (e) => { ps.cat = e.target.value; ps.page = 1; loadProds(); };
  $("#newProd").onclick = () => prodDialog(null);

  function prodDialog(p) {
    const v = (k, d = "") => esc(p?.[k] ?? d);
    const m = openModal(`<div class="modal-pad"><h2>${p ? "Edit figure" : "Add figure"}</h2>
      <form id="prodForm" class="form-grid">
        <div class="full"><label>Name *</label><input name="name" required value="${v("name")}"></div>
        <div><label>Anime / series</label><input name="series" value="${v("series")}"></div>
        <div><label>Brand</label><input name="brand" value="${v("brand")}"></div>
        <div><label>Scale / line</label><input name="scale" value="${v("scale")}" placeholder="1/7, Nendoroid\u2026"></div>
        <div><label>Category</label><select name="category_id"><option value="">\u2014 None \u2014</option>${categories.map((c) => `<option value="${esc(c.id)}" ${p?.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
        <div><label>Condition</label><select name="condition">${["New - Sealed", "New - Opened", "Pre-owned - Boxed", "Pre-owned - Loose"].map((c) => `<option ${p?.condition === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div><label>Price (AED) \u2014 blank = on request</label><input name="price" type="number" min="0" step="any" value="${v("price")}"></div>
        <div><label>Stock</label><input name="stock" type="number" min="0" value="${v("stock", 1)}"></div>
        <div class="full"><label>Description</label><textarea name="description" rows="3">${v("description")}</textarea></div>
        <div class="full"><label>Photo</label>
          <div class="photo-field">
            <img class="preview-img" id="prev" src="${esc(imgOf(p || { name: "New" }))}" alt="">
            <div class="photo-actions">
              <label class="btn sm" style="margin:0">\uD83D\uDCF7 Choose photo<input type="file" name="file" accept="image/*" hidden></label>
              <button class="btn sm ghost" type="button" id="pDarkroom" ${p?.image_url ? "" : "hidden"}>\u2702\uFE0F Edit in Bready Darkroom</button>
              <small id="pPhotoNote">Every photo opens in <b>Bready Darkroom</b>: crop to the poster frame, straighten, fix the light. It's shrunk to save space before upload.</small>
            </div>
          </div>
          <input name="image_url" placeholder="...or paste an image URL" value="${p?.image_url?.startsWith("data:") ? "" : v("image_url")}" style="margin-top:8px"></div>
        <label class="check"><input type="checkbox" name="is_published" ${p ? (p.is_published ? "checked" : "") : "checked"}> Show on website</label>
        <label class="check"><input type="checkbox" name="accept_offers" ${p?.accept_offers ? "checked" : ""}> Open to offers</label>
        <div><label>Minimum offer (AED, optional)</label><input name="min_offer" type="number" min="0" step="any" value="${v("min_offer")}"></div>
        <div class="full actions"><button class="btn" type="submit" id="pSave">Save figure</button><button class="btn ghost" type="button" id="pCancel">Cancel</button></div>
      </form></div>`);
    const f = $("#prodForm", m);
    let uploaded = p?.image_url || null;
    let edited = null, source = null;   // Darkroom result, and the original file it came from (re-edit from the original)
    const openDarkroom = async (src, isStored) => {
      try {
        const dr = await import("./darkroom.js"); dr.useToasts(toast);
        const opts = { ...dr.DARKROOM.figure, title: f.name.value.trim() || "Figure photo", ...(isStored ? { look: dr.NO_LOOK } : {}) };
        const r = isStored ? await dr.darkroomUrl(src, opts) : await dr.darkroom(src, opts);
        if (!r) return false;
        edited = r.blob;
        $("#prev", m).src = URL.createObjectURL(edited);
        $("#pPhotoNote", m).textContent = `Ready - ${edited.w}x${edited.h} px - ${Math.max(1, Math.round(edited.size / 1024))} KB - uploads when you save.`;
        $("#pDarkroom", m).hidden = false;
        return true;
      } catch (x) { toast(x.message, true); return false; }
    };
    f.file.onchange = async () => {
      const file = f.file.files[0]; if (!file) return;
      if (await openDarkroom(file, false)) source = file; else f.file.value = "";
    };
    $("#pDarkroom", m).onclick = () => {
      if (source) return openDarkroom(source, false);
      const url = f.image_url.value.trim() || p?.image_url;
      if (url) openDarkroom(url, true);
    };
    f.image_url.oninput = () => { if (f.image_url.value) { $("#prev", m).src = f.image_url.value; edited = null; source = null; } };
    $("#pCancel", m).onclick = closeModal;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#pSave", m); btn.disabled = true; btn.textContent = "Saving...";
      try {
        const file = f.file.files[0];
        if (edited) {
          btn.textContent = "Uploading photo...";
          uploaded = await admin.uploadImage(edited);   // already sized by the Darkroom
        } else if (file) {
          if (file.size > 30 * 1024 * 1024) throw new Error("Photo is over 30 MB - please use a smaller one");
          btn.textContent = "Optimising photo...";
          uploaded = await admin.uploadImage(file);
        } else if (f.image_url.value.trim()) uploaded = f.image_url.value.trim();
        const num = (x) => (x.value === "" ? null : Number(x.value));
        const row = {
          name: f.name.value.trim(), series: f.series.value.trim() || null, brand: f.brand.value.trim() || null, scale: f.scale.value.trim() || null,
          category_id: f.category_id.value || null, condition: f.condition.value, price: num(f.price), stock: Number(f.stock.value) || 0,
          description: f.description.value.trim() || null, image_url: uploaded, is_published: f.is_published.checked,
          accept_offers: f.accept_offers.checked, min_offer: num(f.min_offer),
        };
        if (p) row.id = p.id;
        await admin.saveProduct(row); closeModal(); toast(p ? "Figure updated" : "Figure added"); loadProds();
      } catch (x) { toast(x.message, true); btn.disabled = false; btn.textContent = "Save figure"; }
    };
  }

  // ---------- Gallery ----------
  const G = App.gallery;
  let gal = [], galBusy = false;
  const kb = (n) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : "");
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  const saveGal = async (msg) => { try { await G.save(gal); if (msg) toast(msg); } catch (e) { toast(e.message, true); } };

  async function loadGal() {
    if (galBusy) return renderGal();
    try { gal = await G.list(); renderGal(); } catch (e) { toast(e.message, true); }
  }
  function renderGal() {
    const total = gal.reduce((s, g) => s + (g.size || 0), 0);
    $("#galMeta").textContent = gal.length
      ? `${gal.length} photo${gal.length === 1 ? "" : "s"}${total ? ` - ${mb(total)} stored` : ""}`
      : "No photos yet. Add some to fill the carousel.";
    $("#galGrid").innerHTML = gal.map((g, i) => `
      <figure class="gal-item" draggable="true" data-i="${i}">
        <div class="gal-thumb"><span class="gal-num">${i + 1}</span><img src="${esc(g.url)}" alt="" loading="lazy" draggable="false"></div>
        <input class="gal-cap" data-i="${i}" maxlength="120" placeholder="Caption (optional)" value="${esc(g.caption || "")}">
        <div class="gal-tools">
          <button class="btn sm ghost" type="button" data-act="left" data-i="${i}" title="Move earlier" ${i ? "" : "disabled"}><-</button>
          <button class="btn sm ghost" type="button" data-act="right" data-i="${i}" title="Move later" ${i < gal.length - 1 ? "" : "disabled"}>-></button>
          <button class="btn sm ghost" type="button" data-act="edit" data-i="${i}" title="Edit in Bready Darkroom">\u2702\uFE0F</button>
          <button class="btn sm ghost" type="button" data-act="del" data-i="${i}" title="Delete photo">\uD83D\uDDD1</button>
        </div>
        <small>${g.w && g.h ? `${g.w}x${g.h} - ` : ""}${kb(g.size)}</small>
      </figure>`).join("");
  }
  const moveGal = (from, to) => {
    if (from === to || to < 0 || to >= gal.length) return;
    const [it] = gal.splice(from, 1); gal.splice(to, 0, it);
    renderGal(); saveGal();
  };

  // Add photos: quick (auto-optimised, 3 at a time) or one by one through the Darkroom.
  async function addGalPhotos(fileList, viaDarkroom) {
    if (galBusy) return toast("Still adding the last batch - please wait", true);
    let files = [...fileList].filter((f) => f.type.startsWith("image/"));
    const known = new Set(gal.map((g) => g.src).filter(Boolean));
    const dupes = files.filter((f) => known.has(f.name)).length;
    files = files.filter((f) => !known.has(f.name));
    if (!files.length) return toast(dupes ? "Those photos are already in the gallery" : "No photos selected", true);

    galBusy = true;
    const prog = $("#galProgress"), base = gal.slice(), results = [];
    let done = 0, failed = 0, before = 0, after = 0;
    const show = () => { prog.querySelector("i").style.width = `${Math.round((done / files.length) * 100)}%`; prog.querySelector("span").textContent = `${viaDarkroom ? "Saving" : "Optimising & uploading"} ${done} of ${files.length} - keep this tab open`; };
    const sync = () => { gal = base.concat(results.filter(Boolean)); };
    const keep = async (blob, file, idx) => {
      const it = await G.upload(blob);
      results[idx] = { ...it, caption: "", src: file.name, added: new Date().toISOString() };
      before += file.size; after += it.size || 0;
    };
    const checkpoint = async () => { if (done % 10 === 0) { sync(); renderGal(); await G.save(gal).catch(() => {}); } };
    const leaveGuard = (e) => { e.preventDefault(); e.returnValue = ""; };
    addEventListener("beforeunload", leaveGuard);
    prog.classList.remove("hidden"); show();
    try {
      if (viaDarkroom) {
        const dr = await import("./darkroom.js"); dr.useToasts(toast);
        let idx = 0;
        await dr.darkroomMany(files, dr.DARKROOM.gallery, async (blob, file) => {
          try { await keep(await G.optimise(blob), file, idx++); } catch (e) { failed++; console.warn(file.name, e); }
          done++; show(); await checkpoint();
        });
      } else {
        let next = 0;
        const worker = async () => {
          while (next < files.length) {
            const i = next++, file = files[i];
            try { await keep(await G.optimise(file), file, i); } catch (e) { failed++; console.warn(file.name, e); }
            done++; show(); await checkpoint();
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      }
      sync(); await G.save(gal); renderGal();
      const added = results.filter(Boolean).length;
      toast(`Added ${added} photo${added === 1 ? "" : "s"}${before ? ` - ${mb(before)} -> ${mb(after)}` : ""}${dupes ? ` - skipped ${dupes} already here` : ""}${failed ? ` - ${failed} failed` : ""}`, failed > 0);
    } catch (e) { sync(); renderGal(); toast(e.message, true); }
    finally {
      galBusy = false; prog.classList.add("hidden");
      removeEventListener("beforeunload", leaveGuard);
      $("#galFiles").value = ""; $("#galEditFiles").value = "";
    }
  }
  $("#galFiles").onchange = (e) => addGalPhotos(e.target.files, false);
  $("#galEditFiles").onchange = (e) => addGalPhotos(e.target.files, true);

  $("#galGrid").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b || galBusy) return;
    const i = +b.dataset.i, g = gal[i]; if (!g) return;
    if (b.dataset.act === "left") return moveGal(i, i - 1);
    if (b.dataset.act === "right") return moveGal(i, i + 1);
    if (b.dataset.act === "del") {
      if (!confirm("Delete this photo from the gallery? This can't be undone.")) return;
      gal.splice(i, 1); renderGal();
      try { await G.save(gal); await G.remove([g.path]); toast("Photo deleted"); } catch (x) { toast(x.message, true); }
      return;
    }
    if (b.dataset.act === "edit") {
      try {
        const dr = await import("./darkroom.js"); dr.useToasts(toast);
        const r = await dr.darkroomUrl(g.url, { ...dr.DARKROOM.gallery, title: g.caption || g.src || `Photo ${i + 1}` });
        if (!r) return;
        b.disabled = true;
        const it = await G.upload(await G.optimise(r.blob));
        gal[i] = { ...g, ...it };
        await G.save(gal); renderGal();
        await G.remove([g.path]).catch(() => {});
        toast("Photo updated");
      } catch (x) { toast(x.message, true); b.disabled = false; }
    }
  });
  $("#galGrid").addEventListener("change", (e) => {
    if (!e.target.matches(".gal-cap")) return;
    const g = gal[+e.target.dataset.i]; if (!g) return;
    g.caption = e.target.value.trim(); saveGal("Caption saved");
  });
  // drag to reorder
  let dragFrom = null;
  $("#galGrid").addEventListener("dragstart", (e) => {
    const it = e.target.closest(".gal-item"); if (!it || galBusy) return e.preventDefault();
    dragFrom = +it.dataset.i; it.classList.add("dragging"); e.dataTransfer.effectAllowed = "move";
  });
  $("#galGrid").addEventListener("dragover", (e) => {
    const it = e.target.closest(".gal-item"); if (dragFrom === null || !it) return;
    e.preventDefault();
    $$(".gal-item.drag-over").forEach((x) => x !== it && x.classList.remove("drag-over"));
    it.classList.add("drag-over");
  });
  $("#galGrid").addEventListener("drop", (e) => {
    const it = e.target.closest(".gal-item"); if (dragFrom === null || !it) return;
    e.preventDefault(); const from = dragFrom; dragFrom = null; moveGal(from, +it.dataset.i);
  });
  $("#galGrid").addEventListener("dragend", () => { dragFrom = null; $$(".gal-item.dragging, .gal-item.drag-over").forEach((x) => x.classList.remove("dragging", "drag-over")); });

  // ---------- CSV import ----------
  const CSV_COLS = ["name", "series", "brand", "scale", "category", "condition", "price", "stock", "description", "image_url", "accept_offers"];
  $("#csvTemplate").onclick = () => {
    const sample = CSV_COLS.join(",") + "\n" + `"Example Swordsman Figure","Example Anime","Banpresto","Non-scale","Prize Figures","New - Sealed",150,2,"Comes with base","",no\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sample], { type: "text/csv" })); a.download = "figures-template.csv"; a.click();
  };
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  $("#csvFile").onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    const rows = parseCSV(await file.text());
    if (rows.length < 2) return toast("CSV is empty", true);
    const head = rows[0].map((h) => h.trim().toLowerCase());
    if (!head.includes("name")) return toast('CSV needs a "name" column - download the template', true);
    const data = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()]))).filter((r) => r.name);
    if (!confirm(`Import ${data.length} figures?`)) return;
    let ok = 0, fail = 0;
    toast(`Importing ${data.length} figures...`);
    for (const r of data) {
      try {
        let catId = null;
        if (r.category) {
          let c = categories.find((x) => x.name.toLowerCase() === r.category.toLowerCase());
          if (!c) { await admin.saveCategory({ name: r.category, sort_order: categories.length }); await loadCats(); c = categories.find((x) => x.name.toLowerCase() === r.category.toLowerCase()); }
          catId = c?.id || null;
        }
        await admin.saveProduct({
          name: r.name, series: r.series || null, brand: r.brand || null, scale: r.scale || null, category_id: catId,
          condition: r.condition || "New - Sealed", price: r.price ? Number(r.price.replace(/[^\d.]/g, "")) : null,
          stock: r.stock === "" || r.stock == null ? 1 : Number(r.stock) || 0, description: r.description || null, image_url: r.image_url || null,
          is_published: true, accept_offers: /^(y|yes|true|1)$/i.test(r.accept_offers || ""), min_offer: null,
        });
        ok++;
      } catch { fail++; }
    }
    toast(`Imported ${ok} figures${fail ? `, ${fail} failed` : ""}`, !!fail);
    ps.page = 1; loadProds();
  };

  // ---------- Auctions ----------
  let prodOptions = [];
  const toLocalInput = (d) => { const z = new Date(d - new Date(d).getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };
  async function loadAucs() {
    prodOptions = await admin.productOptions().catch(() => []);
    $("#prodList").innerHTML = prodOptions.map((p) => `<option value="${esc(p.name)}"></option>`).join("");
    const f = $("#aucForm");
    if (!f.starts_at.value) f.starts_at.value = toLocalInput(new Date());
    if (!f.ends_at.value) f.ends_at.value = toLocalInput(new Date(Date.now() + 3 * 86400e3));
    try {
      const rows = await admin.allAuctions(), now = Date.now();
      $("#aucRows").innerHTML = rows.length ? rows.map((a) => {
        const st = a.cancelled ? ["Cancelled", "no"] : now < new Date(a.starts_at) ? ["Scheduled", "gold"] : now < new Date(a.ends_at) ? ["Live", "red"] : ["Ended", "ok"];
        const who = a.profile;
        const wa = who?.phone ? `https://wa.me/${who.phone.replace(/\D/g, "").replace(/^0/, "971")}` : "";
        return `<tr>
          <td><b>${esc(a.product?.name || "")}</b><br><small style="color:var(--muted)">Start ${money(a.start_price)} - step ${money(a.min_increment)}</small></td>
          <td><span class="pill ${st[1]}">${st[0]}</span></td>
          <td>${new Date(a.ends_at).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" })}</td>
          <td>${a.current_bid != null ? `<b>${money(a.current_bid)}</b>` : "-"}</td><td>${a.bid_count}</td>
          <td>${who ? `${esc(who.display_name || "")}<br><small>${esc(who.email || "")}${who.phone ? ` - <a href="${esc(wa)}" target="_blank" rel="noopener">${esc(who.phone)}</a>` : ""}</small>` : "-"}</td>
          <td class="actions"><button class="btn sm navy" data-ab="${esc(a.id)}">Bids</button>
            ${st[0] === "Live" || st[0] === "Scheduled" ? `<button class="btn sm gold" data-ax="${esc(a.id)}">+1 day</button><button class="btn sm ghost" data-ac="${esc(a.id)}">Cancel</button>` : `<button class="btn sm ghost" data-ad="${esc(a.id)}">Delete</button>`}</td></tr>`;
      }).join("") : `<tr><td colspan="7" class="empty">No auctions yet.</td></tr>`;
      $$("[data-ab]").forEach((b) => (b.onclick = () => bidsDialog(rows.find((a) => a.id === b.dataset.ab))));
      $$("[data-ax]").forEach((b) => (b.onclick = async () => {
        const a = rows.find((x) => x.id === b.dataset.ax);
        try { await admin.saveAuction({ id: a.id, ends_at: new Date(new Date(a.ends_at).getTime() + 86400e3).toISOString() }); toast("Extended by 1 day"); loadAucs(); } catch (e) { toast(e.message, true); }
      }));
      $$("[data-ac]").forEach((b) => (b.onclick = async () => {
        if (!confirm("Cancel this auction? Bidders will no longer see it.")) return;
        try { await admin.saveAuction({ id: b.dataset.ac, cancelled: true }); toast("Auction cancelled"); loadAucs(); } catch (e) { toast(e.message, true); }
      }));
      $$("[data-ad]").forEach((b) => (b.onclick = async () => {
        if (!confirm("Delete this auction and its bid history?")) return;
        try { await admin.deleteAuction(b.dataset.ad); toast("Auction deleted"); loadAucs(); } catch (e) { toast(e.message, true); }
      }));
    } catch (e) { toast(e.message, true); }
  }
  $("#aucForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, prod = prodOptions.find((p) => p.name === f.product.value.trim());
    if (!prod) return toast("Pick a figure from the list", true);
    const starts = new Date(f.starts_at.value), ends = new Date(f.ends_at.value);
    if (ends <= starts) return toast("End time must be after start time", true);
    try {
      await admin.saveAuction({ product_id: prod.id, start_price: Number(f.start_price.value), min_increment: Number(f.min_increment.value), starts_at: starts.toISOString(), ends_at: ends.toISOString() });
      toast("Auction started!"); f.reset(); f.min_increment.value = 10; f.starts_at.value = ""; f.ends_at.value = ""; loadAucs();
    } catch (x) { toast(x.message, true); }
  };
  async function bidsDialog(a) {
    const bids = await admin.allBids(a.id).catch((e) => (toast(e.message, true), []));
    openModal(`<div class="modal-pad"><h2>Bids - ${esc(a.product?.name || "")}</h2>
      <div class="table-wrap"><table><thead><tr><th>Amount</th><th>Bidder</th><th>Contact</th><th>Time</th></tr></thead><tbody>
      ${bids.length ? bids.map((b) => `<tr><td><b>${money(b.amount)}</b></td><td>${esc(b.profile?.display_name || b.bidder_name)}</td><td><small>${esc(b.profile?.email || "")}<br>${esc(b.profile?.phone || "")}</small></td><td>${new Date(b.created_at).toLocaleString("en-AE", { dateStyle: "short", timeStyle: "short" })}</td></tr>`).join("") : `<tr><td colspan="4" class="empty">No bids yet</td></tr>`}
      </tbody></table></div></div>`);
  }

  // ---------- Offers ----------
  async function loadOffs() {
    try {
      const filter = $("#ofilter").value;
      const rows = (await admin.allOffers()).filter((o) => !filter || o.status === filter);
      const pill = { pending: "gold", accepted: "ok", rejected: "red", withdrawn: "no" };
      $("#offRows").innerHTML = rows.length ? rows.map((o) => {
        const who = o.profile, wa = who?.phone ? `https://wa.me/${who.phone.replace(/\D/g, "").replace(/^0/, "971")}?text=${encodeURIComponent(`Hi ${who.display_name || ""}, about your ${money(o.amount)} offer for "${o.product?.name}"...`)}` : "";
        return `<tr>
          <td><b>${esc(o.product?.name || "")}</b>${o.product?.price != null ? `<br><small style="color:var(--muted)">Listed ${money(o.product.price)}</small>` : ""}</td>
          <td><b>${money(o.amount)}</b></td>
          <td>${esc(who?.display_name || "")}<br><small>${esc(who?.email || "")}${who?.phone ? ` - <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</small></td>
          <td><small>${esc(o.message || "")}</small></td>
          <td><span class="pill ${pill[o.status]}">${esc(o.status)}</span></td>
          <td class="actions">${o.status === "pending" ? `<button class="btn sm" data-oa="${esc(o.id)}">Accept</button><button class="btn sm ghost" data-or="${esc(o.id)}">Reject</button>` : ""}</td></tr>`;
      }).join("") : `<tr><td colspan="6" class="empty">No offers here.</td></tr>`;
      $$("[data-oa]").forEach((b) => (b.onclick = () => setOffer(b.dataset.oa, "accepted")));
      $$("[data-or]").forEach((b) => (b.onclick = () => setOffer(b.dataset.or, "rejected")));
    } catch (e) { toast(e.message, true); }
  }
  async function setOffer(id, status) {
    if (!confirm(`Mark this offer as ${status}? The buyer will see the new status on the bidding page.`)) return;
    try { await admin.setOfferStatus(id, status); toast(`Offer ${status}`); loadOffs(); } catch (e) { toast(e.message, true); }
  }
  $("#ofilter").onchange = loadOffs;

  // ---------- Users ----------
  let users = [], me = null;
  async function loadUsers() {
    try { me = await auth.user(); users = await admin.users(); renderUsers(); } catch (e) { toast(e.message, true); }
    loadInvites();
  }
  async function loadInvites() {
    const inv = await admin.invites().catch(() => []);
    $("#invitesWrap").classList.toggle("hidden", !inv.length);
    $("#inviteRows").innerHTML = inv.map((i) => `<tr><td><b>${esc(i.email)}</b></td><td><small>Invited ${new Date(i.created_at).toLocaleDateString("en-AE")}</small></td>
      <td class="actions"><button class="btn sm ghost" data-ci="${esc(i.email)}">Cancel</button></td></tr>`).join("");
    $$("[data-ci]").forEach((b) => (b.onclick = async () => {
      if (!confirm(`Cancel the admin invite for ${b.dataset.ci}?`)) return;
      try { await admin.cancelInvite(b.dataset.ci); toast("Invite cancelled"); loadInvites(); } catch (e) { toast(e.message, true); }
    }));
  }
  $("#addAdminForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#adminEmail").value.trim().toLowerCase();
    if (!confirm(`Give ${email} full admin access?\nThey'll be able to manage figures, auctions, offers and users.`)) return;
    try {
      const r = await admin.addAdminByEmail(email);
      toast(r === "added" ? `${email} is now an admin` : `Invited - send ${email} this admin page to create their admin account`);
      $("#adminEmail").value = ""; loadUsers();
    } catch (x) { toast(x.message.replace(/^.*?:\s*/, ""), true); }
  };
  function renderUsers() {
    const q = ($("#uq").value || "").toLowerCase(), f = $("#ufilter").value;
    const rows = users.filter((u) => (!q || [u.display_name, u.email, u.phone].join(" ").toLowerCase().includes(q))
      && (!f || (f === "admin" ? u.is_admin : f === "blocked" ? u.is_blocked : u.bids + u.offers > 0)));
    $("#userRows").innerHTML = rows.length ? rows.map((u) => {
      const self = me && u.id === me.id;
      const wa = u.phone ? `https://wa.me/${u.phone.replace(/\D/g, "").replace(/^0/, "971")}` : "";
      return `<tr>
        <td><b>${esc(u.display_name || "\u2014")}</b>${self ? ` <span class="pill gold">You</span>` : ""}</td>
        <td><small>${esc(u.email || "")}${u.phone ? `<br><a href="${esc(wa)}" target="_blank" rel="noopener">${esc(u.phone)}</a>` : ""}</small></td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleDateString("en-AE") : "\u2014"}</td>
        <td>${u.bids}</td><td>${u.offers}</td><td>${u.wins}</td>
        <td>${u.is_admin ? `<span class="pill red">Admin</span>` : u.is_blocked ? `<span class="pill no">Blocked</span>` : `<span class="pill ok">Buyer</span>`}</td>
        <td class="actions">${self ? "" : `
          ${u.is_admin ? `<button class="btn sm ghost" data-ua="${esc(u.id)}" data-on="0">Remove admin</button>` : `<button class="btn sm navy" data-ua="${esc(u.id)}" data-on="1">Make admin</button>`}
          ${u.is_admin ? "" : u.is_blocked ? `<button class="btn sm gold" data-ub="${esc(u.id)}" data-on="0">Unblock</button>` : `<button class="btn sm ghost" data-ub="${esc(u.id)}" data-on="1">Block</button>`}`}</td></tr>`;
    }).join("") : `<tr><td colspan="8" class="empty">No users found.</td></tr>`;
    $$("[data-ua]").forEach((b) => (b.onclick = async () => {
      const u = users.find((x) => x.id === b.dataset.ua), on = b.dataset.on === "1";
      if (!confirm(on ? `Give ${u.email} full admin access?\nThey'll be able to manage figures, auctions, offers and users.` : `Remove admin access from ${u.email}?`)) return;
      try { await admin.setAdmin(u.id, on); toast(on ? "Admin access granted" : "Admin access removed"); loadUsers(); } catch (e) { toast(e.message, true); }
    }));
    $$("[data-ub]").forEach((b) => (b.onclick = async () => {
      const u = users.find((x) => x.id === b.dataset.ub), on = b.dataset.on === "1";
      if (!confirm(on ? `Block ${u.email}? They won't be able to bid or make offers.` : `Unblock ${u.email}?`)) return;
      try { await admin.setBlocked(u.id, on); toast(on ? "User blocked" : "User unblocked"); loadUsers(); } catch (e) { toast(e.message, true); }
    }));
  }
  $("#uq").addEventListener("input", debounce(renderUsers, 150));
  $("#ufilter").onchange = renderUsers;

  gate();
})();
