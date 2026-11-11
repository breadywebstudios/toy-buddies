/* =====================================================================
   Photo editor — drop-in, no dependencies (vanilla JS + canvas, ES module)
   Origin: Feby's Kitchen admin (febys repo, script.js), Nov 2026.

   Features: crop with aspect presets (Square / 4:3 / 3:4 / Original),
   drag to recentre, wheel / pinch / slider zoom (zooms towards cursor),
   rotate 90° left/right + straighten slider (±20°, auto-trims corners),
   warm "food photography" look (warmth / brightness / vibrance, hold to
   compare, reset), high-quality stepped downscale + light sharpening,
   WebP (JPEG fallback) quality ladder to hit a KB budget, batch mode
   ("Save & upload the rest as they are").

   Usage:
     import { photoEditor, autoProcess, LOOK_DEFAULT } from "./photo-editor.js";
     const r = await photoEditor(file, { kind:"item", aspect:1, title:"Lechon" });
     if (r) upload(r.blob);        // r = { blob, look, rest } or null; blob.w / blob.h set
     // opts: kind "item"|"review"|"gallery" (size presets in PHOTO_OUT) or out:{max,target}
     //       aspect 1 | 4/3 | 3/4 | "orig", lockAspect (text; hides the shape buttons so the crop matches
//       a fixed-shape display), title, count ("2 of 5"), allowRest, look
     // custom size budget:   photoEditor(file, { out:{ max:2000, target:600*1024 } })
     // no UI (batch):        await autoProcess(file, LOOK_DEFAULT, "gallery")   // or {max,target}
     // already-graded photo: pass look:{ warmth:0, bright:0, vibrance:0 } to avoid double-warming
     // re-edit a stored photo: photoEditor(await fetchPhoto(url), {...})
   Styling: injects its own CSS once (everything scoped under .pe-root).
   Theme with CSS variables on .pe-root: --pe-ink --pe-paper --pe-line
   --pe-muted --pe-accent --pe-accent-soft --pe-warn.
   Messages: setPhotoEditorNotify(msg => myToast(msg)) (default: alert).
   ===================================================================== */

let notify = (msg) => alert(msg);
export function setPhotoEditorNotify(fn){ notify = fn; }
const toast = (msg) => notify(msg);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]));

