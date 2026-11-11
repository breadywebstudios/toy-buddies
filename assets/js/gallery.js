/* Gallery page: a 3D carousel (cover-flow style). The middle photo faces you, the neighbours
   turn away into depth. Only the photos near the middle are in the page at any time, so it
   stays smooth with hundreds of photos. Drag / swipe, arrows, keyboard, slider, autoplay,
   and a full-screen viewer for the middle photo. */
(function () {
  const { $, esc, toast, renderChrome, gallery } = App;
  renderChrome("gallery");

  const car = $("#carousel"), ring = $("#ring"), scrub = $("#carScrub"), playBtn = $("#carPlay");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let items = [], n = 0, pos = 0;               // pos is fractional while dragging
  const els = new Map();                          // photo index -> slide element (only the visible few)

  const wrap = (i) => ((i % n) + n) % n;
  const dist = (i, p) => { let d = i - p; d -= Math.round(d / n) * n; return d; };   // shortest way round the ring
  const reach = () => Math.min(4, Math.floor((n - 1) / 2));
  const current = () => wrap(Math.round(pos));

  function slideFor(i) {
    let el = els.get(i);
    if (el) return el;
    const it = items[i];
    el = document.createElement("figure");
    el.className = "slide"; el.dataset.i = i;
    el.innerHTML = `<div class="slide-bg" style="background-image:url('${esc(it.url)}')"></div>
      <img src="${esc(it.url)}" alt="${esc(it.caption || `Toy Buddies photo ${i + 1}`)}" draggable="false" decoding="async">`;
    ring.appendChild(el); els.set(i, el);
    return el;
  }

  function layout(animate = true) {
    if (!n) return;
    ring.classList.toggle("dragging", !animate);
    const r = reach(), base = Math.round(pos), cur = current(), keep = new Set();
    for (let k = -r - 1; k <= r + 1; k++) {      // one spare each side so photos glide in and out
      const i = wrap(base + k);
      if (keep.has(i)) continue;
      keep.add(i);
      const o = dist(i, pos), a = Math.abs(o), s = Math.sign(o);
      const x = s * (a <= 1 ? a * 56 : 56 + (a - 1) * 30);            // % of the card width
      const z = -(a <= 1 ? a * 190 : 190 + (a - 1) * 120);            // px into the screen
      const ry = -s * Math.min(a, 1) * 42 - s * Math.max(0, a - 1) * 4;  // turn away from the middle
      const el = slideFor(i);
      el.style.transform = `translateX(${x.toFixed(2)}%) translateZ(${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg)`;
      el.style.zIndex = String(100 - Math.round(a * 10));
      el.style.opacity = a > r + 0.4 ? "0" : String(1 - Math.min(a, 3) * 0.1);
      const center = i === cur && a < 0.5;
      el.classList.toggle("is-center", center);
      el.setAttribute("aria-hidden", center ? "false" : "true");
    }
    els.forEach((el, i) => { if (!keep.has(i)) { el.remove(); els.delete(i); } });
    $("#carCount").textContent = `${cur + 1} / ${n}`;
    scrub.value = cur + 1;
    $("#carCaption").textContent = items[cur]?.caption || "";
    for (let k = r + 2; k <= r + 3; k++) { new Image().src = items[wrap(base + k)].url; new Image().src = items[wrap(base - k)].url; }   // warm up the next few
  }

  const go = (to) => { pos = Math.round(pos) + dist(wrap(to), Math.round(pos)); layout(); };
  const step = (d) => { pos = Math.round(pos) + d; layout(); };

  // ----- autoplay -----
  let timer = null, wantPlay = false;
  const setPlay = (on) => {
    wantPlay = on; clearInterval(timer); timer = null;
    if (on && n > 1) timer = setInterval(() => step(1), 3600);
    playBtn.textContent = on ? "\u275A\u275A Pause" : "\u25B6 Play";
    playBtn.setAttribute("aria-pressed", String(on));
  };
  const hold = () => { clearInterval(timer); timer = null; };
  const resume = () => { if (wantPlay && !timer && n > 1) timer = setInterval(() => step(1), 3600); };
  playBtn.onclick = () => setPlay(!wantPlay);
  car.addEventListener("mouseenter", hold); car.addEventListener("mouseleave", resume);
  car.addEventListener("focusin", hold); car.addEventListener("focusout", resume);
  new IntersectionObserver(([e]) => (e.isIntersecting ? resume() : hold())).observe(car);

  // ----- controls -----
  $("#carPrev").onclick = () => step(-1);
  $("#carNext").onclick = () => step(1);
  scrub.oninput = () => go(+scrub.value - 1);
  car.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openViewer(current()); }
  });
  let wheelAt = 0;
  car.addEventListener("wheel", (e) => {   // sideways scroll / trackpad swipe only; normal scrolling still scrolls the page
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 12) return;
    e.preventDefault();
    if (Date.now() - wheelAt > 380) { wheelAt = Date.now(); step(Math.sign(e.deltaX)); }
  }, { passive: false });

  // drag / swipe, with the ring following your finger
  let drag = null;
  car.addEventListener("pointerdown", (e) => {
    if (e.button || !n || e.target.closest(".car-nav")) return;
    const w = ring.querySelector(".slide")?.offsetWidth || 300;
    drag = { x: e.clientX, y: e.clientY, p: pos, w, moved: false, id: e.pointerId };
    hold();
  });
  car.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(e.clientY - drag.y) > Math.abs(dx)) { drag = null; return; }   // vertical: let the page scroll
      drag.moved = true; car.setPointerCapture(e.pointerId); car.classList.add("grabbing");
    }
    pos = drag.p - dx / (drag.w * 0.56);
    layout(false);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; car.classList.remove("grabbing");
    if (d.moved) { const v = pos - d.p; pos = Math.abs(v) < 0.5 && Math.abs(v) > 0.08 ? d.p + Math.sign(v) : Math.round(pos); layout(); }
    else {
      const s = document.elementFromPoint(e.clientX, e.clientY)?.closest(".slide");
      if (s) { const i = +s.dataset.i; i === current() ? openViewer(i) : go(i); }
    }
    resume();
  };
  car.addEventListener("pointerup", endDrag);
  car.addEventListener("pointercancel", endDrag);

  // ----- full-screen viewer -----
  function openViewer(start) {
    if (!n) return;
    hold();
    let i = start;
    const lb = document.createElement("div");
    lb.className = "lightbox"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Photo viewer");
    lb.innerHTML = `<button class="lb-btn lb-close" type="button" aria-label="Close">\u00D7</button>
      <button class="lb-btn lb-prev" type="button" aria-label="Previous photo">\u2039</button>
      <figure class="lb-fig"><img alt=""><figcaption></figcaption></figure>
      <button class="lb-btn lb-next" type="button" aria-label="Next photo">\u203A</button>`;
    const img = lb.querySelector("img"), cap = lb.querySelector("figcaption");
    const show = () => {
      const it = items[i];
      img.classList.remove("in"); img.src = it.url; img.alt = it.caption || `Toy Buddies photo ${i + 1}`;
      img.decode?.().catch(() => {}).finally(() => img.classList.add("in"));
      cap.textContent = `${it.caption ? it.caption + " \u00B7 " : ""}${i + 1} / ${n}`;
      go(i);
    };
    const move = (d) => { i = wrap(i + d); show(); };
    const close = () => { lb.remove(); document.removeEventListener("keydown", key); document.body.style.overflow = ""; car.focus({ preventScroll: true }); resume(); };
    const key = (e) => { if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") move(-1); else if (e.key === "ArrowRight") move(1); };
    lb.querySelector(".lb-close").onclick = close;
    lb.querySelector(".lb-prev").onclick = () => move(-1);
    lb.querySelector(".lb-next").onclick = () => move(1);
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    let sx = null;   // swipe in the viewer
    lb.addEventListener("pointerdown", (e) => (sx = e.clientX));
    lb.addEventListener("pointerup", (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 50) move(e.clientX < sx ? 1 : -1); sx = null; });
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    document.body.appendChild(lb);
    show();
    lb.querySelector(".lb-close").focus();
  }

  // ----- load -----
  (async () => {
    try { items = (await gallery.list()).filter((g) => g && g.url); }
    catch (e) { toast(e.message, true); items = []; }
    n = items.length;
    if (!n) {
      const empty = $("#carEmpty");
      empty.textContent = "Photos coming soon \u2014 Totoy is still unboxing!";
      empty.classList.remove("hidden");
      $("#carPrev").hidden = $("#carNext").hidden = true;
      $(".car-bar").classList.add("hidden");
      return;
    }
    scrub.max = n;
    if (n < 2) { $("#carPrev").hidden = $("#carNext").hidden = true; playBtn.hidden = true; scrub.hidden = true; }
    layout(false);
    requestAnimationFrame(() => ring.classList.remove("dragging"));
    if (!reduce && n > 1) setPlay(true);
  })();
})();
