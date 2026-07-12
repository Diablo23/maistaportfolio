/* ============================================================
   Web3 Motion Designer — interaction engine
   ============================================================ */
(function () {
  "use strict";

  // Cache-busting for videos. BUMP this number by 1 each time you swap a video
  // file (e.g. "2" -> "3"), then hard-refresh once. Lets the browser cache the
  // large clips normally and only re-download when you actually change one.
  const MEDIA_VERSION = "2";
  const MEDIA_BUST = "?v=" + MEDIA_VERSION;

  // Always open at the beginning on reload (no restored scroll position)
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ---------- helpers ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- reel sources ---------- */
  // Vimeo video IDs (embedded via iframe — files no longer hosted in the repo)
  const SHOWREEL_ID = "1208013673";
  const REELS = [
    { id: "1208013672", tag: "REEL 01" },
    { id: "1208013671", tag: "REEL 02" },
    { id: "1208013705", tag: "REEL 03" },
    { id: "1208013697", tag: "REEL 04" },
    { id: "1208013670", tag: "REEL 05" },
    { id: "1208013698", tag: "REEL 06" },
    { id: "1208013696", tag: "REEL 07" },
    { id: "1208013707", tag: "REEL 08" },
    { id: "1208013709", tag: "REEL 09" },
  ];

  /* scattered target rects (% of stage) — 3 × 3 ring with a featured centre.
     Spaced so none overlap; the centre tile (index 8) is the highlight,
     slightly larger and kept upright so it stands out. */
  const SCATTER = [
    { l: 2,  t: 5,  w: 24, h: 22 },    // 0 top-left
    { l: 38, t: 4,  w: 24, h: 22 },    // 1 top-centre
    { l: 38, t: 34, w: 24, h: 22 },    // 2 third reel — now in the centre
    { l: 2,  t: 37, w: 24, h: 22 },    // 3 mid-left
    { l: 74, t: 37, w: 24, h: 22 },    // 4 mid-right
    { l: 2,  t: 63, w: 24, h: 22 },    // 5 bottom-left
    { l: 38, t: 64, w: 24, h: 22 },    // 6 bottom-centre
    { l: 74, t: 63, w: 24, h: 22 },    // 7 bottom-right
    { l: 74, t: 5,  w: 24, h: 22 },    // 8 top-right — now a normal reel like the rest
  ];
  // slight tilt per reel
  const REEL_ANGLES = [-5, 4, -4, 5, -5, 5, -4, 4, 5];

  // each reel's video aspect ratio (width/height), filled from Vimeo on load
  const reelAR = new Array(REELS.length).fill(null);
  let showreelAR = null;                         // showreel aspect (from Vimeo) — for cover-fit
  const DEFAULT_AR = 16 / 9;
  // largest rect of the given aspect that fits inside a slot box, centred in it
  function fitInSlot(slot, ar, sW, sH) {
    ar = ar || DEFAULT_AR;
    const boxW = (slot.w / 100) * sW, boxH = (slot.h / 100) * sH;
    let fw, fh;
    if (boxW / boxH > ar) { fh = boxH; fw = boxH * ar; }   // slot wider than video → limit by height
    else { fw = boxW; fh = boxW / ar; }                    // slot taller than video → limit by width
    const w = (fw / sW) * 100, h = (fh / sH) * 100;
    return { l: slot.l + (slot.w - w) / 2, t: slot.t + (slot.h - h) / 2, w, h };
  }
  // like fitInSlot, but sizes every tile to the SAME visual AREA (that of a 16:9 tile in
  // this slot) — so 4:3 videos don't look smaller than 16:9 ones. Keeps each tile centred
  // in its slot; caps height so a near-square clip can't overflow into its neighbours.
  function fitByArea(slot, ar, sW, sH) {
    ar = ar || DEFAULT_AR;
    const boxW = (slot.w / 100) * sW, boxH = (slot.h / 100) * sH;
    // reference area = a 16:9 tile fitted in this slot (16:9 tiles stay exactly as before)
    let rw, rh;
    if (boxW / boxH > DEFAULT_AR) { rh = boxH; rw = boxH * DEFAULT_AR; }
    else { rw = boxW; rh = boxW / DEFAULT_AR; }
    const area = rw * rh;
    let fh = Math.sqrt(area / ar), fw = Math.sqrt(area * ar);
    const cap = boxH * 1.3;                                 // don't grow taller than ~1.3× the slot
    if (fh > cap) { fh = cap; fw = fh * ar; }
    const w = (fw / sW) * 100, h = (fh / sH) * 100;
    return { l: slot.l + (slot.w - w) / 2, t: slot.t + (slot.h - h) / 2, w, h };
  }
  // ask Vimeo for each video's real dimensions (oEmbed via JSONP), then reshape its frame
  function loadReelAspects() {
    REELS.forEach((reel, i) => {
      const s = document.createElement("script");
      const cb = "voe_" + i + "_" + reel.id;
      window[cb] = function (data) {
        if (data && data.width && data.height) reelAR[i] = data.width / data.height;
        try { delete window[cb]; } catch (e) {}
        s.remove();
        layoutReels();
      };
      s.onerror = function () { try { delete window[cb]; } catch (e) {} s.remove(); };
      s.src = "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F" + reel.id + "&callback=" + cb;
      document.head.appendChild(s);
    });
    // showreel aspect too, so we can force it to COVER the screen (no side bars)
    const ss = document.createElement("script");
    const scb = "voe_showreel";
    window[scb] = function (data) {
      if (data && data.width && data.height) showreelAR = data.width / data.height;
      try { delete window[scb]; } catch (e) {}
      ss.remove();
      sizeBaseIframes();
    };
    ss.onerror = function () { try { delete window[scb]; } catch (e) {} ss.remove(); };
    ss.src = "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F" + SHOWREEL_ID + "&callback=" + scb;
    document.head.appendChild(ss);
  }
  // largest rect of the given aspect that COVERS a box (fills it, cropping overflow)
  function coverBox(boxW, boxH, ar) {
    ar = ar || DEFAULT_AR;
    return boxW / boxH >= ar
      ? { w: boxW, h: boxW / ar }     // box wider → match width, overflow height
      : { w: boxH * ar, h: boxH };    // box taller → match height, overflow width
  }
  // Size each iframe ONCE (transform:scale handles the animation → no per-frame re-layout).
  // The SHOWREEL renders at fullscreen (it IS fullscreen). Each REEL renders only at its
  // grid-cell size (~1/3 screen) — 9 reels at 1/3 screen is far lighter than 9 fullscreen
  // ones, which is what made the split lag (badly on Mac).
  function sizeBaseIframes() {
    const sW = stage.clientWidth || window.innerWidth;
    const sH = stage.clientHeight || window.innerHeight;
    if (showreelIframe) {
      const b = coverBox(sW, sH, showreelAR || DEFAULT_AR);
      showreelIframe.style.width = b.w.toFixed(1) + "px";
      showreelIframe.style.height = b.h.toFixed(1) + "px";
    }
  }
  // Lay out each reel ONCE at its final tile (video-aspect). The scatter animation is then
  // pure transform (translate+scale) from fullscreen → this tile, so no layout repaint/blink.
  function layoutReels() {
    const sW = stage.clientWidth || window.innerWidth;
    const sH = stage.clientHeight || window.innerHeight;
    reelEls.forEach((o, i) => {
      const tile = fitByArea(SCATTER[i], reelAR[i] || DEFAULT_AR, sW, sH);
      o.tileRect = tile;
      applyRect(o.reel, tile);
    });
  }

  const ENTER = { l: 6, t: 40, w: 88, h: 54 };   // showreel on enter
  const FULL  = { l: 4, t: 6,  w: 92, h: 88 };   // (kept for reference)
  const SR_FULL = { l: 0, t: 0, w: 100, h: 100 };// showreel at fullscreen — edge to edge
  // 3×3 grid that fills the screen — where the reels START (so the screen stays full as the
  // showreel hands off), each reel then shrinks + scatters to its slot.
  const GRID = [];
  for (let gr = 0; gr < 3; gr++) for (let gc = 0; gc < 3; gc++)
    GRID.push({ l: gc * 33.34, t: gr * 33.34, w: 33.34, h: 33.34 });

  const lerpRect = (A, B, t) => ({
    l: lerp(A.l, B.l, t), t: lerp(A.t, B.t, t),
    w: lerp(A.w, B.w, t), h: lerp(A.h, B.h, t),
  });
  const applyRect = (el, r) => {
    // skip non-finite values — writing "NaN%" makes the browser ignore the update and the
    // element gets stuck at whatever it last rendered
    if (!isFinite(r.l) || !isFinite(r.t) || !isFinite(r.w) || !isFinite(r.h)) return;
    el.style.left = r.l + "%"; el.style.top = r.t + "%";
    el.style.width = r.w + "%"; el.style.height = r.h + "%";
  };

  /* ============================================================
     BACKGROUND SHAPE FIELD
     ============================================================ */
  const shapeData = [];                                  // per-shape motion params
  function buildShapes() {
    const field = document.getElementById("bg-shapes");
    field.innerHTML = "";
    shapeData.length = 0;
    const types = ["v-square", "v-circle", "v-diamond"];
    // span the whole scrollable page, not just one screen.
    // zero the field first so it doesn't inflate scrollHeight (it's position:absolute
    // and would otherwise feed its own height back into the measurement on each rebuild).
    field.style.height = "0px";
    const pageH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    field.style.height = pageH + "px";
    const screens = pageH / window.innerHeight;
    const isPhone = window.innerWidth < 760;
    const perScreen = isPhone ? 22 : 15;                        // phone: more shapes, but small
    const count = Math.min(200, Math.max(30, Math.round(screens * perScreen)));
    const BASE = isPhone ? 42 : 105;                            // phone: ~2.5x smaller shapes
    const order = ["v-square", "v-circle", "v-diamond"];
    const fieldW = field.clientWidth || window.innerWidth;
    const placed = [];                                          // {cx,cy,r} for overlap checks
    const GAP = 6;                                              // breathing room between shapes
    // find a spot that doesn't overlap already-placed shapes (null if none found)
    const findSpot = (size) => {
      const r = size * 0.7;                                     // covers rotated diamonds too
      for (let a = 0; a < 40; a++) {
        const x = rand(0, Math.max(0, fieldW - size));
        const y = rand(0, Math.max(0, pageH - size));
        const cx = x + size / 2, cy = y + size / 2;
        let ok = true;
        for (let j = 0; j < placed.length; j++) {
          const q = placed[j];
          const dx = cx - q.cx, dy = cy - q.cy, min = r + q.r + GAP;
          if (dx * dx + dy * dy < min * min) { ok = false; break; }
        }
        if (ok) { placed.push({ cx, cy, r }); return { x, y }; }
      }
      return null;
    };
    for (let i = 0; i < count; i++) {
      const size = BASE * rand(0.35, 0.90);                     // 35%–90% of base, varied
      const spot = findSpot(size);
      if (!spot) continue;                                      // skip rather than overlap
      const s = document.createElement("div");
      s.className = "shape " + types[i % 3];
      s.style.width = size + "px";
      s.style.height = size + "px";
      s.style.left = spot.x + "px";
      s.style.top = spot.y + "px";
      const inner = document.createElement("div");
      inner.className = "shape-inner";
      s.appendChild(inner);
      // hover → morph into a different shape and STAY that way (no revert)
      s.addEventListener("mouseenter", () => {
        const cur = order.findIndex((c) => s.classList.contains(c));
        const next = order[(cur + 1) % order.length];
        if (cur !== -1) s.classList.remove(order[cur]);
        s.classList.add(next);
      });
      field.appendChild(s);

      // dynamic, scroll-reactive motion params (each shape moves differently)
      const phase = rand(0, Math.PI * 2);
      shapeData.push({
        el: s, baseLeft: spot.x, baseTop: spot.y, size: size,
        speedY: rand(-0.16, 0.16),        // parallax: travels faster/slower than the page
        swayAmp: rand(14, 70),            // horizontal swing amplitude
        swayFreq: rand(0.0010, 0.0042),   // how often it swings as you scroll
        rotSpeed: rand(-0.05, 0.05),      // degrees of spin per pixel scrolled
        phase: phase,
        sway0: Math.sin(phase),           // sway value at scroll 0 (subtracted away)
        ampX: rand(3, 10),                // gentle idle levitation
        ampY: rand(4, 12),
        freq: rand(0.35, 0.85),
      });
    }
  }

  /* scroll-reactive shape motion — called every frame from render() */
  function updateShapes(sy, t) {
    // keep-out zones (viewport coords): clear shapes from behind the hero title and the price
    const zones = [];
    if (heroWords && heroWords.length) {
      let l = Infinity, tp = Infinity, r = -Infinity, bt = -Infinity, any = false;
      for (let k = 0; k < heroWords.length; k++) {
        const b = heroWords[k].getBoundingClientRect();
        if (b.width || b.height) { any = true; l = Math.min(l, b.left); tp = Math.min(tp, b.top); r = Math.max(r, b.right); bt = Math.max(bt, b.bottom); }
      }
      if (any && r > l) zones.push({ x: l - 26, y: tp - 26, w: (r - l) + 52, h: (bt - tp) + 52 });
    }
    if (priceAmountEl) {
      const b = priceAmountEl.getBoundingClientRect();
      if (b.width) zones.push({ x: b.left - 14, y: b.top - 10, w: b.width + 28, h: b.height + 20 });
    }
    // "Created a video for": keep shapes off the centre so they don't blend with the logos
    let cBand = null;
    if (contribSection) {
      const cr = contribSection.getBoundingClientRect();
      const vw = window.innerWidth, cx = vw / 2, half = vw * 0.33;
      cBand = { top: cr.top, bot: cr.bottom, xMin: cx - half, xMax: cx + half };
    }
    for (let i = 0; i < shapeData.length; i++) {
      const s = shapeData[i];
      const py = sy * s.speedY + Math.sin(t * s.freq + s.phase) * s.ampY;
      // subtract the scroll=0 sway value so shapes rest exactly where they were placed
      const px = (Math.sin(sy * s.swayFreq + s.phase) - s.sway0) * s.swayAmp
               + Math.cos(t * s.freq + s.phase) * s.ampX;
      const rot = sy * s.rotSpeed + Math.sin(t * 0.3 + s.phase) * 5;
      // hide the shape while it sits behind a keep-out zone
      const vx = s.baseLeft + px, vy = s.baseTop - sy + py, sz = s.size;
      let hide = false;
      for (let z = 0; z < zones.length; z++) {
        const Z = zones[z];
        if (vx < Z.x + Z.w && vx + sz > Z.x && vy < Z.y + Z.h && vy + sz > Z.y) { hide = true; break; }
      }
      // clear the centre of the contributed section (shapes stay on the sides)
      if (!hide && cBand && vy + sz > cBand.top && vy < cBand.bot) {
        const cxs = vx + sz / 2;
        if (cxs > cBand.xMin && cxs < cBand.xMax) hide = true;
      }
      const el = s.el;
      if (hide && el.style.opacity !== "0") { el.style.opacity = "0"; el.style.pointerEvents = "none"; }
      else if (!hide && el.style.opacity === "0") { el.style.opacity = "1"; el.style.pointerEvents = "auto"; }
      el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`;
    }
  }

  /* ============================================================
     SIX REELS (hero stage)
     ============================================================ */
  const reelEls = [];
  function buildReels() {
    const wrap = document.getElementById("reels");
    REELS.forEach((r, i) => {
      const reel = document.createElement("div");
      reel.className = "reel interactive";
      reel.dataset.index = i;
      reel.style.zIndex = i + 1;                 // stable stacking → no z-fighting flicker while stacked

      const inner = document.createElement("div");
      inner.className = "reel-inner";

      const ifr = document.createElement("iframe");
      // NB: no src yet — reels load LATER (after the showreel), so the showreel gets all the
      // bandwidth first. The URL is kept here and applied by loadReelVideos().
      ifr._vsrc = "https://player.vimeo.com/video/" + r.id +
                "?background=1&autoplay=1&loop=1&muted=1&playsinline=1";
      ifr.setAttribute("frameborder", "0");
      ifr.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
      ifr.setAttribute("tabindex", "-1");
      ifr.setAttribute("aria-hidden", "true");

      const media = document.createElement("div");
      media.className = "media-fill";
      media.appendChild(ifr);

      const play = document.createElement("div");
      play.className = "play";
      play.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="#252525"/></svg>';

      const hit = document.createElement("div");
      hit.className = "reel-hit";

      inner.appendChild(media); inner.appendChild(play); inner.appendChild(hit);
      reel.appendChild(inner);
      wrap.appendChild(reel);

      hit.addEventListener("click", () => openLightbox(r.id, r.tag));
      reelEls.push({ reel, frame: ifr });
    });
  }

  // Load the 9 reel videos AFTER the showreel, staggered so they don't all jam the network at
  // once. Each reel reveals its video only once THAT iframe has loaded (see .ready in CSS) — so
  // on slower machines you see a clean orange gradient until the video is actually ready.
  let reelsLoading = false;
  function loadReelVideos() {
    if (reelsLoading) return;
    reelsLoading = true;
    reelEls.forEach((o, i) => {
      setTimeout(() => {
        if (!o.frame || !o.frame._vsrc) return;
        o.frame.addEventListener("load", () => setTimeout(() => o.reel.classList.add("ready"), 400), { once: true });
        o.frame.src = o.frame._vsrc;
      }, i * 300);                          // 300ms apart → sequential, not a bandwidth spike
    });
  }

  /* ============================================================
     CONTRIBUTED-TO LOGO FIELD
     ============================================================ */
  function buildLogos() {
    const field = document.getElementById("logoField");
    // ┌─ YOUR LOGOS ────────────────────────────────────────────────────────┐
    // │ 1. Put your .svg files in the folder:  assets/logos/                 │
    // │ 2. List their file names below (with .svg). Add / remove lines to    │
    // │    change how many logos appear — the layout adjusts automatically.  │
    // └─────────────────────────────────────────────────────────────────────┘
    const LOGOS = [
      "layerzero.svg", "hyperlane.svg", "succinct.svg", "codex.svg", "doma.svg",
      "soon.svg", "bullpen.svg", "aifinpay.svg", "bulk.svg"
    ];
    // per-logo size tweak (1 = normal). Shrink the ones whose mark reads too big so they
    // match the rest. Tweak these numbers any time to fine-tune a single logo.
    const SCALE = {
      "layerzero.svg": 0.68,
      "bullpen.svg":   0.76,
      "succinct.svg":  0.76
    };
    // click a logo → opens the project's X/Twitter in a new tab. Edit any link here.
    const LINKS = {
      "layerzero.svg": "https://x.com/LayerZero_Core",
      "hyperlane.svg": "https://x.com/hyperlane",
      "succinct.svg":  "https://x.com/SuccinctLabs",
      "codex.svg":     "https://x.com/CodexFX",
      "doma.svg":      "https://x.com/domaprotocol",
      "soon.svg":      "https://x.com/soon_svm",
      "bullpen.svg":   "https://x.com/BullpenFi",
      "aifinpay.svg":  "https://x.com/aifinpay",
      "bulk.svg":      "https://x.com/bulktrade"
    };

    const W = field.clientWidth || 1000;
    const H = field.clientHeight || 340;
    const phone = W < 760;
    const AREA = phone ? 58 * 58 : 100 * 100;   // every logo occupies the SAME visual area
    const R = phone ? 48 : 92;                  // uniform placement radius → even spacing
    const pad = phone ? 4 : 6;
    const placed = [];         // {x,y} centres already taken

    // Best-candidate ("dart throwing") scatter: try several spots, keep the one FARTHEST
    // from all others → organic, evenly-spread, no overlaps.
    LOGOS.forEach((file, i) => {
      let best = null, bestScore = -Infinity;
      for (let k = 0; k < 40; k++) {
        const cx = rand(R + pad, W - R - pad);
        const cy = rand(R + pad, H - R - pad);
        let nearest = Infinity;
        for (const p of placed) {
          const gap = Math.hypot(cx - p.x, cy - p.y) - 2 * R;
          if (gap < nearest) nearest = gap;
        }
        const score = placed.length ? nearest : rand(0, 1);
        if (score > bestScore) { bestScore = score; best = { x: cx, y: cy }; }
      }
      placed.push(best);

      const el = document.createElement("a");
      el.className = "logo interactive";
      const link = LINKS[file];
      if (link) { el.href = link; el.target = "_blank"; el.rel = "noopener noreferrer"; }
      el.style.cursor = link ? "pointer" : "default";
      el.style.setProperty("--t", rand(7, 12).toFixed(1) + "s");
      el.style.setProperty("--lx", rand(9, 18).toFixed(1) + "px");     // ellipse X radius (magnitude)
      el.style.setProperty("--ly", rand(9, 16).toFixed(1) + "px");     // ellipse Y radius (magnitude)
      el.style.setProperty("--lr", rand(3, 7).toFixed(1) + "deg");     // gentle tilt sway
      el.style.animationDelay = "-" + rand(0, 12).toFixed(1) + "s";    // negative → each starts mid-orbit (desynced, never all still)
      el.style.opacity = "0";                     // revealed by the scroll-driven intro
      // centred on its point via CSS transform:translate(-50%,-50%), so left/top are the CENTRE.
      // Size is driven by --w/--h (CSS vars) so the :hover size rule isn't overridden by inline width.
      const cx = best.x, cy = best.y, s0 = Math.sqrt(AREA);
      el.style.left = cx.toFixed(1) + "px"; el.style.top = cy.toFixed(1) + "px";
      el.style.setProperty("--w", s0.toFixed(1) + "px");
      el.style.setProperty("--h", s0.toFixed(1) + "px");

      const img = document.createElement("img");
      img.alt = "";
      // once we know the logo's real aspect, resize the box to the SAME AREA at that aspect
      // → tall, wide and square logos all end up equally prominent. Also set the hover size.
      img.onload = function () {
        const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        const sc = SCALE[file] || 1;
        const w = Math.sqrt(AREA * ar) * sc, h = Math.sqrt(AREA / ar) * sc;
        el.style.setProperty("--w", w.toFixed(1) + "px");
        el.style.setProperty("--h", h.toFixed(1) + "px");
        el.style.setProperty("--hw", (w * 2.1).toFixed(1) + "px");     // hover grows the REAL size (stays crisp)
        el.style.setProperty("--hh", (h * 2.1).toFixed(1) + "px");
      };
      img.src = "assets/logos/" + file;
      el.appendChild(img);
      field.appendChild(el);
    });
  }

  /* ============================================================
     LIGHTBOX
     ============================================================ */
  const lb = document.getElementById("lightbox");
  const lbFrame = document.getElementById("lbFrame");
  function openLightbox(id, tag) {
    lbFrame.src = "https://player.vimeo.com/video/" + id +
                  "?autoplay=1&title=0&byline=0&portrait=0&playsinline=1";
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  // The browser pauses the occluded background videos while the lightbox is open; nudge them
  // back to life on close (Vimeo accepts a "play" command via postMessage — no reload needed).
  function resumeBackgroundVideos() {
    const play = (ifr) => {
      try { if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage('{"method":"play"}', "*"); } catch (e) {}
    };
    reelEls.forEach((o) => play(o.frame));
    play(showreelIframe);
  }
  function closeLightbox() {
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    lbFrame.src = "about:blank";              // stop playback
    document.body.style.overflow = "";
    resumeBackgroundVideos();
    setTimeout(resumeBackgroundVideos, 350);  // again once the overlay is fully gone
  }
  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

  /* ============================================================
     HERO SCROLL CHOREOGRAPHY
     ============================================================ */
  const hero = document.getElementById("hero");
  const stage = document.getElementById("stage");
  const heroText = document.getElementById("heroText");
  const contribSection = document.getElementById("contributed");
  const contribTitle = document.querySelector(".contrib-title");
  const contribTitleInner = contribTitle ? contribTitle.querySelector("span") : null;
  const logoFieldEl = document.getElementById("logoField");

  /* "Created a video for": title fills the screen, then shrinks to size as you
     scroll while the logos pop into place one after another */
  function updateContributed() {
    if (!contribSection || !contribTitle) return;
    const vh = window.innerHeight;
    const r = contribSection.getBoundingClientRect();
    const total = contribSection.offsetHeight - vh;       // distance the panel stays pinned
    let p = total > 0 ? (-r.top) / total : (r.top <= 0 ? 1 : 0);
    p = Math.max(0, Math.min(1, p));
    // title: fills the screen width, then shrinks to normal — never past the edges
    // title is rendered large (240px) and only ever scaled DOWN, so it never
    // pixelates when big. It fills the width, then shrinks to normal size.
    const s = smoothstep(0, 0.55, p);
    if (contribTitleInner) {
      const BASE = 240;
      const natW = contribTitleInner.offsetWidth || 1;      // measured at the 240px base
      const vw = window.innerWidth;
      const fillScale = Math.min(1, (vw * 0.9) / natW);      // fill width, never upscale
      const normalScale = Math.min(92, vw * 0.072) / BASE;  // normal on-page size
      const ts = lerp(fillScale, normalScale, s);
      const ty = lerp(0, -235, s);                          // rise above the logos as it shrinks
      contribTitleInner.style.transform = `translateY(${ty.toFixed(1)}px) scale(${ts.toFixed(4)})`;
    }
    // logos pop in (fade + un-blur), staggered — spread across the scroll so
    // every logo (any count) fully lands before the panel unpins
    const logos = logoFieldEl ? logoFieldEl.children : [];
    const n = logos.length;
    for (let i = 0; i < n; i++) {
      const st = 0.42 + 0.30 * (n > 1 ? i / (n - 1) : 0);
      const lp = smoothstep(st, st + 0.18, p);
      logos[i].style.opacity = lp.toFixed(3);
      logos[i].style.filter = lp > 0.99 ? "none" : `blur(${((1 - lp) * 9).toFixed(1)}px)`;
    }
  }
  const showreel = document.getElementById("showreelMain");
  const showreelMedia = showreel ? showreel.querySelector(".media-fill") : null;
  const showreelIframe = showreelMedia ? showreelMedia.querySelector("iframe") : null;
  const heroWords = heroText ? heroText.querySelectorAll(".word") : [];
  let heroWordsSettled = false;
  // pin every letter to its final visible state (inline > CSS transition, so it can't be lost)
  function lockHeroWords() {
    if (!heroText) return;
    heroText.classList.add("in");
    const letters = heroText.querySelectorAll(".word .w");
    for (let i = 0; i < letters.length; i++) {
      letters[i].style.opacity = "1";
      letters[i].style.transform = "translateY(0)";
      letters[i].style.transition = "none";
    }
  }
  const priceAmountEl = document.getElementById("priceAmount");
  const scrollHint = document.getElementById("scrollHint");
  const splitHint = document.getElementById("splitHint");

  let lastP = -1;
  let introStart = 0;                                   // set on init
  let interacted = false;                               // true after real user input
  function render() {
    const rect = hero.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    // If the denominator is 0/negative (a transient layout state — e.g. mid-resize, or the
    // mobile URL bar changing the viewport), -rect.top/total is NaN/Infinity. Writing NaN into
    // a style makes the browser IGNORE it and keep the previous value → the hero title stayed
    // invisible and the showreel froze mid-animation. Fall back to the last good progress.
    let p = total > 0 ? clamp(-rect.top / total, 0, 1) : (rect.top >= 0 ? 0 : 1);
    if (!isFinite(p)) p = (lastP >= 0 && isFinite(lastP)) ? lastP : 0;

    // page-open fade-in: smooth & gentle. Video eases in first, text follows.
    // Once the user actually interacts, the entrance is "done" and never hides text again.
    const elapsed = performance.now() - introStart;
    const smootherstep = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
    const introVideo = interacted ? 1 : smootherstep(elapsed / 1800);            // ~1.8s
    const introText  = interacted ? 1 : smootherstep((elapsed - 350) / 1800);    // starts 0.35s later

    // stage dimensions (used for aspect-fitting the showreel + reels)
    const sW = stage.clientWidth || window.innerWidth;
    const sH = stage.clientHeight || window.innerHeight;

    // showreel grow (enter -> fullscreen). Reaches full by p≈0.34, then HOLDS (scroll stop)
    // The frame goes edge-to-edge; the iframe is oversized to the video's aspect so the
    // video COVERS the frame (Vimeo's own fill letterboxes on wide screens, so we force it).
    const grow = smoothstep(0.10, 0.34, p);
    const srRect = lerpRect(ENTER, SR_FULL, easeInOut(grow));
    applyRect(showreel, srRect);
    const srRadius = (12 * (1 - grow)).toFixed(1) + "px";
    showreel.style.borderRadius = srRadius;
    if (showreelMedia) {
      showreelMedia.style.borderRadius = srRadius;
      showreelMedia.style.clipPath = "inset(0 round " + srRadius + ")";
    }
    if (showreelIframe) {
      const fw = (srRect.w / 100) * sW, fh = (srRect.h / 100) * sH;
      const arS = showreelAR || DEFAULT_AR;
      const k = coverBox(fw, fh, arS).w / coverBox(sW, sH, arS).w;   // ≤1 → downscale, stays crisp
      showreelIframe.style.transform = "translate(-50%,-50%) scale(" + k.toFixed(4) + ")";
    }

    // title: rises upward and fades out gently AS the showreel begins (smooth crossfade)
    const rise = smoothstep(0, 0.18, p);
    const titleTop = lerp(50, 8, rise);                     // % : screen-center → top edge
    const textVis = 1 - smoothstep(0.05, 0.20, p);          // gentle fade, gone by p≈0.20
    const textScale = 1 - 0.35 * rise;                      // slight shrink while rising
    heroText.style.top = titleTop + "%";
    heroText.style.opacity = textVis;
    heroText.style.transform = `translate(-50%, -50%) scale(${textScale})`;
    // safety net: if we're back at the top and the entrance is long done, make sure the letters
    // really are visible (a dropped compositor layer used to leave them stuck at opacity:0)
    if (heroWordsSettled && p < 0.05) lockHeroWords();

    // showreel fades in, holds fullscreen 0.34–0.54 (STOP), then crossfades into the six reels
    const reelsIn = smoothstep(0.52, 0.58, p);
    const srAppear = smoothstep(0.12, 0.30, p);
    showreel.style.opacity = srAppear * (1 - reelsIn) * introVideo;
    showreel.style.visibility = (srAppear < 0.01 || reelsIn > 0.98) ? "hidden" : "visible";

    // scatter the six reels (0.54 → 0.86), then HOLD scattered 0.86–1.0 (STOP)
    const t = performance.now() / 1000;
    reelEls.forEach((o, i) => {
      const qi = easeInOut(smoothstep(0.54 + i * 0.012, 0.86, p));
      const arI = reelAR[i] || DEFAULT_AR;
      // The reel is LAID OUT once at its final tile (see layoutReels). We animate it from the
      // fullscreen start to that tile purely with transform (translate + scale) — GPU-composited,
      // so there is NO per-frame layout repaint. That repaint gap was the Safari "blink" where
      // the background flashed through for a frame.
      const tile = o.tileRect || fitByArea(SCATTER[i], arI, sW, sH);
      const cur  = lerpRect(SR_FULL, tile, qi);
      const sx = tile.w > 0 ? cur.w / tile.w : 1;
      const sy = tile.h > 0 ? cur.h / tile.h : 1;
      const tcx = tile.l + tile.w / 2, tcy = tile.t + tile.h / 2;   // laid-out centre (%)
      const ccx = cur.l + cur.w / 2,  ccy = cur.t + cur.h / 2;      // where it should appear (%)
      const tx = ((ccx - tcx) / 100) * sW;                         // → px
      const ty = ((ccy - tcy) / 100) * sH;
      // gentle chaotic float + tilt once scattered (still levitating)
      const amp = 10 * qi;
      const fx = Math.sin(t * 0.7 + i * 1.3) * amp;
      const fy = Math.cos(t * 0.6 + i * 2.1) * amp;
      const ang = REEL_ANGLES[i] || 0;
      const rot = (ang + Math.sin(t * 0.5 + i * 1.7) * 1.6) * qi;   // tilt eases in, then sways
      o.reel.style.transform =
        `translate(${(tx + fx).toFixed(2)}px, ${(ty + fy).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) rotate(${rot.toFixed(2)}deg)`;
      o.reel.style.opacity = reelsIn;
    });

    // enable interaction as soon as the reels have separated
    stage.classList.toggle("live", p > 0.87);

    // dynamic, scroll-reactive background shapes
    updateShapes(window.scrollY || window.pageYOffset || 0, t);

    // "Created a video for" title-shrink + logo pop intro
    updateContributed();

    // scroll hint
    scrollHint.style.opacity = (1 - smoothstep(0.02, 0.12, p)).toFixed(3);
    if (splitHint) {
      // visible while the video is fullscreen and starting to split (so it doesn't look
      // like a glitch); fades away with blur+opacity once you scroll into the scatter
      const on = smoothstep(0.34, 0.44, p) * (1 - smoothstep(0.58, 0.70, p));
      splitHint.style.opacity = on.toFixed(3);
      splitHint.style.filter = on > 0.99 ? "none" : "blur(" + ((1 - on) * 8).toFixed(1) + "px)";
      splitHint.style.transform = "translateX(-50%) translateY(" + ((1 - on) * 12).toFixed(1) + "px)";
    }

    lastP = p;
    ticking = false;
  }

  let ticking = false;
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(render); }
  }

  // continuous rAF so the float animation keeps moving when scattered
  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  /* Vimeo background iframes autoplay/loop on their own — nothing to manage */
  function manageShowreel() {}

  /* ============================================================
     INIT
     ============================================================ */
  /* keep the (enlarged) title from exceeding the showreel width; only scales down if needed */
  function fitHeroText() {
    const ht = document.getElementById("heroText");
    const l2 = document.querySelector(".line2");
    const sr = document.getElementById("showreelMain");
    if (!ht || !l2 || !sr) return;
    ht.style.setProperty("--tscale", "1");
    const range = document.createRange();
    range.selectNodeContents(l2);
    const tw = range.getBoundingClientRect().width || 1;
    // fit the (nowrap) line inside the box's CONTENT width — overflowing it is what made the
    // title look shifted on phones
    const target = (ht.clientWidth || window.innerWidth) * 0.98;
    const ratio = tw > target ? target / tw : 1;
    ht.style.setProperty("--tscale", ratio.toFixed(3));
  }

  /* size the giant price amount to nearly fill the screen width */
  function fitPrice() {
    const a = document.getElementById("priceAmount");
    if (!a) return;
    const base = 120;
    a.style.fontSize = base + "px";
    const w = a.getBoundingClientRect().width || 1;
    const target = Math.min(window.innerWidth * 0.92, 1200);  // ~92vw, capped
    let size = base * (target / w);
    size = Math.max(40, Math.min(size, 380));
    a.style.fontSize = size + "px";
  }

  /* count $90.00 → $99.99 when the price scrolls into view, then reveal the caption word-by-word */
  function setupPriceCounter() {
    const amount = document.getElementById("priceAmount");
    const caption = document.getElementById("priceCaption");
    if (!amount) return;
    let started = false;
    const run = () => {
      if (started) return; started = true;
      const start = 90, end = 99.99, dur = 1600, t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        amount.textContent = "$" + (start + (end - start) * ease(k)).toFixed(2);
        if (k < 1) requestAnimationFrame(step);
        else { amount.textContent = "$99.99"; if (caption) caption.classList.add("in"); }
      };
      requestAnimationFrame(step);
    };
    if (!("IntersectionObserver" in window)) { run(); return; }
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => { if (e.isIntersecting) { run(); io.disconnect(); } });
    }, { threshold: 0.45 });
    io.observe(amount);
  }

  /* reveal elements (blur + fade + rise) as they scroll into view */
  function setupReveals() {
    const els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => { e.classList.add("in"); e.classList.add("settled"); });
      return;
    }
    // reveal, then once the blur transition finishes drop the GPU layer so the
    // element re-rasterizes crisp (kills the random pixelation on the cards)
    const reveal = (el) => {
      el.classList.add("in");
      const settle = (ev) => {
        if (ev && ev.propertyName !== "filter") return;
        el.classList.add("settled");
        el.removeEventListener("transitionend", settle);
      };
      el.addEventListener("transitionend", settle);
      // fallback in case transitionend never fires (e.g. reduced-motion)
      setTimeout(() => settle(), 1600);
    };
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        if (el.classList.contains("plan")) {
          // reveal the pricing cards one by one (bottom-up rise + un-blur)
          const idx = Array.prototype.indexOf.call(el.parentNode.children, el);
          setTimeout(() => reveal(el), idx * 160);
        } else {
          reveal(el);
        }
        io.unobserve(el);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
  }

  function init() {
    const safe = (fn) => { try { fn(); } catch (e) { console.warn("init step failed:", e); } };
    // Discord has no profile URL for usernames — clicking copies the handle instead
    const dTab = document.getElementById("discordTab");
    if (dTab) {
      dTab.addEventListener("click", (e) => {
        e.preventDefault();
        const user = dTab.dataset.user || "";
        const label = dTab.querySelector(".tab-label");
        const done = () => {
          if (!label || label.dataset.busy) return;
          label.dataset.busy = "1";
          const old = label.textContent;
          label.textContent = "Copied!";
          setTimeout(() => { label.textContent = old; delete label.dataset.busy; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(user).then(done).catch(done);
        } else {
          const ta = document.createElement("textarea");
          ta.value = user; document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); } catch (err) {}
          ta.remove(); done();
        }
      });
    }
    safe(buildReels);
    safe(sizeBaseIframes);
    safe(layoutReels);
    safe(loadReelAspects);
    // showreel first: load the reels only once the showreel's player is up (it gets the bandwidth
    // first). Fallbacks: also start on first scroll toward the section, and after 6s no matter what.
    if (showreelIframe) {
      showreelIframe.addEventListener("load", () => setTimeout(loadReelVideos, 900), { once: true });
    } else {
      setTimeout(loadReelVideos, 1200);
    }
    window.addEventListener("scroll", function onFirstScroll() {
      if ((window.scrollY || 0) > window.innerHeight * 0.4) { loadReelVideos(); window.removeEventListener("scroll", onFirstScroll); }
    }, { passive: true });
    setTimeout(loadReelVideos, 6000);
    safe(buildLogos);
    safe(buildShapes);                          // after content so page height is known
    safe(setupReveals);
    safe(fitPrice);
    safe(fitHeroText);
    safe(setupPriceCounter);
    safe(() => { const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear(); });

    window.scrollTo(0, 0);                      // open at the beginning
    introStart = performance.now();             // begin page-open fade-in
    render();                                   // scroll engine — must always run
    requestAnimationFrame(loop);

    // play the entrance: words rise in + shapes fade in, simultaneously
    requestAnimationFrame(() => requestAnimationFrame(() => {
      heroText.classList.add("in");
      const sf = document.getElementById("bg-shapes");
      if (sf) sf.classList.add("in");
    }));
    // Once the entrance has finished, LOCK the words visible with inline styles and drop the
    // layer promotion. The letters used to rely purely on a one-shot CSS transition, so if the
    // compositor dropped/re-created the layer (Safari does this after long scrolls) they could
    // stay invisible forever — that was the "title gone when I scroll back up" bug.
    setTimeout(() => {
      heroWordsSettled = true;
      lockHeroWords();
      heroText.style.willChange = "auto";
    }, 2600);

    window.addEventListener("scroll", manageShowreel, { passive: true });

    // genuine user input ends the entrance (programmatic scrollTo does NOT fire these)
    const markInteract = () => { interacted = true; };
    window.addEventListener("wheel", markInteract, { passive: true });
    window.addEventListener("touchmove", markInteract, { passive: true });
    window.addEventListener("keydown", markInteract);
    window.addEventListener("pointerdown", markInteract);

    let rz;
    window.addEventListener("resize", () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        const field = document.getElementById("logoField");
        if (field) { field.innerHTML = ""; safe(buildLogos); }
        safe(sizeBaseIframes);
        safe(layoutReels);
        safe(buildShapes);
        safe(fitPrice);
        safe(fitHeroText);
      }, 150);
    });
    // recompute after everything (videos/fonts) has settled; stay at top on first load
    window.addEventListener("load", () => {
      if (!interacted) window.scrollTo(0, 0);
      safe(buildShapes); safe(fitPrice); safe(fitHeroText);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { safe(fitHeroText); safe(fitPrice); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();

/* ============================================================
   CUSTOM CURSOR — stylized arrow + trailing cube particles
   (fine pointers only; no cubes when idle)
   ============================================================ */
(function () {
  if (!window.matchMedia || !matchMedia("(hover:hover) and (pointer:fine)").matches) return;
  const arrow = document.getElementById("cursorArrow");
  if (!arrow) return;
  const html = document.documentElement;
  html.classList.add("has-cursor");

  let lastX = null, lastY = null, acc = 0, step = 9, active = 0;
  const MAX_CUBES = 70;

  function spawnCube(x, y) {
    if (active >= MAX_CUBES) return;
    const size = 4 + Math.random() * 6;                 // 4–10px
    const ox = (Math.random() - 0.5) * 12;              // organic offset off the path
    const oy = (Math.random() - 0.5) * 12;
    const outX = (Math.random() - 0.5) * 40;            // drift outward
    const dy = 16 + Math.random() * 34;                 // drift downward
    const startRot = Math.random() * 44 - 22;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 130); // slow rotation
    const life = 620 + Math.random() * 560;

    const c = document.createElement("div");
    c.className = "trail-cube";
    c.style.width = c.style.height = size.toFixed(1) + "px";
    c.style.left = (x + ox) + "px";
    c.style.top = (y + oy) + "px";
    document.body.appendChild(c);
    active++;

    const anim = c.animate([
      { transform: `translate(-50%,-50%) rotate(${startRot}deg) scale(1)`, opacity: 0.92 },
      { transform: `translate(calc(-50% + ${outX}px), calc(-50% + ${dy}px)) rotate(${startRot + spin}deg) scale(0.8)`, opacity: 0 }
    ], { duration: life, easing: "cubic-bezier(.2,.55,.3,1)", fill: "forwards" });
    anim.onfinish = () => { c.remove(); active--; };
    anim.oncancel = () => { active--; };
  }

  addEventListener("mousemove", (e) => {
    const x = e.clientX, y = e.clientY;
    arrow.style.transform = `translate(${x}px, ${y}px)`;
    if (lastX !== null) {
      acc += Math.hypot(x - lastX, y - lastY);          // more distance ⇒ more cubes ⇒ faster = denser
      let guard = 0;
      while (acc >= step && guard < 6) {                 // cap per event so big jumps don't flood
        spawnCube(x + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 4);
        acc -= step;
        step = 7 + Math.random() * 8;                    // jittered spacing = organic
        guard++;
      }
    }
    lastX = x; lastY = y;
  }, { passive: true });

  document.addEventListener("mouseleave", () => { arrow.style.opacity = "0"; });
  document.addEventListener("mouseenter", () => { arrow.style.opacity = "1"; });
})();