// Styles (same as photo-editor.css), injected on first use.
const PE_CSS = ".pe-root{--pe-ink:#1f1d1a;--pe-paper:#faf8f3;--pe-line:#e4ded3;--pe-muted:#7a736a;--pe-accent:#3f6b45;--pe-accent-soft:#e8efe6;--pe-warn:#b7791f;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--pe-ink)}\n.pe-root *{box-sizing:border-box}\n.pe-root .overlay{position:fixed;inset:0;background:rgba(20,20,20,.45);z-index:2147483000;display:grid;place-items:center;padding:16px}\n.pe-root .modal{background:var(--pe-paper);border-radius:18px;width:min(780px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden}\n.pe-root .mh{padding:16px 22px;border-bottom:1px solid var(--pe-line);display:flex;align-items:center;justify-content:space-between}\n.pe-root .mh h3{margin:0;font-size:22px;font-weight:600}\n.pe-root .mb{padding:18px 22px;overflow:auto}\n.pe-root .mf{padding:14px 22px;border-top:1px solid var(--pe-line);background:#fff;display:flex;gap:10px;justify-content:flex-end;align-items:center}\n.pe-root .mf .grow{flex:1}\n.pe-root .x{background:none;border:0;font-size:26px;line-height:1;color:var(--pe-muted);cursor:pointer}\n.pe-root .seg{display:flex;gap:6px;flex-wrap:wrap}\n.pe-root .seg button{border:1.5px solid var(--pe-line);background:#fff;border-radius:10px;padding:8px 12px;font-size:14px;color:var(--pe-ink);cursor:pointer}\n.pe-root .seg button.on{border-color:var(--pe-ink);background:var(--pe-accent-soft)}\n.pe-root .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:999px;padding:10px 18px;font-size:14px;border:1.5px solid var(--pe-ink);background:var(--pe-ink);color:#fff;white-space:nowrap;cursor:pointer;font-family:inherit}\n.pe-root .btn:hover{background:var(--pe-accent);border-color:var(--pe-accent)}\n.pe-root .btn.ghost{background:#fff;color:var(--pe-ink);border-color:var(--pe-line)}\n.pe-root .btn.ghost:hover{border-color:var(--pe-ink);background:#fff}\n.pe-root .btn.sm{padding:6px 12px;font-size:13px}\n.pe-root .btn:disabled{opacity:.5;cursor:default}\n.pe-root .modal.pe{width:min(780px,100%)}\r\n.pe-root .pe h3 small{font-family:inherit;font-size:14px;font-weight:400;color:var(--pe-muted);margin-left:6px}\r\n.pe-root .pe .mb{display:flex;flex-direction:column;gap:12px}\r\n.pe-root .pe .mb>*{flex:none}\r\n.pe-root .pe-lock{font-size:13px;color:var(--pe-ink);background:var(--pe-accent-soft);border-radius:8px;padding:8px 12px}\n.pe-root .pe-for{font-size:13px;color:var(--pe-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r\n.pe-root .pe-stage{display:flex;align-items:center;justify-content:center;background:#1d1b18;border-radius:12px;padding:14px;min-height:150px}\r\n.pe-root .pe-frame{flex:none;position:relative;overflow:hidden;touch-action:none;cursor:grab;border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,.3),0 10px 30px rgba(0,0,0,.4);background:#000}\r\n.pe-root .pe-frame:active{cursor:grabbing}\r\n.pe-root .pe-frame canvas{position:absolute;left:0;top:0;max-width:none;transform-origin:0 0;pointer-events:none;user-select:none}\r\n.pe-root .pe-grid{position:absolute;inset:0;z-index:1;pointer-events:none;\r\n  background-image:linear-gradient(to right,rgba(255,255,255,.28) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.28) 1px,transparent 1px);\r\n  background-size:33.3333% 100%,100% 33.3333%;background-position:-1px 0,0 -1px}\r\n.pe-root .pe-frame.fine .pe-grid{background-size:11.1111% 100%,100% 11.1111%}   /* denser grid while straightening */\r\n.pe-root .pe-rot{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:-4px}\r\n.pe-root .pe-hint{font-size:12.5px;color:var(--pe-muted);text-align:center;margin-top:-4px}\r\n.pe-root .pe-row{display:grid;grid-template-columns:92px 1fr 44px;gap:10px;align-items:center;font-size:13.5px;color:var(--pe-ink)}\r\n.pe-root .pe-row input[type=range]{width:100%;accent-color:var(--pe-accent);cursor:pointer}\r\n.pe-root .pe-row output{text-align:right;color:var(--pe-muted);font-variant-numeric:tabular-nums}\r\n.pe-root .pe-look{display:grid;gap:8px;padding:12px 14px;border:1px solid var(--pe-line);border-radius:12px;background:#fff}\r\n.pe-root .pe-look-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px}\r\n.pe-root .pe-look-btns{display:flex;gap:6px;flex-wrap:wrap}\r\n.pe-root .pe-look-btns .btn{touch-action:none;user-select:none;-webkit-user-select:none}\r\n.pe-root .pe-info{font-size:12.5px;color:var(--pe-muted)}\r\n.pe-root .pe-info.warn{color:var(--pe-warn)}\r\n.pe-root .pe .mf{flex-wrap:wrap}\r\n.pe-root .pe .mf .btn{white-space:normal;text-align:center}\r\n@media (max-width:560px){\r\n  .pe-root .pe-row{grid-template-columns:76px 1fr 38px}\r\n  .pe-root .pe-stage{padding:8px}\r\n  .pe-root .pe .mf .grow{display:none}\r\n  .pe-root .pe .mf .btn{flex:1 1 auto}\r\n  .pe-root .pe .mf [data-pe=\"rest\"]{flex-basis:100%;order:3}\r\n}\n";
function injectCss(){
  if(document.getElementById("pe-style")) return;
  const s = document.createElement("style"); s.id = "pe-style"; s.textContent = PE_CSS; document.head.appendChild(s);
}

