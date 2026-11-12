/* =====================================================================
   Bready Darkroom - the one photo studio for every upload on Toy Buddies
   (figure photos in the catalogue, gallery photos, and re-editing photos
   that are already uploaded).

   Opens the full Bready Darkroom app (darkroom/index.html) over the page:
   looks, light & colour, HSL, curves, levels, colour grading, detail,
   crop / rotate / flip / straighten, white balance, undo/redo, batches.
   The finished photos come back here; the site then shrinks each one to
   its size budget before it is stored (see App.gallery.optimise and
   admin.uploadImage).

     import { darkroom, darkroomMany, darkroomUrl, DARKROOM } from "./darkroom.js";
     const r = await darkroom(file, DARKROOM.figure);        // { blob } or null if cancelled
     await darkroomMany(files, DARKROOM.gallery, onPhoto);    // onPhoto(blob, { name, size }, i)
   ===================================================================== */
import { setPhotoEditorNotify } from "./photo-editor.js";

const APP_URL = new URL("../../darkroom/index.html?embed=1&v=20261112q", import.meta.url).href;

export const NO_LOOK = { warmth: 0, bright: 0, vibrance: 0 };   // kept for older callers

export const DARKROOM = {
  // Figure photos show in the 4:3 wanted-poster frame: the crop tool opens at 4:3.
  figure:  { single: true, aspect: "1.3333", tab: "general", max: 2400, useLabel: "Use photo" },
  // Gallery photos keep any shape, and can be edited as a batch.
  gallery: { tab: "general", max: 2400 },
};

// Messages from the optimiser (e.g. "photo too large") go to the site's toast.
export function useToasts(toast) { setPhotoEditorNotify((m) => toast(m, true)); }

// Opens the Darkroom with these photos. Resolves to [{ blob, name, file, w, h }] or null if cancelled.
export function openDarkroom(files, opts = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "darkroom-overlay";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", "Bready Darkroom photo editor");
    wrap.innerHTML = `<div class="darkroom-loading">\uD83C\uDF9E\uFE0F Opening Bready Darkroom\u2026</div>
      <iframe src="${APP_URL}" title="Bready Darkroom"></iframe>`;
    const frame = wrap.querySelector("iframe");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(wrap);

    const finish = (value) => {
      removeEventListener("message", onMessage);
      wrap.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    };
    const onMessage = (e) => {
      if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
      const m = e.data || {};
      if (m.type === "darkroom:ready") {
        wrap.classList.add("ready");
        frame.contentWindow.postMessage({ type: "darkroom:open", files: [...files], opts }, location.origin);
        frame.focus();
      } else if (m.type === "darkroom:done") finish(m.photos || []);
      else if (m.type === "darkroom:cancel") finish(null);
    };
    addEventListener("message", onMessage);
  });
}

const withSize = (p) => { p.blob.w = p.w; p.blob.h = p.h; return p.blob; };

// One photo: resolves { blob } (blob.w / blob.h set) or null.
export async function darkroom(file, opts = {}) {
  const out = await openDarkroom([file], { single: true, ...opts });
  return out && out.length ? { blob: withSize(out[0]) } : null;
}

// Several photos: calls onPhoto(blob, { name, size }, index) for each finished one, in order.
export async function darkroomMany(files, opts = {}, onPhoto) {
  const list = [...files];
  const out = await openDarkroom(list, { ...opts, single: false });
  if (!out) return { kept: 0, skipped: list.length };
  const sizes = new Map(list.map((f) => [f.name, f.size]));
  for (const [i, p] of out.entries()) await onPhoto?.(withSize(p), { name: p.file, size: sizes.get(p.file) || p.blob.size }, i);
  return { kept: out.length, skipped: Math.max(0, list.length - out.length) };
}

// Re-open a photo that's already uploaded.
export async function darkroomUrl(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("Couldn't load the current photo");
  const blob = await r.blob();
  const name = decodeURIComponent(url.split("?")[0].split("/").pop() || "photo");
  return darkroom(new File([blob], name, { type: blob.type || "image/jpeg" }), opts);
}
