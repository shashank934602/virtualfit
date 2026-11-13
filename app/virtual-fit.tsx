"use client";

import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { CATEGORIES, DEFAULT_MODEL, catById, garmentLook, lookStyle, personById, personReady, type AddPayload, type BagLine } from "./vf-data";
import { mount, type EngineApi } from "./vf-engine";
import { BagPanel, FittingPanel, ModelSwitcher, ProfilePanel, Rail, type Booking, type PanelId, type Profile } from "./vf-panels";
import { TintFilter } from "./vf-tint";

/* ───────────────────────── Persistence ───────────────────────── */

const KEY = "virtualfit.v1";
type Saved = { bag: BagLine[]; booking: Booking; profile: Profile; model: string };
const DEFAULT_PROFILE: Profile = { height: 178, fit: "Regular" };

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Saved>;
  } catch {
    return {};
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: state just won't persist */
  }
}

/* ───────────────────────── App ───────────────────────── */

export default function VirtualFit() {
  const apiRef = useRef<EngineApi | null>(null);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<PanelId>(null);
  const [bag, setBag] = useState<BagLine[]>([]);
  const [bump, setBump] = useState(0);
  const [booking, setBooking] = useState<Booking>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [toast, setToast] = useState<(AddPayload & { id: number }) | null>(null);
  const [toastOn, setToastOn] = useState(false);

  // Auto-hide the "Added to bag" toast.
  useEffect(() => {
    if (!toastOn) return;
    const t = setTimeout(() => setToastOn(false), 2800);
    return () => clearTimeout(t);
  }, [toastOn, toast]);

  // Restore saved state once on the client (avoids hydration mismatches).
  useEffect(() => {
    const s = load();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    // older saves have no category: those lines were all Tops
    if (Array.isArray(s.bag)) setBag(s.bag.map((l) => ({ ...l, cat: l.cat ?? "tops" })));
    if (s.booking) setBooking(s.booking);
    if (s.profile) setProfile({ ...DEFAULT_PROFILE, ...s.profile });
    if (s.model && personReady(personById(s.model))) {
      setModelState(s.model);
      apiRef.current?.setModel(s.model);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (ready) save({ bag, booking, profile, model });
  }, [ready, bag, booking, profile, model]);

  const setModel = useCallback((id: string) => {
    setModelState(id);
    apiRef.current?.setModel(id);
  }, []);

  // Esc closes the open panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const onAdd = useCallback((p: AddPayload) => {
    setBag((b) => {
      const i = b.findIndex((l) => l.cat === p.cat && l.idx === p.idx && l.size === p.size && l.color === p.color);
      if (i < 0) return [...b, { ...p, qty: 1 }];
      return b.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l));
    });
    setBump((n) => n + 1);
    setToast({ ...p, id: Date.now() });
    setToastOn(true);
  }, []);

  const setQty = useCallback((i: number, qty: number) => {
    setBag((b) => (qty <= 0 ? b.filter((_, k) => k !== i) : b.map((l, k) => (k === i ? { ...l, qty } : l))));
  }, []);

  const close = useCallback(() => setPanel(null), []);
  const count = bag.reduce((n, l) => n + l.qty, 0);

  return (
    <>
      <Scene onAdd={onAdd} apiRef={apiRef} />

      <Rail panel={panel} setPanel={setPanel} count={count} bump={bump} booked={!!booking} />

      <ModelSwitcher model={model} setModel={setModel} />

      <div className={`toast${toastOn ? " show" : ""}`} role="status" aria-live="polite" inert={!toastOn}>
        {toast && (
          <>
            <span className="tdot" style={{ background: toast.hex }} />
            <span className="ttxt">
              <strong>Added to bag</strong>
              <span>
                {catById(toast.cat).items[toast.idx].n} · {toast.color} · {toast.size}
              </span>
            </span>
            <button
              onClick={() => {
                setPanel("bag");
                setToastOn(false);
              }}
            >
              View bag
            </button>
          </>
        )}
      </div>

      {ready && (
        <>
          <BagPanel open={panel === "bag"} onClose={close} bag={bag} setQty={setQty} clear={() => setBag([])} />
          <FittingPanel open={panel === "fit"} onClose={close} booking={booking} setBooking={setBooking} />
          <ProfilePanel
            open={panel === "profile"}
            onClose={close}
            profile={profile}
            setProfile={setProfile}
            onApply={(s) => apiRef.current?.setSize(s) ?? false}
          />
        </>
      )}
    </>
  );
}

/* ───────────────────────── Scene ─────────────────────────
   Static markup driven imperatively by the engine. Memoised so
   React never re-renders it after mount. */

const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === "l" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);

/** First paint shows Tops; the engine repaints cards when the tab changes. */
const INITIAL_CARDS = [...CATEGORIES[0].items, ...CATEGORIES[0].items];

const Scene = memo(function Scene({
  onAdd,
  apiRef,
}: {
  onAdd: (p: AddPayload) => void;
  apiRef: RefObject<EngineApi | null>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const api = mount(rootRef.current, onAdd);
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, [onAdd, apiRef]);

  return (
    <div ref={rootRef}>
      {/* garment recolour filters: current outfit, incoming outfit, buy thumbnail */}
      <svg className="defs" width="0" height="0" aria-hidden="true">
        <TintFilter id="vf-tc" />
        <TintFilter id="vf-tn" />
        <TintFilter id="vf-tt" />
      </svg>

      <div className="room" aria-hidden="true" />

      <div className="ghost" aria-hidden="true">
        {["F", "I", "T"].map((l, i) => (
          <span key={l} style={{ transform: `translateY(${60 + 30 * i}px)` }}>
            {l}
          </span>
        ))}
      </div>

      <nav className="tabs glass" aria-label="Categories">
        <span className="pill" aria-hidden="true" />
        {CATEGORIES.map((c, i) => (
          <button key={c.id} className={i === 0 ? "on" : undefined}>
            {c.label}
          </button>
        ))}
      </nav>

      <div className="stage">
        <div className="arc">
          {INITIAL_CARDS.map((it, i) => (
            <div key={i} className="card glass" data-i={i} role="button" aria-label={`Try on ${it.n}`}>
              <div className="g" style={lookStyle(garmentLook(CATEGORIES[0], it))} />
              <div className="nm">{it.n}</div>
              <div className="pr">{`$${it.p}`}</div>
              <div className="sheen" />
            </div>
          ))}
        </div>
      </div>

      <div className="model" aria-hidden="true">
        <div id="mCur" className="fig" />
        <div id="mNext" className="fig" />
        <div className="grid" />
        <div className="scan" />
      </div>

      <button className="arrow l glass" aria-label="Previous garment">
        <Chevron dir="l" />
      </button>
      <button className="arrow r glass" aria-label="Next garment">
        <Chevron dir="r" />
      </button>

      <div className="buy glass">
        <div className="thumb">
          <i />
        </div>
        <div className="info">
          <div className="ln name" />
          <div className="ln price" />
        </div>
        <div className="opt size">
          <div className="lab">Size</div>
          {/* size chips are built by the engine per category */}
          <div className="chips" />
        </div>
        <div className="opt color">
          <div className="lab ln clab" />
          <div className="dots" />
        </div>
        <button className="add">
          <span className="ln" />
        </button>
      </div>

      <div className="cur" aria-hidden="true">
        <div className="ring" />
        <div className="cd" />
        <div className="t try">TRY ON</div>
        <div className="t drag">DRAG</div>
      </div>
    </div>
  );
});