/* ============================================================
   PHOTOS — editor (crop / recentre / zoom), warm "food look",
   and size optimisation before anything is stored.
   ============================================================ */
// Longest side in px and the file-size budget per kind of photo.
export const PHOTO_OUT = {
  item:    { max:1400, target:350*1024 },   // menu cards + full-size view
  review:  { max:1200, target:300*1024 },
  gallery: { max:1800, target:550*1024 }
};
export const LOOK_DEFAULT = { warmth:55, bright:6, vibrance:35 };   // warm, appetising starting point
const MAX_SOURCE_BYTES = 30*1024*1024;

let webpOK = null;
async function canWebp(){
  if(webpOK === null){
    const c = document.createElement("canvas"); c.width = c.height = 2;
    const b = await new Promise(r => c.toBlob(r, "image/webp", .8));
    webpOK = b?.type === "image/webp";
  }
  return webpOK;
}
const newCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("Couldn't compress this photo")), type, q));

// High-quality downscale: halve step by step, then a final high-quality draw.
function drawScaled(src, sx, sy, sw, sh, ow, oh){
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
  while(cw > ow*2 && ch > oh*2){
    const c = newCanvas(cw/2, ch/2), g = c.getContext("2d");
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(cur, cx, cy, cw, ch, 0, 0, c.width, c.height);
    cur = c; cx = cy = 0; cw = c.width; ch = c.height;
  }
  const out = newCanvas(ow, oh), g = out.getContext("2d", { willReadFrequently:true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(cur, cx, cy, cw, ch, 0, 0, out.width, out.height);
  return out;
}

// Soft background for a zoomed-out photo: the photo itself, cover-fitted and heavily blurred, slightly dimmed.
function blurFill(ctx, src, w, h){
  const sw = src.width, sh = src.height, sc = Math.max(w/sw, h/sh), cw = w/sc, ch = h/sc;
  const m = Math.max(w, h), tiny = drawScaled(src, (sw - cw)/2, (sh - ch)/2, cw, ch, Math.max(2, w/m*28), Math.max(2, h/m*28));
  const mid = newCanvas(tiny.width*4, tiny.height*4), mg = mid.getContext("2d");
  mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = "high"; mg.drawImage(tiny, 0, 0, mid.width, mid.height);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mid, 0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,.1)"; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Food look: warmer whites and highlights, gentle lift, richer (not garish) colour.
function applyLook(ctx, w, h, look){
  const wa = look.warmth/100, br = look.bright/100, vi = look.vibrance/100;
  if(!wa && !br && !vi) return;
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  const con = 1 + .08*vi + .03*wa;
  const lut = mul => { const t = new Uint8ClampedArray(256);
    for(let v = 0; v < 256; v++){ let x = br >= 0 ? v + (255-v)*br*.55 : v*(1 + br*.55); x = ((x*mul) - 128)*con + 128; t[v] = x; }
    return t; };
  const lr = lut(1 + .075*wa), lg = lut(1 + .02*wa), lb = lut(1 - .10*wa);
  const vs = vi*.7;
  for(let i = 0; i < d.length; i += 4){
    let r = d[i], g = d[i+1], b = d[i+2];
    if(vs){
      const mx = r>g ? (r>b?r:b) : (g>b?g:b), mn = r<g ? (r<b?r:b) : (g<b?g:b);
      const avg = (r+g+b)/3, k = vs*(1 - (mx-mn)/255);   // boosts muted colours more than vivid ones
      r += (r-avg)*k; g += (g-avg)*k; b += (b-avg)*k;
      r = r<0?0:r>255?255:r|0; g = g<0?0:g>255?255:g|0; b = b<0?0:b>255?255:b|0;
    }
    d[i] = lr[r]; d[i+1] = lg[g]; d[i+2] = lb[b];
  }
  ctx.putImageData(im, 0, 0);
}

// Light sharpening to restore crispness lost in resizing.
function sharpen(ctx, w, h, amount){
  if(w < 3 || h < 3 || !amount) return;
  const im = ctx.getImageData(0, 0, w, h), s = im.data, o = new Uint8ClampedArray(s), row = w*4;
  for(let y = 1; y < h-1; y++) for(let x = 1; x < w-1; x++){
    const i = y*row + x*4;
    for(let c = 0; c < 3; c++){ const k = i+c; o[k] = s[k] + (4*s[k] - s[k-4] - s[k+4] - s[k-row] - s[k+row])*amount*.25; }
  }
  im.data.set(o); ctx.putImageData(im, 0, 0);
}

// Crop → resize → look → sharpen → WebP (JPEG fallback), best quality that fits the budget.
export async function renderPhoto(bm, crop, look, out){
  const sc = Math.min(1, out.max/Math.max(crop.sw, crop.sh));
  const c = drawScaled(bm, crop.sx, crop.sy, crop.sw, crop.sh, crop.sw*sc, crop.sh*sc);
  const g = c.getContext("2d", { willReadFrequently:true });
  applyLook(g, c.width, c.height, look);
  sharpen(g, c.width, c.height, sc < .75 ? .4 : .2);
  const type = (await canWebp()) ? "image/webp" : "image/jpeg";
  let blob;
  for(const q of [.9, .86, .82, .77, .72, .66, .6]){ blob = await toBlob(c, type, q); if(blob.size <= out.target) break; }
  if(blob.size > 5*1024*1024) throw new Error("Couldn't make this photo small enough to store");
  blob.ready = true; blob.w = c.width; blob.h = c.height;
  return blob;
}
async function openBitmap(file){
  const bm = await createImageBitmap(file);
  if(bm.width*bm.height > 80e6){ bm.close(); throw new Error("This photo is too large to process"); }
  return bm;
}
// No editing: whole photo, given look (used for "upload the rest as they are").
export async function autoProcess(file, look, kind){
  const bm = await openBitmap(file);
  try{ return await renderPhoto(bm, { sx:0, sy:0, sw:bm.width, sh:bm.height }, look, typeof kind === "object" ? kind : PHOTO_OUT[kind]); }
  finally{ bm.close(); }
}
export const photoReadyNote = b => `Photo ready · ${b.w}×${b.h} px · ${Math.max(1, Math.round(b.size/1024))} KB`;

/* Opens the editor. Resolves { blob, look, rest } or null if cancelled.
   opts: kind ("item" | "review" | "gallery"), aspect (1 | 4/3 | 3/4 | "orig"), title, count, allowRest,
         heading (dialog title, default "Edit photo"), lookLabel (default "Food look") */
export async function photoEditor(file, opts = {}){
  injectCss();
  const kind = opts.kind || "item", out = opts.out || PHOTO_OUT[kind] || PHOTO_OUT.item;
  if(file.size > MAX_SOURCE_BYTES){ toast("That photo is too large (max 30 MB)", true); return null; }
  let bm;
  try{ bm = await openBitmap(file); }catch(e){ toast(e.message || "Couldn't open that photo", true); return null; }
  const W0 = bm.width, H0 = bm.height;
  const pk = Math.min(1, 1100/Math.max(W0, H0));                 // on-screen preview resolution
  const small = drawScaled(bm, 0, 0, W0, H0, W0*pk, H0*pk);
  // Rotation: quarter turns + fine "straighten" tilt. The working image (iw × ih) is the rotated photo
  // trimmed to the largest upright rectangle inside it, so no empty corners ever appear.
  let quarter = 0, tilt = 0, iw = W0, ih = H0, base = small, view = null, vctx = null;
  const rotAngle = () => quarter*Math.PI/2 + tilt*Math.PI/180;
  const rotated = () => quarter || tilt;
  const fitRotation = () => {
    const sw = quarter % 2 ? H0 : W0, sh = quarter % 2 ? W0 : H0, a = sw/sh, t = Math.abs(tilt)*Math.PI/180, c = Math.cos(t), s = Math.sin(t);
    iw = Math.min(sw/(c + s/a), sh/(s + c/a)); ih = iw/a;
  };
  const drawRotated = (src, k) => {
    const c = newCanvas(iw*k, ih*k), g = c.getContext("2d");
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.translate(c.width/2, c.height/2); g.rotate(rotAngle());
    g.drawImage(src, -W0*k/2, -H0*k/2, W0*k, H0*k);
    return c;
  };
  let look = { ...(opts.look || LOOK_DEFAULT) }, aspect = opts.aspect ?? 1, z = 1, cx = iw/2, cy = ih/2, fw = 0, fh = 0;
  const ASPECTS = [["Square", 1], ["4:3", 4/3], ["3:4", 3/4], ["Original", "orig"]];
  const SLIDERS = [["warmth", "Warmth", 0, 100], ["bright", "Brightness", -40, 40], ["vibrance", "Vibrance", 0, 100]];

  const root = document.createElement("div");
  root.className = "pe-root";
  root.innerHTML = `<div class="overlay"><div class="modal pe" role="dialog" aria-modal="true" aria-label="Edit photo">
    <div class="mh"><h3>${esc(opts.heading || "Edit photo")}${opts.count ? ` <small>${esc(opts.count)}</small>` : ""}</h3><button class="x" data-pe="cancel" aria-label="Close">×</button></div>
    <div class="mb">
      ${opts.title ? `<div class="pe-for">${esc(opts.title)}</div>` : ""}
      ${opts.lockAspect ? `<div class="pe-lock">${esc(opts.lockAspect)}</div>` : `<div class="seg" id="peAspect">${ASPECTS.map(([l, a]) => `<button type="button" data-a="${a}">${l}</button>`).join("")}</div>`}
      <div class="pe-stage" id="peStage"><div class="pe-frame" id="peFrame"><div class="pe-grid"></div></div></div>
      <div class="pe-hint">Drag the photo to recentre · scroll or pinch to zoom (below 1× fits the whole photo on a soft background) · use Straighten to fix a tilted angle</div>
      <div class="pe-row"><span>Zoom</span><input type="range" id="peZoom" min="0.5" max="5" step="0.01" value="1" aria-label="Zoom"><output id="peZoomOut">1.0×</output></div>
      <div class="pe-row"><span>Straighten</span><input type="range" id="peTilt" min="-20" max="20" step="0.1" value="0" aria-label="Straighten angle"><output id="peTiltOut">0°</output></div>
      <div class="pe-rot">
        <button type="button" class="btn ghost sm" id="peRotL" title="Rotate 90° left">⟲ Rotate left</button>
        <button type="button" class="btn ghost sm" id="peRotR" title="Rotate 90° right">Rotate right ⟳</button>
        <button type="button" class="btn ghost sm" id="peLevel" title="Undo the straighten angle">Level</button>
      </div>
      <div class="pe-look">
        <div class="pe-look-head"><b>${esc(opts.lookLabel || "Food look")}</b>
          <div class="pe-look-btns"><button type="button" class="btn ghost sm" id="peCompare">Hold to see original</button><button type="button" class="btn ghost sm" id="peReset">Reset</button></div></div>
        ${SLIDERS.map(([k, l, mn, mx]) => `<div class="pe-row"><span>${l}</span><input type="range" data-look="${k}" min="${mn}" max="${mx}" step="1" value="${look[k]}" aria-label="${l}"><output data-out="${k}">${look[k]}</output></div>`).join("")}
      </div>
      <div class="pe-info" id="peInfo"></div>
    </div>
    <div class="mf">
      ${opts.allowRest ? `<button type="button" class="btn ghost sm" data-pe="rest" title="Save this one, then upload the remaining photos uncropped with this look">Save &amp; upload the rest as they are</button>` : ""}
      <div class="grow"></div>
      <button type="button" class="btn ghost" data-pe="cancel">${opts.allowRest ? "Skip this photo" : "Cancel"}</button>
      <button type="button" class="btn" data-pe="save">Use photo</button>
    </div></div></div>`;
  document.body.appendChild(root);
  const $$ = s => root.querySelector(s), frame = $$("#peFrame"), stage = $$("#peStage"), zoom = $$("#peZoom");
  // rebuild the preview after a rotation change (keeps the same spot in the middle for tilt changes)
  const rebuild = (keepCentre = true) => {
    const fx = cx/iw, fy = cy/ih;
    fitRotation();
    base = rotated() ? drawRotated(small, pk) : small;
    if(!view || view.width !== base.width || view.height !== base.height){
      const nv = newCanvas(base.width, base.height);
      if(view) view.replaceWith(nv); else frame.prepend(nv);
      view = nv; vctx = nv.getContext("2d", { willReadFrequently:true });
    }
    cx = keepCentre ? fx*iw : iw/2; cy = keepCentre ? fy*ih : ih/2;
  };
  rebuild(false);
  // background shown around the photo when zoomed out below 1×
  const bg = newCanvas(2, 2), bgctx = bg.getContext("2d");
  bg.style.width = "100%"; bg.style.height = "100%"; bg.style.visibility = "hidden";
  frame.prepend(bg);

  const ar = () => aspect === "orig" ? iw/ih : aspect;
  const crop = () => {
    const A = ar(); let bw = iw, bh = ih;
    if(iw/ih > A) bw = ih*A; else bh = iw/A;
    const cw = bw/z, ch = bh/z;
    // zoomed in: the frame stays inside the photo; zoomed out: the photo stays inside the frame
    const clampC = (c, half, size) => Math.min(Math.max(c, Math.min(half, size - half)), Math.max(half, size - half));
    cx = clampC(cx, cw/2, iw); cy = clampC(cy, ch/2, ih);
    return { sx:cx - cw/2, sy:cy - ch/2, sw:cw, sh:ch };
  };
  const layout = () => {
    const A = ar(), maxW = Math.max(200, stage.clientWidth - 28), maxH = Math.min(440, Math.max(220, innerHeight*.42));
    fw = maxW; fh = fw/A; if(fh > maxH){ fh = maxH; fw = fh*A; }
    frame.style.width = fw + "px"; frame.style.height = fh + "px";
    if(bg.width !== Math.round(fw) || bg.height !== Math.round(fh)){ bg.width = Math.round(fw); bg.height = Math.round(fh); paint(); }
    root.querySelectorAll("#peAspect button").forEach(b => b.classList.toggle("on", String(aspect) === b.dataset.a));
    place();
  };
  const place = () => {
    const c = crop(), s = fw/c.sw;
    view.style.width = iw*s + "px"; view.style.height = ih*s + "px";
    view.style.transform = `translate(${-c.sx*s}px, ${-c.sy*s}px)`;
    zoom.value = z; $("#peZoomOut").textContent = z.toFixed(1) + "×";
    bg.style.visibility = z < 1 ? "visible" : "hidden";
    const k = Math.min(1, out.max/Math.max(c.sw, c.sh)), rw = Math.round(c.sw*k), rh = Math.round(c.sh*k), soft = Math.max(rw, rh) < 700;
    const info = $$("#peInfo");
    info.textContent = `Saved as ${rw}×${rh} px, compressed to about ${Math.round(out.target/1024)} KB or less.` + (soft ? " Zoomed in a lot — the photo may look soft." : "");
    info.classList.toggle("warn", soft);
  };
  let raf = 0;
  const paint = (original = false) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { vctx.drawImage(base, 0, 0); if(!original) applyLook(vctx, view.width, view.height, look); blurFill(bgctx, view, bg.width, bg.height); });
  };
  const setZoom = (v, fx = fw/2, fy = fh/2) => {          // zoom towards the point under the finger / cursor
    const before = crop(), s0 = fw/before.sw, px = before.sx + fx/s0, py = before.sy + fy/s0;
    z = Math.min(5, Math.max(.5, v));
    const after = crop(), s1 = fw/after.sw;
    cx += px - (after.sx + fx/s1); cy += py - (after.sy + fy/s1);
    place();
  };

  // drag / pinch
  const pts = new Map(); let pinch = 0;
  frame.addEventListener("pointerdown", e => { frame.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x:e.clientX, y:e.clientY }); pinch = 0; });
  frame.addEventListener("pointermove", e => {
    const p = pts.get(e.pointerId); if(!p) return;
    if(pts.size === 1){ const s = fw/crop().sw; cx -= (e.clientX - p.x)/s; cy -= (e.clientY - p.y)/s; place(); }
    p.x = e.clientX; p.y = e.clientY;
    if(pts.size === 2){
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = frame.getBoundingClientRect();
      if(pinch) setZoom(z*d/pinch, (a.x + b.x)/2 - r.left, (a.y + b.y)/2 - r.top);
      pinch = d;
    }
  });
  const up = e => { pts.delete(e.pointerId); pinch = 0; };
  frame.addEventListener("pointerup", up); frame.addEventListener("pointercancel", up);
  frame.addEventListener("wheel", e => { e.preventDefault(); const r = frame.getBoundingClientRect(); setZoom(z*Math.exp(-e.deltaY*.0015), e.clientX - r.left, e.clientY - r.top); }, { passive:false });
  zoom.oninput = () => setZoom(+zoom.value);
  root.querySelectorAll("#peAspect button").forEach(b => b.onclick = () => { aspect = b.dataset.a === "orig" ? "orig" : +b.dataset.a; layout(); });

  // rotate / straighten
  const tiltIn = $$("#peTilt");
  const setTilt = v => {
    tilt = Math.round(Math.min(20, Math.max(-20, v))*10)/10;
    tiltIn.value = tilt; $$("#peTiltOut").textContent = (tilt > 0 ? "+" : "") + tilt + "°";
    rebuild(); layout(); paint();
  };
  tiltIn.oninput = () => { frame.classList.add("fine"); setTilt(+tiltIn.value); };
  tiltIn.onchange = () => frame.classList.remove("fine");
  ["pointerup", "blur"].forEach(n => tiltIn.addEventListener(n, () => frame.classList.remove("fine")));
  const turn = d => { quarter = (quarter + d + 4) % 4; rebuild(false); layout(); paint(); };
  $$("#peRotL").onclick = () => turn(-1);
  $$("#peRotR").onclick = () => turn(1);
  $$("#peLevel").onclick = () => setTilt(0);

  // look
  const syncSliders = () => SLIDERS.forEach(([k]) => { $$(`[data-look="${k}"]`).value = look[k]; $$(`[data-out="${k}"]`).textContent = look[k]; });
  root.querySelectorAll("[data-look]").forEach(inp => inp.oninput = () => { look[inp.dataset.look] = +inp.value; $$(`[data-out="${inp.dataset.look}"]`).textContent = inp.value; paint(); });
  $$("#peReset").onclick = () => { look = { ...LOOK_DEFAULT }; syncSliders(); paint(); };
  const cmp = $$("#peCompare");
  cmp.addEventListener("pointerdown", () => paint(true));
  ["pointerup", "pointerleave", "pointercancel"].forEach(n => cmp.addEventListener(n, () => paint()));

  const onResize = () => layout();
  addEventListener("resize", onResize);

  return new Promise(resolve => {
    const finish = v => { removeEventListener("resize", onResize); removeEventListener("keydown", onKey, true); bm.close(); root.remove(); resolve(v); };
    const onKey = e => { if(e.key === "Escape"){ e.stopImmediatePropagation(); finish(null); } };
    addEventListener("keydown", onKey, true);   // runs before the page's own Escape handler, so only the editor closes
    root.querySelectorAll('[data-pe="cancel"]').forEach(b => b.onclick = () => finish(null));
    root.querySelectorAll('[data-pe="save"],[data-pe="rest"]').forEach(b => b.onclick = async () => {
      root.querySelectorAll("[data-pe]").forEach(x => x.disabled = true);
      const label = b.textContent; b.textContent = "Optimising…";
      try{ let src = rotated() ? drawRotated(bm, 1) : bm, c = crop();
        if(z < 1){   // zoomed out: place the photo on its blurred background at the output size
          const k = Math.min(1, out.max/Math.max(c.sw, c.sh)), comp = newCanvas(c.sw*k, c.sh*k), g = comp.getContext("2d");
          blurFill(g, src, comp.width, comp.height);
          g.drawImage(drawScaled(src, 0, 0, iw, ih, iw*k, ih*k), -c.sx*k, -c.sy*k);
          src = comp; c = { sx:0, sy:0, sw:comp.width, sh:comp.height };
        }
        const blob = await renderPhoto(src, c, look, out); finish({ blob, look:{ ...look }, rest:b.dataset.pe === "rest" }); }
      catch(e){ toast(e.message || "Couldn't process this photo", true); b.textContent = label; root.querySelectorAll("[data-pe]").forEach(x => x.disabled = false); }
    });
    layout(); paint();
  });
}
// Re-open an already uploaded photo in the editor.
export async function fetchPhoto(url){
  const r = await fetch(url, { cache:"no-store" });
  if(!r.ok) throw new Error("Couldn't load the current photo");
  return await r.blob();
}

