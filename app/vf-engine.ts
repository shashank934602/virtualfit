import {
  CATEGORIES,
  DEFAULT_MODEL,
  brightMatrix,
  garmentLook,
  personBaseLook,
  personLook,
  tintMatrix,
  type AddPayload,
  type Category,
  type Item,
  type Look,
} from "./vf-data";

const EASE = "cubic-bezier(.2,.8,.2,1)";
const SCAN_EASE = "cubic-bezier(.65,0,.35,1)";
const mod = (n: number, m: number) => ((n % m) + m) % m;

export type EngineApi = {
  destroy: () => void;
  /** Show a different person; re-scans the current outfit onto them. */
  setModel: (id: string) => void;
  /** Select a size chip on the buy card. Returns false if this category has no such size. */
  setSize: (s: string) => boolean;
};

/**
 * Vanilla-JS engine for the arc, category switching, try-on scan, buy card,
 * cursor and input. Works on the static markup rendered by <Scene/>.
 */
export function mount(root: HTMLElement, onAdd: (p: AddPayload) => void): EngineApi {
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
  const qa = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));

  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const docEl = document.documentElement;

  const room = q(".room");
  const ghost = q(".ghost");
  const letters = qa(".ghost span");
  const stage = q(".stage");
  const cards = qa(".card");
  const N = cards.length;
  const HALF = N / 2;
  const mCur = q("#mCur");
  const mNext = q("#mNext");
  const grid = q(".model .grid");
  const scan = q(".model .scan");
  const cur = q(".cur");
  const tabs = qa(".tabs button");
  const pill = q(".tabs .pill");
  const thumbG = q(".buy .thumb i");
  const lnName = q(".buy .name");
  const lnPrice = q(".buy .price");
  const lnColor = q(".buy .clab");
  const dots = q(".buy .dots");
  const chipsEl = q(".buy .chips");
  const addBtn = q(".buy .add");
  const lnAdd = q(".buy .add .ln");

  /* ── Layout metrics ── */
  let W = 0, H = 0;
  let XS: number[] = [];
  function measure() {
    W = innerWidth;
    H = innerHeight;
    const phone = W < 768;
    XS = (phone ? [0, 0.36, 0.5, 0.56, 0.6, 0.62] : [0, 0.215, 0.345, 0.432, 0.49, 0.52]).map((v) => v * W);
    const CW = phone ? Math.min(0.3 * W, 170) : Math.min(0.148 * W, 0.33 * H);
    docEl.style.setProperty("--CW", `${CW}px`);
  }
  function xAt(a: number) {
    const i = Math.floor(a);
    if (i >= XS.length - 1) return XS[XS.length - 1];
    return XS[i] + (XS[i + 1] - XS[i]) * (a - i);
  }

  /* ── State ── */
  let ci = 0; // current category index
  const cat = (): Category => CATEGORIES[ci];
  const items = (): Item[] => cat().items;

  let pos = 0;
  let target = 0;
  let intro = reduced ? 1 : 0;
  let fade = 1; // arc opacity multiplier used while switching category
  let swapTo: number | null = null; // category waiting to be swapped in
  let shown = -1; // item index currently tried on
  let person = DEFAULT_MODEL; // who is wearing the clothes
  let buyKey = ""; // `${category}:${item}` shown on the buy card
  let buyIdx = 0;
  let buyK = 0; // selected colour index on the buy card
  let px = 0, py = 0; // raw pointer offsets [-.5,.5]
  let sx = 0, sy = 0; // smoothed
  let mx = innerWidth / 2, my = innerHeight / 2; // cursor target
  let cx = mx, cy = my; // cursor position
  let raf = 0;
  let addTimer = 0;
  let anims: Animation[] = [];
  const flights: Animation[] = [];
  const seeds = cards.map((_, i) => i * 2.39 + 0.7);

  type Drag = { id: number; x0: number; p0: number; lx: number; lt: number; v: number; moved: boolean; card: HTMLElement | null };
  let drag: Drag | null = null;

  /* ── Painting helpers ── */
  function paint(el: HTMLElement, l: Look) {
    el.style.backgroundImage = l.image;
    el.style.backgroundSize = l.size;
    el.style.backgroundPosition = l.position;
  }

  /** Recolour `el` through filter `fid` to colour k of item `it`. */
  function applyTint(el: HTMLElement, fid: string, it: Item, k: number) {
    if (k <= 0) {
      el.style.filter = "";
      return;
    }
    const f = document.getElementById(fid);
    f?.querySelector("[data-tint]")?.setAttribute("values", tintMatrix(it, k));
    f?.querySelector("[data-bright]")?.setAttribute("values", brightMatrix(it));
    el.style.filter = `url(#${fid})`;
  }

  /** Fill the 10 arc cards with the current category (two copies of 5). */
  function paintCards() {
    const c = cat();
    cards.forEach((card, i) => {
      const it = c.items[i % c.items.length];
      paint(card.querySelector<HTMLElement>(".g")!, garmentLook(c, it));
      card.querySelector(".nm")!.textContent = it.n;
      card.querySelector(".pr")!.textContent = `$${it.p}`;
      card.setAttribute("aria-label", `Try on ${it.n}`);
    });
  }

  /* ── Rolling text ── */
  function roll(ln: HTMLElement, text: string) {
    const old = ln.lastElementChild as HTMLElement | null;
    if (old && old.textContent === text) return;
    const s = document.createElement("span");
    s.textContent = text;
    if (!old || reduced) {
      ln.replaceChildren(s);
      return;
    }
    Array.from(ln.children).forEach((c) => c !== old && c.remove());
    ln.appendChild(s);
    const out = old.animate([{ transform: "translateY(0)" }, { transform: "translateY(-110%)" }], { duration: 620, easing: EASE, fill: "forwards" });
    out.onfinish = () => old.remove();
    s.animate([{ transform: "translateY(110%)" }, { transform: "translateY(0)" }], { duration: 620, easing: EASE });
  }

  /* ── Buy card ── */
  function buildDots(it: Item) {
    const btns = it.c.map(([name, hex], k) => {
      const b = document.createElement("button");
      b.className = "sw" + (k === 0 ? " on" : "");
      b.dataset.k = String(k);
      b.style.background = hex;
      b.setAttribute("aria-label", name);
      b.addEventListener("click", () => {
        if (k === buyK) return;
        buyK = k;
        dots.querySelectorAll(".sw").forEach((d) => d.classList.toggle("on", d === b));
        roll(lnColor, `Color · ${name}`);
        applyTint(thumbG, "vf-tt", it, k);
        tryOn(buyIdx, k); // re-scan the model in the new colour
      });
      return b;
    });
    dots.replaceChildren(...btns);
  }

  function buildChips(c: Category) {
    const btns = c.sizes.map((s) => {
      const b = document.createElement("button");
      b.className = "chip" + (s === c.defaultSize ? " on" : "") + (s.length > 3 ? " wide" : "");
      b.textContent = s;
      b.addEventListener("click", () => setSize(s));
      return b;
    });
    chipsEl.replaceChildren(...btns);
  }

  function setSize(s: string) {
    const chips = Array.from(chipsEl.children) as HTMLElement[];
    if (!chips.some((c) => c.textContent === s)) return false;
    chips.forEach((c) => c.classList.toggle("on", c.textContent === s));
    return true;
  }

  function updateBuy(idx: number) {
    const key = `${ci}:${idx}`;
    if (key === buyKey) return;
    const catChanged = !buyKey.startsWith(`${ci}:`);
    buyKey = key;
    buyIdx = idx;
    buyK = 0;
    const c = cat();
    const it = c.items[idx];
    roll(lnName, it.n);
    roll(lnPrice, `$${it.p}`);
    paint(thumbG, garmentLook(c, it));
    applyTint(thumbG, "vf-tt", it, 0);
    if (!reduced) {
      thumbG.animate([{ transform: "translateY(70%) scale(.8)" }, { transform: "translateY(0) scale(1)" }], { duration: 650, easing: EASE });
    }
    buildDots(it);
    if (catChanged) buildChips(c);
    roll(lnColor, `Color · ${it.c[0][0]}`);
  }

  addBtn.addEventListener(
    "click",
    () => {
      if (!buyKey) return;
      const it = items()[buyIdx];
      const size = chipsEl.querySelector(".chip.on")?.textContent ?? cat().defaultSize;
      const k = buyK;
      onAdd({ cat: cat().id, idx: buyIdx, size, color: it.c[k][0], hex: it.c[k][1] });
      flyToBag();
      roll(lnAdd, "Added ✓");
      clearTimeout(addTimer);
      addTimer = window.setTimeout(() => roll(lnAdd, "Add to bag"), 1400);
    },
    sig,
  );

  /** A thumbnail copy arcs from the buy card into the rail's bag button. */
  function flyToBag() {
    const bagBtn = document.querySelector<HTMLElement>(".rail [data-bag]");
    if (reduced || !bagBtn) return;
    const a = thumbG.getBoundingClientRect();
    const b = bagBtn.getBoundingClientRect();
    const fly = document.createElement("div");
    fly.className = "fly";
    Object.assign(fly.style, {
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
      backgroundImage: thumbG.style.backgroundImage,
      backgroundSize: thumbG.style.backgroundSize,
      backgroundPosition: thumbG.style.backgroundPosition,
      filter: thumbG.style.filter,
    });
    document.body.appendChild(fly);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = fly.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 90}px) scale(.85)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px,${dy}px) scale(.22)`, opacity: 0.15 },
      ],
      { duration: 760, easing: "cubic-bezier(.45,0,.25,1)" },
    );
    anim.onfinish = anim.oncancel = () => fly.remove();
    flights.push(anim);
  }

  /* ── Try-on scan ── */
  function setCur(look: Look, it: Item, k: number) {
    paint(mCur, look);
    applyTint(mCur, "vf-tc", it, k);
    mCur.style.visibility = "visible";
  }
  function cancelAnims() {
    anims.forEach((a) => a.cancel());
    anims = [];
  }
  function tryOn(idx: number, k = 0) {
    shown = idx;
    updateBuy(idx);
    const look = personLook(person, cat(), idx);
    if (!look) return; // no try-on photo for this item (e.g. shoes): keep the current outfit
    scanTo(look, items()[idx], k);
  }

  /** Switch person: their photo in the current item, else their base outfit. */
  function setModel(id: string) {
    if (id === person) return;
    person = id;
    if (shown < 0) return; // first try-on hasn't happened yet; it will use this person
    const own = personLook(person, cat(), shown);
    scanTo(own ?? personBaseLook(person), items()[shown], own ? buyK : 0);
  }

  /** Sweep the scan line down the model, revealing `look` (recoloured to colour k). */
  function scanTo(look: Look, it: Item, k: number) {
    cancelAnims();
    paint(mNext, look);
    applyTint(mNext, "vf-tn", it, k);
    if (reduced) {
      setCur(look, it, k);
      return;
    }
    const clip = mNext.animate(
      [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }],
      { duration: 950, easing: SCAN_EASE, fill: "forwards" },
    );
    const g = grid.animate(
      [
        { clipPath: "inset(0 0 100% 0)" },
        { clipPath: "inset(0 0 0 0)", offset: 0.5 },
        { clipPath: "inset(100% 0 0 0)" },
      ],
      { duration: 1092, easing: SCAN_EASE },
    );
    const sc = scan.animate(
      [
        { top: "0%", transform: "scaleX(.2)", opacity: 0 },
        { top: "6%", transform: "scaleX(1)", opacity: 1, offset: 0.08 },
        { top: "94%", transform: "scaleX(1)", opacity: 1, offset: 0.92 },
        { top: "100%", transform: "scaleX(.2)", opacity: 0 },
      ],
      { duration: 950, easing: SCAN_EASE },
    );
    const settle = mNext.animate([{ transform: "scale(1.012)" }, { transform: "scale(1)" }], { duration: 1250, easing: "ease-out" });
    anims = [clip, g, sc, settle];
    clip.onfinish = () => {
      setCur(look, it, k);
      cancelAnims();
    };
  }

  /* ── Category switching ── */
  function swapCategory(next: number) {
    ci = next;
    paintCards();
    shown = -1; // force a try-on when the arc settles
  }
  function switchCategory(next: number) {
    if (next === ci && swapTo === null) return;
    target = Math.round(target) + HALF; // a full lap while the products change
    if (reduced) swapCategory(next);
    else swapTo = next;
  }

  /* ── Tabs pill ── */
  function placePill(b: HTMLElement, instant = false) {
    if (instant) pill.style.transition = "none";
    pill.style.width = `${b.offsetWidth}px`;
    pill.style.transform = `translateX(${b.offsetLeft}px)`;
    if (instant) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }
  const activeTab = () => tabs.find((t) => t.classList.contains("on")) ?? tabs[0];

  /* ── Cursor ── */
  function cursorState() {
    let st = "";
    if (drag?.moved) st = "drag";
    else {
      const el = document.elementFromPoint(mx, my);
      if (el) {
        if (el.closest(".card")) st = "try";
        else if (el.closest("button")) st = "btn";
        else if (el.closest(".stage")) st = "drag";
      }
    }
    cur.classList.toggle("try", st === "try");
    cur.classList.toggle("drag", st === "drag");
    cur.classList.toggle("btn", st === "btn");
  }

  /* ── Frame loop ── */
  function frame(now: number) {
    const t = now / 1000;

    if (!drag) pos = reduced ? target : pos + (target - pos) * 0.11;
    if (intro < 1) intro = Math.min(1, intro + 0.012);
    const ie = 1 - Math.pow(1 - intro, 3);

    // category swap: fade the arc out, change the products, fade back in
    if (swapTo !== null) {
      fade = Math.max(0, fade - 0.09);
      if (fade === 0) {
        swapCategory(swapTo);
        swapTo = null;
      }
    } else if (fade < 1) fade = Math.min(1, fade + 0.05);

    sx += (px - sx) * 0.06;
    sy += (py - sy) * 0.06;

    for (let i = 0; i < N; i++) {
      const c = cards[i];
      const u = mod(i - pos + HALF, N) - HALF;
      const a = Math.abs(u);
      const sg = Math.sign(u);

      let s: number, z: number, o: number, ry: number;
      let blur = 0;
      if (a < 1) {
        s = 0.55 + 0.45 * a;
        z = -260 * (1 - a);
        o = a;
        ry = -sg * 16 * a;
      } else {
        s = 1 / (1 + 0.3 * Math.pow(a - 1, 1.15));
        z = -110 * (a - 1);
        o = 1;
        ry = -sg * (16 + 9 * Math.min(2, a - 1));
        blur = Math.max(0, a - 1.6) * 2.4;
      }
      if (a > 3.4) o = 1 - (a - 3.4) / 0.8;
      o = Math.max(0, Math.min(1, o)) * ie * fade;

      const bob = reduced ? 0 : Math.sin(t * 1.1 + seeds[i]) * H * 0.006 * Math.min(1, a);
      const y = bob - (1 - s) * H * 0.04;
      ry += sx * 10;
      const x = sg * xAt(a) * ie;

      c.style.transform =
        `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) perspective(1300px) translateZ(${z.toFixed(2)}px) ` +
        `rotateY(${ry.toFixed(3)}deg) rotateX(${(-sy * 6).toFixed(3)}deg) scale(${(s * (0.6 + 0.4 * ie) * (0.9 + 0.1 * fade)).toFixed(4)})`;
      c.style.opacity = o.toFixed(3);
      c.style.visibility = o < 0.01 ? "hidden" : "visible";
      c.style.zIndex = String(a < 1 ? 1 : Math.round(100 - 10 * a));
      c.style.filter = blur > 0 ? `blur(${blur.toFixed(2)}px)` : "none";
    }

    room.style.transform = `translate3d(${(-sx * 22).toFixed(2)}px,${(-sy * 14).toFixed(2)}px,0) scale(${(1.08 - 0.03 * ie).toFixed(4)})`;
    ghost.style.transform = `translate(calc(-50% - ${(sx * 40).toFixed(2)}px), ${(-sy * 16).toFixed(2)}px)`;
    letters.forEach((l, i) => {
      l.style.transform = `translateY(${((1 - ie) * (60 + 30 * i)).toFixed(2)}px)`;
    });

    if (fine) {
      cx += (mx - cx) * 0.22;
      cy += (my - cy) * 0.22;
      cur.style.transform = `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0)`;
      cursorState();
    }

    if (!drag && swapTo === null && Math.abs(target - pos) < 0.02) {
      const idx = mod(Math.round(target), items().length);
      if (idx !== shown) tryOn(idx);
    }

    raf = requestAnimationFrame(frame);
  }

  /* ── Input ── */
  const step = (d: number) => {
    target = Math.round(target) + d;
  };

  addEventListener(
    "pointermove",
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      px = e.clientX / W - 0.5;
      py = e.clientY / H - 0.5;
      if (fine && e.pointerType === "mouse") cur.classList.add("show");
    },
    sig,
  );
  docEl.addEventListener("mouseleave", () => cur.classList.remove("show"), sig);

  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      const now = performance.now();
      drag = {
        id: e.pointerId,
        x0: e.clientX,
        p0: pos,
        lx: e.clientX,
        lt: now,
        v: 0,
        moved: false,
        card: (e.target as HTMLElement).closest<HTMLElement>(".card"),
      };
      stage.setPointerCapture(e.pointerId);
      cur.classList.add("down");
    },
    sig,
  );
  stage.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) > 6) {
        drag.moved = true;
        cur.classList.remove("down");
      }
      pos = drag.p0 - dx / XS[1];
      const now = performance.now();
      const dt = now - drag.lt;
      if (dt > 0) {
        drag.v = drag.v * 0.6 + ((e.clientX - drag.lx) / dt) * 0.4;
        drag.lx = e.clientX;
        drag.lt = now;
      }
    },
    sig,
  );
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    cur.classList.remove("down");
    if (d.moved) {
      const flick = performance.now() - d.lt > 90 ? 0 : d.v;
      target = Math.round(pos - flick * 3.2);
    } else if (d.card) {
      const i = Number(d.card.dataset.i);
      const u = mod(i - pos + HALF, N) - HALF;
      target = Math.round(pos + u);
    }
  };
  stage.addEventListener("pointerup", endDrag, sig);
  stage.addEventListener("pointercancel", endDrag, sig);

  let wAcc = 0;
  let wLast = 0;
  addEventListener(
    "wheel",
    (e) => {
      // let the side panels scroll normally
      if ((e.target as Element | null)?.closest?.(".panel")) return;
      e.preventDefault();
      wAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const now = performance.now();
      if (Math.abs(wAcc) > 60 && now - wLast >= 260) {
        step(Math.sign(wAcc));
        wAcc = 0;
        wLast = now;
      }
    },
    { passive: false, signal: ac.signal },
  );

  addEventListener(
    "keydown",
    (e) => {
      // don't hijack arrows while a slider or field has focus
      if ((e.target as Element | null)?.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    },
    sig,
  );
  q(".arrow.l").addEventListener("click", () => step(-1), sig);
  q(".arrow.r").addEventListener("click", () => step(1), sig);

  tabs.forEach((b, j) =>
    b.addEventListener(
      "click",
      () => {
        if (b.classList.contains("on")) return;
        tabs.forEach((t) => t.classList.toggle("on", t === b));
        placePill(b);
        switchCategory(j);
      },
      sig,
    ),
  );

  if (!reduced) {
    cards.forEach((c) => {
      const sheen = c.querySelector<HTMLElement>(".sheen")!;
      c.addEventListener(
        "pointerenter",
        (e) => {
          if (e.pointerType !== "mouse") return;
          sheen.animate([{ transform: "translateX(-110%)" }, { transform: "translateX(110%)" }], { duration: 1000, easing: EASE });
        },
        sig,
      );
    });
  }

  addEventListener(
    "resize",
    () => {
      measure();
      placePill(activeTab(), true);
    },
    sig,
  );

  /* ── Boot ── */
  measure();
  mCur.style.visibility = "hidden";
  ci = Math.max(0, tabs.indexOf(activeTab())); // survive hot-reload remounts
  paintCards();
  placePill(activeTab(), true);
  document.fonts?.ready.then(() => !ac.signal.aborted && placePill(activeTab(), true));
  roll(lnAdd, "Add to bag");
  updateBuy(0);
  raf = requestAnimationFrame(frame);

  return {
    setSize,
    setModel,
    destroy() {
      ac.abort();
      cancelAnimationFrame(raf);
      clearTimeout(addTimer);
      cancelAnims();
      flights.forEach((f) => f.cancel());
    },
  };
}
