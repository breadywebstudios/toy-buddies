/* =====================================================================
   Bready Darkroom - bridge for the Toy Buddies admin.

   The Darkroom app (index.html) is used exactly as it is. This file only
   switches on when the admin opens it with ?embed=1:
     - receives the photos the admin picked and loads them into the app
     - swaps "Export" for "Use photo" / "Upload N photos" plus "Cancel"
     - renders the finished photos (crops, looks, every edit) and hands them
       back to the admin, which shrinks and uploads them

   Messages (same site only):
     admin -> app   { type:"darkroom:open", files:[File], opts }
     app -> admin   { type:"darkroom:ready" }
                    { type:"darkroom:done", photos:[{ blob, name, file, w, h }] }
                    { type:"darkroom:cancel" }
   opts: single (one photo only), aspect ("1.3333" etc. opens the crop tool
   at that shape), tab ("general" | "food" | "portrait" | "mine"),
   max (longest side to render, px), useLabel, title.
   ===================================================================== */
(function () {
  "use strict";
  if (!/[?&]embed=1\b/.test(location.search) || window.parent === window) return;

  const ORIGIN = location.origin;
  const q = (s) => document.querySelector(s);
  const post = (msg) => window.parent.postMessage(msg, ORIGIN);
  let opts = {};
  document.documentElement.classList.add("embedded");

  // ---- header: Cancel + Use photo(s) instead of Export ----
  const exportBtn = q("#exportBtn");
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn"; cancelBtn.type = "button"; cancelBtn.textContent = "Cancel";
  const useBtn = document.createElement("button");
  useBtn.className = "btn primary"; useBtn.type = "button"; useBtn.textContent = "Use photo";
  exportBtn.hidden = true;
  exportBtn.after(cancelBtn, useBtn);
  const exportAll = q("#exportAllBtn");
  if (exportAll) exportAll.style.display = "none";

  const realPhotos = () => photos.filter((p) => !p.isSample);
  const setLabel = () => {
    const n = realPhotos().length;
    useBtn.textContent = opts.single || n < 2 ? (opts.useLabel || "Use photo") : "Upload " + n + " photos";
  };
  const strip = q("#stripRow");
  if (strip) new MutationObserver(setLabel).observe(strip, { childList: true });

  cancelBtn.onclick = () => post({ type: "darkroom:cancel" });
  // Escape closes the Darkroom, unless it's closing the crop tool (capture phase sees the state first)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !cropMode && q("#exportSheet").hidden) post({ type: "darkroom:cancel" });
  }, true);

  // ---- render every photo with its crop and look, at up to opts.max px ----
  async function renderAll() {
    stashCurrent();
    const keep = { src: src, geo: clone(state.geo) }, look = curP(), out = [];
    const max = opts.max || 2400;
    const list = opts.single ? [photos[cur]] : photos;
    try {
      for (let i = 0; i < list.length; i++) {
        const ph = list[i];
        if (!ph || ph.isSample) continue;
        useBtn.textContent = "Rendering " + (i + 1) + " of " + list.length + "...";
        await new Promise((r) => setTimeout(r, 0));
        let c;
        try { c = ph === photos[cur] ? keep.src : await sourceFor(ph); } catch (e) { continue; }
        src = c; if (gpu) gpu.setSource(c); state.geo = clone(ph.geo);
        const dims = croppedFullDims(), W = dims[0], H = dims[1], s = Math.min(1, max / Math.max(W, H));
        const d = { w: Math.max(16, Math.round(W * s)), h: Math.max(16, Math.round(H * s)), exact: false };
        const P = syncLook ? look : effParams(ph.p, ph.filter.id, ph.filter.amount);
        const canvas = renderOut(d, P);
        let blob;
        try { blob = await toBlob(canvas, "webp", 0.92); } catch (e) { blob = await toBlob(canvas, "jpg", 0.92); }
        out.push({ blob: blob, name: ph.name, file: ph.file ? ph.file.name : ph.name, w: d.w, h: d.h });
      }
    } finally {
      src = keep.src; if (gpu) gpu.setSource(keep.src); state.geo = keep.geo; schedule(true);
    }
    return out;
  }

  useBtn.onclick = async () => {
    if (cropMode) exitCrop(true);
    useBtn.disabled = cancelBtn.disabled = true;
    try {
      const done = await renderAll();
      if (!done.length) throw new Error("add a photo first");
      post({ type: "darkroom:done", photos: done });
    } catch (e) {
      toast("Couldn't finish: " + (e && e.message ? e.message : e));
      useBtn.disabled = cancelBtn.disabled = false; setLabel();
    }
  };

  // ---- photos arrive from the admin ----
  window.addEventListener("message", async (e) => {
    if (e.origin !== ORIGIN || e.source !== window.parent || !e.data || e.data.type !== "darkroom:open") return;
    opts = e.data.opts || {};
    if (opts.title) document.title = "Bready Darkroom \u00B7 " + opts.title;
    if (opts.single) { const open = q("#openBtn"); if (open) open.hidden = true; }
    if (opts.tab) { const t = q('.tabs button[data-tab="' + opts.tab + '"]'); if (t) t.click(); }
    await addFiles(e.data.files || []);
    setLabel();
    // a fixed shape (e.g. 4:3 for the wanted-poster frame): open the crop tool at that shape
    const sel = q("#aspect");
    if (opts.aspect && sel && [].some.call(sel.options, (o) => o.value === opts.aspect) && realPhotos().length) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        enterCrop();
        sel.value = opts.aspect; cropAspect = opts.aspect;
        state.geo.crop = maxRectFor(aspectK()); placeCrop();
        toast("Crop set to the poster shape \u2014 drag to adjust, then Apply or Use photo");
      }));
    }
  });

  post({ type: "darkroom:ready" });
})();