// Make sure a blob is optimised before storing it (no-op for blobs that came out of the editor).
export async function ensureOptimised(blob, kind = "item", look = { warmth:0, bright:0, vibrance:0 }){
  return blob.ready ? blob : autoProcess(blob, look, kind);
}

// Upload helper for Supabase Storage (pass your client). Returns the public URL.
//   const url = await uploadToSupabase(supabase, "my-bucket", r.blob, "items");
export async function uploadToSupabase(sb, bucket, blob, folder = "photos", kind = "item"){
  blob = await ensureOptimised(blob, kind);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType:blob.type, cacheControl:"31536000" });
  if(error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Batch flow used for galleries: editor per photo, "Skip", or "Save & upload the rest as they are".
// Calls onPhoto(blob, file, index) for each kept photo. Returns { kept, skipped }.
export async function editMany(files, opts = {}, onPhoto){
  let restLook = null, kept = 0, skipped = 0;
  for(const [i, file] of [...files].entries()){
    let blob;
    if(restLook) blob = await autoProcess(file, restLook, opts.out || opts.kind || "gallery");
    else{
      const r = await photoEditor(file, { kind:"gallery", aspect:"orig", title:file.name, ...opts,
        count: files.length > 1 ? `${i + 1} of ${files.length}` : "", allowRest: files.length > 1 && i < files.length - 1 });
      if(!r){ skipped++; continue; }
      blob = r.blob; if(r.rest) restLook = r.look;
    }
    await onPhoto?.(blob, file, i); kept++;
  }
  return { kept, skipped };
}

// Lower-level building blocks, for custom pipelines.
export { canWebp, newCanvas, toBlob, drawScaled, applyLook, sharpen, openBitmap, MAX_SOURCE_BYTES };
